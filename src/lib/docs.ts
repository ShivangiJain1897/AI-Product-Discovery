import { all, get, run, newId, now, tx, j, parse } from "./db";
import { DomainError, assertInProduct } from "./links";
import { logActivity } from "./log";
import { trunc } from "./entities";
import { aiMode } from "./ai/live";
import { liveDoc } from "./ai/doc";
import { getAnalysis, insertRun, baseInputs, analysisSourceIds, type AnalysisRow } from "./analyses";
import { TEMPLATES, emptySections, isEmptyValue, type DocCtx, type Sections, type SectionDef, type SectionValue, type Template } from "./templates";
import { findingStrength } from "./strength";

export type DocData = { answers: Record<string, string>; sections: Sections; prov: Record<string, "scaffold" | "live" | "you">; pending: Record<string, number>; useRecords?: boolean };

export function initialDocData(type: string): DocData {
  const t = TEMPLATES[type];
  return { answers: {}, sections: t ? emptySections(t) : {}, prov: {}, pending: {}, useRecords: true };
}
export function readDocData(a: AnalysisRow): DocData {
  const d = parse<Partial<DocData>>(a.data, {});
  const t = TEMPLATES[a.type];
  return { answers: d.answers ?? {}, sections: { ...(t ? emptySections(t) : {}), ...(d.sections ?? {}) }, prov: d.prov ?? {}, pending: d.pending ?? {}, useRecords: d.useRecords ?? true };
}

/** Coerce arbitrary input into the section's shape and keep it bounded. */
export function normalizeSection(def: SectionDef, v: unknown): SectionValue {
  const str = (x: unknown) => String(x ?? "").slice(0, 8000);
  if (def.kind === "text") return Array.isArray(v) ? v.map(str).join("\n") : typeof v === "object" && v ? "" : str(v);
  if (def.kind === "list") return (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => str(typeof x === "object" ? "" : x).trim()).filter(Boolean).slice(0, 60);
  const tv = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as { columns?: unknown; rows?: unknown };
  const cols = Array.isArray(tv.columns) && tv.columns.length && tv.columns.length <= 12 ? tv.columns.map(str) : def.columns ?? [];
  const rows = (Array.isArray(tv.rows) ? tv.rows : []).slice(0, 60).map((r) => cols.map((_, i) => str(Array.isArray(r) ? r[i] : "")));
  return { columns: cols, rows };
}

export function buildDocCtx(productId: string, a: AnalysisRow): DocCtx {
  const data = readDocData(a);
  const ini = a.initiative_id ? get<any>("SELECT * FROM initiatives WHERE id=?", a.initiative_id) : null;
  const product = get<any>("SELECT name, description, target_users, objectives, context FROM products WHERE id=?", productId)!;
  const scope = ini ? "initiative_id=?" : "1=1";
  const p: unknown[] = ini ? [productId, ini.id] : [productId];
  const use = data.useRecords !== false;
  const findings = use ? all<any>(`SELECT id, statement, segment FROM findings WHERE product_id=? AND ${scope} AND deleted_at IS NULL AND status='accepted' ORDER BY created_at LIMIT 40`, ...p).map((f) => ({ ...f, strength: findingStrength(f.id).level })) : [];
  const opportunities = use ? all<any>(`SELECT id, title, problem, segment, desired_outcome, unknowns FROM opportunities WHERE product_id=? AND ${scope} AND deleted_at IS NULL AND status<>'dismissed'`, ...p) : [];
  const concepts = use ? all<any>(`SELECT id, title, description, intervention_type, tradeoffs, status FROM solution_concepts WHERE product_id=? AND ${scope} AND deleted_at IS NULL`, ...p) : [];
  const assumptions = use ? all<any>(`SELECT id, statement, category, importance, support, status FROM assumptions WHERE product_id=? AND ${scope} AND deleted_at IS NULL`, ...p) : [];
  const decisions = use ? all<any>(`SELECT id, statement, decision_type type, rationale, decided_on date FROM decisions WHERE product_id=? AND ${scope} AND deleted_at IS NULL AND status='active' ORDER BY decided_on DESC`, ...p) : [];
  const sources = analysisSourceIds(a).map((id) => get<any>("SELECT id, title, source_type type, content FROM sources WHERE id=? AND deleted_at IS NULL AND content_kind='text'", id)).filter(Boolean);
  const done = all<AnalysisRow>(`SELECT * FROM analyses WHERE product_id=? AND deleted_at IS NULL AND id<>? ${ini ? "AND initiative_id=?" : "AND 0"}`, ...(ini ? [productId, a.id, ini.id] : [productId, a.id]))
    .map((x) => ({ type: x.type, title: x.title, sections: TEMPLATES[x.type] ? readDocData(x).sections : undefined }));
  const text = ini?.topic_text || ini?.question || a.question || "";
  return {
    topic: { type: ini?.topic_type ?? "question", text, question: ini?.question ?? a.question ?? "", affected: ini?.affected ?? "", outcome: ini?.outcome ?? "", decision: ini?.decision_to_inform ?? "", constraints: ini?.constraints ?? "" },
    product, answers: data.answers, findings, opportunities, concepts, assumptions, decisions, sources, done,
  };
}

export async function generateDoc(productId: string, id: string, input: { answers?: Record<string, string>; useRecords?: boolean } = {}) {
  const a = getAnalysis(productId, id);
  const t = TEMPLATES[a.type];
  if (!t) throw new DomainError("This analysis is not a document workbench.");
  const data = readDocData(a);
  if (input.answers) data.answers = { ...data.answers, ...Object.fromEntries(Object.entries(input.answers).map(([k, v]) => [k, String(v).slice(0, 2000)])) };
  if (input.useRecords !== undefined) data.useRecords = input.useRecords;
  run("UPDATE analyses SET data=?, updated_at=? WHERE id=?", j(data), now(), id);
  const fresh = getAnalysis(productId, id);
  const ctx = buildDocCtx(productId, fresh);
  if (t.usesSources === "core" && ctx.sources.length === 0) throw new DomainError("Choose the evidence to use first.");
  const mode = aiMode();
  let gen: { sections: Record<string, unknown>; uncertainties: string[]; notes: string[] };
  if (mode === "live") {
    const r = await liveDoc(t, ctx);
    gen = { sections: r.sections, uncertainties: r.uncertainties, notes: [...r.notes, ...(r.droppedCitations ? [`${r.droppedCitations} citation(s) could not be verified against your sources and were not trusted.`] : [])] };
  } else gen = t.generate(ctx);
  const drafted: Sections = {};
  for (const s of t.sections) if (s.key in gen.sections) drafted[s.key] = normalizeSection(s, gen.sections[s.key]);
  // strip reference tokens that don't resolve inside this product
  const valid = (tok: string) => { const [type, rid] = tok.split(":"); return !!entityInProduct(productId, type, rid); };
  const clean = (s: string) => s.replace(/\[\[([a-z_]+:[A-Za-z0-9_]+)\]\]/g, (m, tok) => (valid(tok) ? m : ""));
  for (const k of Object.keys(drafted)) {
    const v = drafted[k];
    drafted[k] = typeof v === "string" ? clean(v) : Array.isArray(v) ? v.map(clean) : { columns: v.columns, rows: v.rows.map((r) => r.map(clean)) };
  }
  return tx(() => {
    const sourceIds = ctx.sources.map((s) => s.id);
    const r = insertRun(fresh, mode === "live" ? "live" : "demo", baseInputs(fresh, sourceIds, { answers: data.answers, useRecords: data.useRecords }), {
      summary: [{ label: "Sections drafted", value: String(Object.keys(drafted).filter((k) => !isEmptyValue(drafted[k])).length) }, { label: "Produced by", value: mode === "live" ? "Live model" : "Scaffold from your records (demo mode)" }],
      items: t.sections.filter((s) => !isEmptyValue(drafted[s.key])).map((s) => s.title),
      detail: { sections: drafted, uncertainties: gen.uncertainties, notes: gen.notes, mode },
    });
    const cur = readDocData(getAnalysis(productId, id));
    const kept: string[] = [];
    for (const s of t.sections) {
      if (!(s.key in drafted)) continue;
      const mine = cur.prov[s.key] === "you" && !isEmptyValue(cur.sections[s.key]);
      if (mine) { cur.pending[s.key] = r.seq; kept.push(s.title); }
      else { cur.sections[s.key] = drafted[s.key]; cur.prov[s.key] = mode === "live" ? "live" : "scaffold"; delete cur.pending[s.key]; }
    }
    run("UPDATE analyses SET data=?, status=CASE WHEN status='draft' THEN 'in_progress' ELSE status END, updated_at=? WHERE id=?", j(cur), now(), id);
    logActivity(productId, { initiativeId: fresh.initiative_id, analysisId: id, kind: "run", entityType: "analysis", entityId: id, summary: `Drafted ${t.label.toLowerCase()}: ${trunc(fresh.title)}${kept.length ? ` (kept your edits in ${kept.length} section(s))` : ""}` });
    return { runId: r.id, seq: r.seq, keptEdited: kept };
  });
}

function entityInProduct(productId: string, type: string, id: string): boolean {
  const table: Record<string, string> = { finding: "findings", opportunity: "opportunities", concept: "solution_concepts", assumption: "assumptions", decision: "decisions", experiment: "experiments", source: "sources" };
  const t = table[type]; if (!t || !id) return false;
  return !!get(`SELECT 1 x FROM ${t} WHERE id=? AND product_id=?`, id, productId);
}

/** Adopt a run's draft for chosen sections. Idempotent; never silently replaces edits (callers choose explicitly). */
export function applyDraft(productId: string, id: string, seq: number, keys: string[]) {
  const a = getAnalysis(productId, id);
  const t = TEMPLATES[a.type];
  if (!t) throw new DomainError("Not a document workbench.");
  const r = get<{ results: string }>("SELECT results FROM analysis_runs WHERE analysis_id=? AND seq=?", id, seq);
  if (!r) throw new DomainError("Run not found", "not_found");
  const drafted = parse<any>(r.results, {}).detail?.sections as Sections | undefined;
  if (!drafted) throw new DomainError("That run has no draft.");
  const cur = readDocData(a);
  const prov = parse<any>(r.results, {}).detail?.mode === "live" ? "live" : "scaffold";
  for (const k of keys) { if (!(k in drafted)) continue; cur.sections[k] = drafted[k]; cur.prov[k] = prov; delete cur.pending[k]; }
  run("UPDATE analyses SET data=?, updated_at=? WHERE id=?", j(cur), now(), id);
}
export function keepMine(productId: string, id: string, keys: string[]) {
  const a = getAnalysis(productId, id); const cur = readDocData(a);
  for (const k of keys) delete cur.pending[k];
  run("UPDATE analyses SET data=?, updated_at=? WHERE id=?", j(cur), now(), id);
}

export function saveSection(productId: string, id: string, key: string, value: unknown) {
  const a = getAnalysis(productId, id);
  const t = TEMPLATES[a.type]; const def = t?.sections.find((s) => s.key === key);
  if (!t || !def) throw new DomainError("Unknown section.");
  const cur = readDocData(a);
  const next = normalizeSection(def, value);
  if (JSON.stringify(next) === JSON.stringify(cur.sections[key])) return;
  cur.sections[key] = next; cur.prov[key] = "you";
  run("UPDATE analyses SET data=?, updated_at=? WHERE id=?", j(cur), now(), id);
}
export function saveAnswers(productId: string, id: string, answers: Record<string, string>) {
  const a = getAnalysis(productId, id);
  const cur = readDocData(a);
  cur.answers = { ...cur.answers, ...Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, String(v).slice(0, 2000)])) };
  run("UPDATE analyses SET data=?, updated_at=? WHERE id=?", j(cur), now(), id);
}

export type { Template };
