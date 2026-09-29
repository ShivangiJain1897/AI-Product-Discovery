// Read side. Every function takes a productId and filters by it, so product boundaries
// are enforced in queries, not just in the interface.
import { all, get, parse } from "./db";
import { DomainError, assertInProduct, linksFrom, linksTo } from "./links";
import { findingStrength, type StrengthInfo } from "./strength";
import { labelOf, listTrash, trunc } from "./entities";
import { analysisFreshness, type AnalysisRow } from "./analyses";
import { computeScore, productDims, suggestEvidenceValue } from "./priority";
import { ANALYSIS_TYPES, type EntityType } from "./types";

// Rows come straight from SQLite; shapes are defined by src/lib/schema.ts.
export type Row = any;

export function getProduct(id: string) {
  const p = get<Row>("SELECT * FROM products WHERE id=?", id);
  if (!p) throw new DomainError("Product not found", "not_found");
  return p;
}
export function getInitiative(productId: string, id: string) {
  const i = get<Row>("SELECT * FROM initiatives WHERE id=? AND product_id=?", id, productId);
  if (!i) throw new DomainError("Initiative not found in this product", "not_found");
  return { ...i, plan: parse<any>(i.plan, null) };
}

export function attention(productId: string) {
  const experimentsToInterpret = all<Row>("SELECT id, title, initiative_id FROM experiments WHERE product_id=? AND deleted_at IS NULL AND results<>'' AND interpretation=''", productId);
  const findingsToReview = all<Row>("SELECT id, statement, review_reason, initiative_id FROM findings WHERE product_id=? AND deleted_at IS NULL AND needs_review=1", productId);
  const decisionsToReview = all<Row>("SELECT id, statement, review_reason, initiative_id FROM decisions WHERE product_id=? AND deleted_at IS NULL AND needs_review=1", productId);
  const outdated = all<AnalysisRow>("SELECT * FROM analyses WHERE product_id=? AND deleted_at IS NULL", productId)
    .map((a) => ({ a, f: analysisFreshness(a) })).filter((x) => x.f.outdated);
  const openExperiments = all<Row>("SELECT id, title, status, initiative_id FROM experiments WHERE product_id=? AND deleted_at IS NULL AND status IN ('planned','running')", productId);
  return { experimentsToInterpret, findingsToReview, decisionsToReview, outdatedAnalyses: outdated.map(({ a, f }) => ({ id: a.id, title: a.title, reasons: f.reasons, initiative_id: a.initiative_id })), openExperiments };
}

export function listProducts(includeArchived = false) {
  const rows = all<Row>(`SELECT * FROM products ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY COALESCE(last_opened_at, created_at) DESC`);
  return rows.map((p) => {
    const a = attention(p.id);
    return {
      ...p,
      activeInitiatives: all<Row>("SELECT id, title, status FROM initiatives WHERE product_id=? AND status='active' ORDER BY updated_at DESC", p.id),
      lastActivity: get<Row>("SELECT summary, created_at FROM activity WHERE product_id=? ORDER BY created_at DESC LIMIT 1", p.id),
      attention: a,
      attentionCount: a.experimentsToInterpret.length + a.findingsToReview.length + a.decisionsToReview.length + a.outdatedAnalyses.length,
    };
  });
}

export function listInitiatives(productId: string) {
  return all<Row>("SELECT * FROM initiatives WHERE product_id=? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, updated_at DESC", productId).map((i) => ({
    ...i,
    counts: {
      sources: get<Row>("SELECT COUNT(*) n FROM initiative_sources x JOIN sources s ON s.id=x.source_id WHERE x.initiative_id=? AND s.deleted_at IS NULL", i.id)!.n,
      findings: get<Row>("SELECT COUNT(*) n FROM findings WHERE initiative_id=? AND deleted_at IS NULL AND status='accepted'", i.id)!.n,
      opportunities: get<Row>("SELECT COUNT(*) n FROM opportunities WHERE initiative_id=? AND deleted_at IS NULL", i.id)!.n,
      experiments: get<Row>("SELECT COUNT(*) n FROM experiments WHERE initiative_id=? AND deleted_at IS NULL", i.id)!.n,
      decisions: get<Row>("SELECT COUNT(*) n FROM decisions WHERE initiative_id=? AND deleted_at IS NULL", i.id)!.n,
    },
  }));
}

// ---------- sources ----------
export function listSources(productId: string, o: { initiativeId?: string; q?: string; type?: string } = {}) {
  let sql = "SELECT s.* FROM sources s WHERE s.product_id=? AND s.deleted_at IS NULL";
  const p: unknown[] = [productId];
  if (o.initiativeId) { sql += " AND s.id IN (SELECT source_id FROM initiative_sources WHERE initiative_id=?)"; p.push(o.initiativeId); }
  if (o.type) { sql += " AND s.source_type=?"; p.push(o.type); }
  if (o.q) { sql += " AND (s.title LIKE ? OR s.content LIKE ? OR s.tags LIKE ? OR s.participant LIKE ?)"; const l = `%${o.q}%`; p.push(l, l, l, l); }
  sql += " ORDER BY COALESCE(s.source_date, s.imported_at) DESC";
  return all<Row>(sql, ...p).map((s) => ({
    ...s, tags: parse<string[]>(s.tags, []), length: s.content.length, content: undefined as unknown as string,
    excerptCount: get<Row>("SELECT COUNT(*) n FROM excerpts WHERE source_id=?", s.id)!.n,
    initiatives: all<Row>("SELECT i.id, i.title FROM initiative_sources x JOIN initiatives i ON i.id=x.initiative_id WHERE x.source_id=?", s.id),
  }));
}

export type ExcerptView = {
  id: string; text: string; source_id: string; source_title: string; source_version: number; current_version: number;
  participant: string; segment: string; status: string; start_offset: number | null; end_offset: number | null; row_ref: any;
  findingLinks: { findingId: string; relation: string; statement: string }[];
};
export function excerptView(id: string): ExcerptView | null {
  const e = get<Row>("SELECT e.*, s.title st, s.version cv, s.participant, s.segment FROM excerpts e JOIN sources s ON s.id=e.source_id WHERE e.id=?", id);
  if (!e) return null;
  return {
    id: e.id, text: e.text, source_id: e.source_id, source_title: e.st, source_version: e.source_version, current_version: e.cv,
    participant: e.participant, segment: e.segment, status: e.status, start_offset: e.start_offset, end_offset: e.end_offset, row_ref: parse(e.row_ref, null),
    findingLinks: all<Row>("SELECT l.to_id, l.relation, f.statement FROM links l JOIN findings f ON f.id=l.to_id WHERE l.from_type='excerpt' AND l.from_id=? AND l.to_type='finding' AND f.deleted_at IS NULL", id)
      .map((r) => ({ findingId: r.to_id, relation: r.relation, statement: r.statement })),
  };
}

export function getSourceFull(productId: string, id: string) {
  assertInProduct(productId, "source", id);
  const s = get<Row>("SELECT * FROM sources WHERE id=?", id)!;
  const excerpts = all<Row>("SELECT id FROM excerpts WHERE source_id=? ORDER BY COALESCE(start_offset, 0), created_at", id).map((r) => excerptView(r.id)!);
  return {
    ...s, tags: parse<string[]>(s.tags, []), excerpts,
    observations: all<Row>("SELECT * FROM observations WHERE source_id=? AND deleted_at IS NULL ORDER BY created_at", id),
    versions: all<Row>("SELECT version, title, change_note, created_at, LENGTH(content) length FROM source_versions WHERE source_id=? ORDER BY version DESC", id),
    initiatives: all<Row>("SELECT i.id, i.title FROM initiative_sources x JOIN initiatives i ON i.id=x.initiative_id WHERE x.source_id=?", id),
    analyses: all<Row>("SELECT a.id, a.title, a.type FROM analysis_sources x JOIN analyses a ON a.id=x.analysis_id WHERE x.source_id=? AND a.deleted_at IS NULL", id),
  };
}

// ---------- findings ----------
export type FindingView = Row & { strength: StrengthInfo; supporting: ExcerptView[]; contradicting: ExcerptView[]; opportunities: Row[]; dataRefs: Row[] };
export function findingView(f: Row): FindingView {
  const ex = all<Row>("SELECT from_id, relation FROM links WHERE to_type='finding' AND to_id=? AND from_type='excerpt'", f.id);
  const views = ex.map((l) => ({ v: excerptView(l.from_id), rel: l.relation })).filter((x) => x.v && !get("SELECT 1 x FROM sources WHERE id=? AND deleted_at IS NOT NULL", x.v.source_id));
  return {
    ...f, strength: findingStrength(f.id),
    supporting: views.filter((x) => x.rel === "supports").map((x) => x.v!),
    contradicting: views.filter((x) => x.rel === "contradicts").map((x) => x.v!),
    opportunities: all<Row>("SELECT o.id, o.title FROM links l JOIN opportunities o ON o.id=l.to_id WHERE l.from_type='finding' AND l.from_id=? AND l.to_type='opportunity' AND o.deleted_at IS NULL", f.id),
    dataRefs: all<Row>("SELECT l.from_id run_id, l.note FROM links l WHERE l.to_type='finding' AND l.to_id=? AND l.from_type='analysis_run' AND l.relation='derived_from'", f.id).map((r) => {
      const run = get<Row>("SELECT r.seq, a.id analysis_id, a.title FROM analysis_runs r JOIN analyses a ON a.id=r.analysis_id WHERE r.id=?", r.run_id);
      return { ...r, ...run, ref: parse<any>(r.note, {}) };
    }),
  };
}
export function listFindings(productId: string, o: { initiativeId?: string; status?: string; q?: string; segment?: string } = {}) {
  let sql = "SELECT * FROM findings WHERE product_id=? AND deleted_at IS NULL";
  const p: unknown[] = [productId];
  if (o.initiativeId) { sql += " AND initiative_id=?"; p.push(o.initiativeId); }
  if (o.status) { sql += " AND status=?"; p.push(o.status); }
  if (o.segment) { sql += " AND segment=?"; p.push(o.segment); }
  if (o.q) { sql += " AND (statement LIKE ? OR interpretation LIKE ?)"; p.push(`%${o.q}%`, `%${o.q}%`); }
  return all<Row>(sql + " ORDER BY created_at DESC", ...p).map(findingView);
}
export function getFinding(productId: string, id: string) {
  assertInProduct(productId, "finding", id);
  return findingView(get<Row>("SELECT * FROM findings WHERE id=?", id)!);
}

// ---------- opportunities & solutions ----------
export function listOpportunities(productId: string, initiativeId?: string) {
  const dims = productDims(productId);
  const rows = all<Row>(`SELECT * FROM opportunities WHERE product_id=? AND deleted_at IS NULL ${initiativeId ? "AND initiative_id=?" : ""} ORDER BY created_at`, ...(initiativeId ? [productId, initiativeId] : [productId]));
  return rows.map((o) => {
    const scores = parse<Record<string, number | null>>(o.scores, {});
    const sc = computeScore(dims, scores);
    return {
      ...o, scores, calc: sc, suggestedEvidence: suggestEvidenceValue(o.id),
      findings: all<Row>("SELECT f.id, f.statement, f.status FROM links l JOIN findings f ON f.id=l.from_id WHERE l.to_type='opportunity' AND l.to_id=? AND l.from_type='finding' AND f.deleted_at IS NULL", o.id).map((f) => ({ ...f, strength: findingStrength(f.id) })),
      concepts: all<Row>("SELECT c.* FROM links l JOIN solution_concepts c ON c.id=l.to_id WHERE l.from_type='opportunity' AND l.from_id=? AND l.to_type='concept' AND c.deleted_at IS NULL", o.id),
      processSteps: all<Row>("SELECT n.id, n.name, m.id map_id, m.name map_name FROM links l JOIN process_nodes n ON n.id=l.to_id JOIN process_maps m ON m.id=n.map_id WHERE l.from_type='opportunity' AND l.from_id=? AND l.to_type='process_node' AND m.deleted_at IS NULL", o.id),
      metricRefs: all<Row>("SELECT l.from_id run_id, l.note FROM links l WHERE l.to_type='opportunity' AND l.to_id=? AND l.from_type='analysis_run'", o.id).map((r) => ({ run_id: r.run_id, ...parse<any>(r.note, {}) })),
    };
  });
}
export function listConcepts(productId: string, initiativeId?: string) {
  return all<Row>(`SELECT * FROM solution_concepts WHERE product_id=? AND deleted_at IS NULL ${initiativeId ? "AND initiative_id=?" : ""} ORDER BY created_at`, ...(initiativeId ? [productId, initiativeId] : [productId])).map((c) => ({
    ...c,
    opportunities: all<Row>("SELECT o.id, o.title FROM links l JOIN opportunities o ON o.id=l.from_id WHERE l.to_type='concept' AND l.to_id=? AND l.from_type='opportunity' AND o.deleted_at IS NULL", c.id),
    assumptions: all<Row>("SELECT a.id, a.statement, a.status, a.importance, a.support FROM links l JOIN assumptions a ON a.id=l.to_id WHERE l.from_type='concept' AND l.from_id=? AND l.to_type='assumption' AND a.deleted_at IS NULL", c.id),
  }));
}
export function listAssumptions(productId: string, initiativeId?: string) {
  return all<Row>(`SELECT * FROM assumptions WHERE product_id=? AND deleted_at IS NULL ${initiativeId ? "AND initiative_id=?" : ""} ORDER BY created_at`, ...(initiativeId ? [productId, initiativeId] : [productId])).map((a) => ({
    ...a,
    concepts: all<Row>("SELECT c.id, c.title FROM links l JOIN solution_concepts c ON c.id=l.from_id WHERE l.to_type='assumption' AND l.to_id=? AND l.from_type='concept' AND c.deleted_at IS NULL", a.id),
    opportunities: all<Row>("SELECT o.id, o.title FROM links l JOIN opportunities o ON o.id=l.from_id WHERE l.to_type='assumption' AND l.to_id=? AND l.from_type='opportunity' AND o.deleted_at IS NULL", a.id),
    experiments: all<Row>("SELECT e.id, e.title, e.status, e.outcome FROM links l JOIN experiments e ON e.id=l.to_id WHERE l.from_type='assumption' AND l.from_id=? AND l.to_type='experiment' AND e.deleted_at IS NULL", a.id),
  }));
}
export function listExperiments(productId: string, o: { initiativeId?: string; status?: string } = {}) {
  let sql = "SELECT * FROM experiments WHERE product_id=? AND deleted_at IS NULL"; const p: unknown[] = [productId];
  if (o.initiativeId) { sql += " AND initiative_id=?"; p.push(o.initiativeId); }
  if (o.status) { sql += " AND status=?"; p.push(o.status); }
  return all<Row>(sql + " ORDER BY created_at DESC", ...p).map((e) => ({
    ...e,
    assumptions: all<Row>("SELECT a.id, a.statement FROM links l JOIN assumptions a ON a.id=l.from_id WHERE l.to_type='experiment' AND l.to_id=? AND l.from_type='assumption' AND a.deleted_at IS NULL", e.id),
    concepts: all<Row>("SELECT c.id, c.title FROM links l JOIN solution_concepts c ON c.id=l.from_id WHERE l.to_type='experiment' AND l.to_id=? AND l.from_type='concept' AND c.deleted_at IS NULL", e.id),
    initiative: e.initiative_id ? get<Row>("SELECT id, title FROM initiatives WHERE id=?", e.initiative_id) : null,
  }));
}
export function listDecisions(productId: string, initiativeId?: string) {
  return all<Row>(`SELECT * FROM decisions WHERE product_id=? AND deleted_at IS NULL ${initiativeId ? "AND initiative_id=?" : ""} ORDER BY decided_on DESC, created_at DESC`, ...(initiativeId ? [productId, initiativeId] : [productId])).map((d) => ({
    ...d, evidence_snapshot: parse<any[]>(d.evidence_snapshot, []), trace: traceDecision(productId, d.id),
    initiative: d.initiative_id ? get<Row>("SELECT id, title FROM initiatives WHERE id=?", d.initiative_id) : null,
  }));
}

// ---------- decision trace ----------
export type Trace = {
  findings: { id: string; statement: string; excerpts: { id: string; text: string; source_id: string; source_title: string; version: number; current: number; status: string }[] }[];
  opportunities: { id: string; title: string }[]; experiments: { id: string; title: string; outcome: string | null }[];
  runs: { id: string; analysis_id: string; analysis_title: string; seq: number; sources: { id: string; title: string; version: number; current: number }[]; mode: string }[];
};
/** Everything a decision rests on, following relationships backwards, with exact source versions. */
export function traceDecision(productId: string, decisionId: string): Trace {
  const seenF = new Map<string, Trace["findings"][number]>();
  const opps = new Map<string, { id: string; title: string }>(); const exps = new Map<string, any>(); const runs = new Map<string, any>();
  const addFinding = (id: string) => {
    if (seenF.has(id)) return;
    const f = get<Row>("SELECT id, statement FROM findings WHERE id=? AND product_id=? AND deleted_at IS NULL", id, productId);
    if (!f) return;
    const excerpts = all<Row>("SELECT e.id, e.text, e.source_id, e.source_version, e.status, s.title, s.version cur FROM links l JOIN excerpts e ON e.id=l.from_id JOIN sources s ON s.id=e.source_id WHERE l.to_type='finding' AND l.to_id=? AND l.from_type='excerpt' AND l.relation='supports' AND s.deleted_at IS NULL", id)
      .map((e) => ({ id: e.id, text: e.text, source_id: e.source_id, source_title: e.title, version: e.source_version, current: e.cur, status: e.status }));
    seenF.set(id, { id: f.id, statement: f.statement, excerpts });
    for (const r of linksTo("finding", id, "analysis_run")) addRun(r.from_id);
  };
  const addRun = (id: string) => {
    if (runs.has(id)) return;
    const r = get<Row>("SELECT r.*, a.title, a.id aid FROM analysis_runs r JOIN analyses a ON a.id=r.analysis_id WHERE r.id=? AND a.product_id=? AND a.deleted_at IS NULL", id, productId);
    if (!r) return;
    const inp = parse<any>(r.inputs, { sources: [] });
    runs.set(id, { id, analysis_id: r.aid, analysis_title: r.title, seq: r.seq, mode: r.mode, sources: (inp.sources ?? []).map((s: any) => ({ ...s, current: get<Row>("SELECT version FROM sources WHERE id=?", s.id)?.version ?? s.version })) });
  };
  const addOpp = (id: string) => {
    const o = get<Row>("SELECT id, title FROM opportunities WHERE id=? AND product_id=? AND deleted_at IS NULL", id, productId);
    if (!o || opps.has(id)) return;
    opps.set(id, o as any);
    for (const l of linksTo("opportunity", id)) { if (l.from_type === "finding") addFinding(l.from_id); if (l.from_type === "analysis_run") addRun(l.from_id); }
  };
  const addExp = (id: string) => {
    const e = get<Row>("SELECT id, title, outcome FROM experiments WHERE id=? AND product_id=? AND deleted_at IS NULL", id, productId);
    if (!e || exps.has(id)) return;
    exps.set(id, e);
  };
  for (const l of linksTo("decision", decisionId)) {
    if (l.from_type === "finding") addFinding(l.from_id);
    else if (l.from_type === "opportunity") addOpp(l.from_id);
    else if (l.from_type === "experiment") addExp(l.from_id);
    else if (l.from_type === "analysis_run") addRun(l.from_id);
    else if (l.from_type === "concept") for (const o of linksTo("concept", l.from_id, "opportunity")) addOpp(o.from_id);
  }
  return { findings: [...seenF.values()], opportunities: [...opps.values()], experiments: [...exps.values()], runs: [...runs.values()] };
}

// ---------- analyses ----------
export function listAnalyses(productId: string, o: { type?: string; initiativeId?: string; status?: string; since?: string; q?: string; standalone?: boolean } = {}) {
  let sql = "SELECT * FROM analyses WHERE product_id=? AND deleted_at IS NULL"; const p: unknown[] = [productId];
  if (o.type) { sql += " AND type=?"; p.push(o.type); }
  if (o.initiativeId) { sql += " AND initiative_id=?"; p.push(o.initiativeId); }
  if (o.standalone) sql += " AND initiative_id IS NULL";
  if (o.status) { sql += " AND status=?"; p.push(o.status); }
  if (o.since) { sql += " AND updated_at>=?"; p.push(o.since); }
  if (o.q) { sql += " AND (title LIKE ? OR question LIKE ? OR notes LIKE ?)"; p.push(`%${o.q}%`, `%${o.q}%`, `%${o.q}%`); }
  return all<AnalysisRow>(sql + " ORDER BY updated_at DESC", ...p).map((a) => ({
    ...a, typeLabel: ANALYSIS_TYPES[a.type]?.label ?? a.type, freshness: analysisFreshness(a),
    runCount: get<Row>("SELECT COUNT(*) n FROM analysis_runs WHERE analysis_id=?", a.id)!.n,
    initiative: a.initiative_id ? get<Row>("SELECT id, title FROM initiatives WHERE id=?", a.initiative_id) : null,
  }));
}

export function listMaps(productId: string, initiativeId?: string) {
  return all<Row>(`SELECT m.*, (SELECT COUNT(*) FROM process_nodes n WHERE n.map_id=m.id) nodes FROM process_maps m WHERE m.product_id=? AND m.deleted_at IS NULL ${initiativeId ? "AND m.initiative_id=?" : ""} ORDER BY m.kind, m.created_at`, ...(initiativeId ? [productId, initiativeId] : [productId]));
}

// ---------- links & activity ----------
export function related(type: EntityType, id: string) {
  const out: { linkId: string; relation: string; direction: "in" | "out"; type: EntityType; id: string; label: string }[] = [];
  for (const l of linksFrom(type, id)) { const o = labelOf(l.to_type, l.to_id); if (o && !o.deleted) out.push({ linkId: l.id, relation: l.relation, direction: "out", type: l.to_type, id: l.to_id, label: o.label }); }
  for (const l of linksTo(type, id)) { const o = labelOf(l.from_type, l.from_id); if (o && !o.deleted) out.push({ linkId: l.id, relation: l.relation, direction: "in", type: l.from_type, id: l.from_id, label: o.label }); }
  return out;
}

export function activityList(productId: string, o: { initiativeId?: string; limit?: number; kind?: string } = {}) {
  let sql = "SELECT * FROM activity WHERE product_id=?"; const p: unknown[] = [productId];
  if (o.initiativeId) { sql += " AND initiative_id=?"; p.push(o.initiativeId); }
  if (o.kind) { sql += " AND kind=?"; p.push(o.kind); }
  return all<Row>(sql + " ORDER BY created_at DESC, rowid DESC LIMIT ?", ...p, o.limit ?? 50);
}

// ---------- search ----------
export type Hit = { type: string; id: string; title: string; snippet: string; initiativeId?: string | null; sourceId?: string };
export function searchProduct(productId: string, q: string): Hit[] {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const hits: Hit[] = [];
  const snip = (text: string) => {
    const i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i < 0) return trunc(text, 140);
    const s = Math.max(0, i - 50); return (s > 0 ? "…" : "") + text.slice(s, i + term.length + 90).replace(/\s+/g, " ") + "…";
  };
  for (const r of all<Row>("SELECT id, title, content FROM sources WHERE product_id=? AND deleted_at IS NULL AND (title LIKE ? OR content LIKE ? OR participant LIKE ?) LIMIT 15", productId, like, like, like)) hits.push({ type: "source", id: r.id, title: r.title, snippet: snip(r.content) });
  for (const r of all<Row>("SELECT id, statement, interpretation, initiative_id FROM findings WHERE product_id=? AND deleted_at IS NULL AND (statement LIKE ? OR interpretation LIKE ?) LIMIT 15", productId, like, like)) hits.push({ type: "finding", id: r.id, title: r.statement, snippet: snip(r.interpretation || r.statement), initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, title, problem, initiative_id FROM opportunities WHERE product_id=? AND deleted_at IS NULL AND (title LIKE ? OR problem LIKE ?) LIMIT 10", productId, like, like)) hits.push({ type: "opportunity", id: r.id, title: r.title, snippet: snip(r.problem || r.title), initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, title, description, initiative_id FROM solution_concepts WHERE product_id=? AND deleted_at IS NULL AND (title LIKE ? OR description LIKE ?) LIMIT 10", productId, like, like)) hits.push({ type: "concept", id: r.id, title: r.title, snippet: snip(r.description || r.title), initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, statement, category, initiative_id FROM assumptions WHERE product_id=? AND deleted_at IS NULL AND statement LIKE ? LIMIT 10", productId, like)) hits.push({ type: "assumption", id: r.id, title: r.statement, snippet: r.category, initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, title, hypothesis, results, initiative_id FROM experiments WHERE product_id=? AND deleted_at IS NULL AND (title LIKE ? OR hypothesis LIKE ? OR results LIKE ?) LIMIT 10", productId, like, like, like)) hits.push({ type: "experiment", id: r.id, title: r.title, snippet: snip(r.results || r.hypothesis), initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, statement, rationale, initiative_id FROM decisions WHERE product_id=? AND deleted_at IS NULL AND (statement LIKE ? OR rationale LIKE ?) LIMIT 10", productId, like, like)) hits.push({ type: "decision", id: r.id, title: r.statement, snippet: snip(r.rationale || r.statement), initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, title, question, initiative_id FROM analyses WHERE product_id=? AND deleted_at IS NULL AND (title LIKE ? OR question LIKE ? OR notes LIKE ?) LIMIT 10", productId, like, like, like)) hits.push({ type: "analysis", id: r.id, title: r.title, snippet: snip(r.question || r.title), initiativeId: r.initiative_id });
  for (const r of all<Row>("SELECT id, title, question FROM initiatives WHERE product_id=? AND (title LIKE ? OR question LIKE ?) LIMIT 10", productId, like, like)) hits.push({ type: "initiative", id: r.id, title: r.title, snippet: snip(r.question || r.title), initiativeId: r.id });
  return hits;
}

export { listTrash };

// ---------- opportunity tree ----------
export function opportunityTree(productId: string, initiativeId: string) {
  const init = getInitiative(productId, initiativeId);
  const opps = listOpportunities(productId, initiativeId);
  const concepts = listConcepts(productId, initiativeId);
  const exps = listExperiments(productId, { initiativeId });
  return {
    outcome: init.outcome || "(desired outcome not set)",
    opportunities: opps.filter((o) => o.status !== "dismissed").map((o) => ({
      id: o.id, title: o.title,
      concepts: concepts.filter((c) => c.opportunities.some((x: Row) => x.id === o.id)).map((c) => ({
        id: c.id, title: c.title,
        experiments: exps.filter((e) => e.concepts.some((x: Row) => x.id === c.id) || e.assumptions.some((a: Row) => c.assumptions.some((ca: Row) => ca.id === a.id))).map((e) => ({ id: e.id, title: e.title, status: e.status, outcome: e.outcome })),
      })),
    })),
  };
}
