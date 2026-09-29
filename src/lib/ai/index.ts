import { all, get, run, newId, now, tx, j, parse } from "../db";
import { DomainError, assertInProduct, entityProduct, link } from "../links";
import { logActivity } from "../log";
import { trunc, createEntity, updateEntity } from "../entities";
import { createExcerpt, linkExcerptToFinding, locateQuote } from "../evidence";
import { addEdge, addNode, autoLayout, createMap, updateNode, insertNode } from "../process";
import { buildContext, type Ctx, type Scope } from "./context";
import { demoProposal, demoPlan, type Plan } from "./demo";
import { aiMode, liveProposal, livePlan } from "./live";
import { ITEM_SCHEMAS, Envelope, type Kind, type Proposal, type Rejected, type Ref } from "./schemas";
import { strengthFor } from "../strength";

export { aiMode } from "./live";

/** Verify every reference in a proposal. Invalid items are rejected, never saved. */
export function validateProposal(kind: Kind, raw: unknown, ctx: Ctx, mode: "live" | "demo"): { proposal: Proposal; rejected: Rejected[] } {
  const env = Envelope.parse(raw);
  const schema = ITEM_SCHEMAS[kind];
  const rejected: Rejected[] = [];
  const byId = new Map(ctx.sources.map((s) => [s.id, s]));
  const checkRef = (r: Ref): string | null => {
    const s = byId.get(r.sourceId);
    if (!s) return `unknown source “${r.sourceId}” (not in the selected scope)`;
    if (s.kind === "csv") return locateQuote(s.content, r.quote) ? null : "quote not found in the source";
    return locateQuote(s.content, r.quote) ? null : `quote is not present verbatim in “${s.title}”`;
  };
  const checkId = (type: any, id?: string): string | null => {
    if (!id) return null;
    const p = entityProduct(type, id);
    return p === ctx.productId ? null : `${type} “${id}” does not exist in this product`;
  };
  const items: any[] = [];
  env.items.forEach((it, index) => {
    const parsed = schema.safeParse(it);
    const label = String((it as any)?.statement ?? (it as any)?.title ?? (it as any)?.name ?? `item ${index + 1}`).slice(0, 80);
    if (!parsed.success) { rejected.push({ index, label, reason: "does not match the required structure" }); return; }
    const v: any = parsed.data;
    let bad: string | null = null;
    if (kind === "synthesis") {
      v.supporting = v.supporting.filter((r: Ref) => { const e = checkRef(r); if (e) bad ??= e; return !e; });
      const dropped = bad;
      v.contradicting = v.contradicting.filter((r: Ref) => !checkRef(r));
      if (!v.supporting.length) { rejected.push({ index, label, reason: dropped ? `no verifiable supporting excerpt — ${dropped}` : "no supporting excerpt was provided" }); return; }
      v.strengthPreview = strengthFor([
        ...v.supporting.map((r: Ref) => ({ relation: "supports", source_id: r.sourceId, participant: byId.get(r.sourceId)!.participant, segment: byId.get(r.sourceId)!.segment })),
        ...v.contradicting.map((r: Ref) => ({ relation: "contradicts", source_id: r.sourceId, participant: byId.get(r.sourceId)!.participant, segment: byId.get(r.sourceId)!.segment })),
      ]);
    } else if (kind === "process_draft") {
      const refs: Ref[] = v.refs; const good = refs.filter((r) => !checkRef(r));
      v.refs = good;
      if (v.support === "evidence" && good.length === 0) { v.support = "inferred"; v.downgraded = true; }
    } else if (kind === "opportunities") {
      bad = (v.findingIds as string[]).map((id) => checkId("finding", id)).find(Boolean) ?? null;
    } else if (kind === "concepts") bad = checkId("opportunity", v.opportunityId);
    else if (kind === "assumptions") bad = checkId("concept", v.conceptId) ?? checkId("opportunity", v.opportunityId);
    else if (kind === "experiment") bad = (v.assumptionIds as string[]).map((id) => checkId("assumption", id)).find(Boolean) ?? checkId("concept", v.conceptId) ?? null;
    else if (kind === "challenge") bad = checkId(v.targetType, v.targetId);
    if (bad) { rejected.push({ index, label, reason: bad }); return; }
    items.push(v);
  });
  if (kind === "process_draft") {
    const ids = new Set(items.map((i) => i.tempId));
    env.edges = env.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }
  return { proposal: { kind, mode, title: env.title, summary: env.summary, items, edges: env.edges, notes: env.notes as any, assumptions: env.assumptions, uncertainties: env.uncertainties, followUps: env.followUps }, rejected };
}

const NEEDS_SOURCES: Kind[] = ["synthesis", "process_draft"];

export async function generateProposal(productId: string, d: { kind: Kind; scope: Scope; analysisId?: string | null; runId?: string | null }) {
  if (!get("SELECT 1 x FROM products WHERE id=?", productId)) throw new DomainError("Product not found", "not_found");
  if (d.scope.initiativeId) assertInProduct(productId, "initiative", d.scope.initiativeId);
  if (d.analysisId) assertInProduct(productId, "analysis", d.analysisId);
  const ctx = buildContext(productId, d.scope);
  if (NEEDS_SOURCES.includes(d.kind) && ctx.sources.length === 0) throw new DomainError("Select at least one source so the analysis has evidence to work from.");
  if (["challenge", "concepts", "assumptions", "experiment"].includes(d.kind) && !d.scope.targetId) throw new DomainError("Choose what to work on first.");
  const mode = aiMode();
  let raw: unknown;
  if (mode === "live") raw = await liveProposal(d.kind, ctx);
  else raw = demoProposal(d.kind, ctx);
  const { proposal, rejected } = validateProposal(d.kind, raw, ctx, mode);
  const id = newId("prp");
  run("INSERT INTO ai_proposals (id, product_id, initiative_id, analysis_id, run_id, kind, mode, scope, payload, rejected, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)",
    id, productId, d.scope.initiativeId ?? null, d.analysisId ?? null, d.runId ?? null, d.kind, mode,
    j({ sourceIds: ctx.sources.map((s) => ({ id: s.id, title: s.title, version: s.version })), includeProductKnowledge: !!d.scope.includeProductKnowledge, targetType: d.scope.targetType, targetId: d.scope.targetId, question: d.scope.question }),
    j(proposal), j(rejected), now());
  return { id, proposal, rejected, mode };
}

export async function generatePlan(i: { productId: string; question: string; affected: string; outcome: string; decision: string; constraints: string; mode: string }): Promise<Plan> {
  if (aiMode() === "live") {
    try {
      const p = get<{ name: string }>("SELECT name FROM products WHERE id=?", i.productId)!;
      return await livePlan({ ...i, product: p.name });
    } catch { /* fall through to demo plan, clearly labelled */ }
  }
  return demoPlan(i);
}

type ProposalRow = { id: string; product_id: string; initiative_id: string | null; analysis_id: string | null; run_id: string | null; kind: Kind; mode: "live" | "demo"; scope: string; payload: string; rejected: string; status: string; accepted_items: string };

function loadProposal(productId: string, id: string): ProposalRow {
  const p = get<ProposalRow>("SELECT * FROM ai_proposals WHERE id=?", id);
  if (!p) throw new DomainError("Proposal not found", "not_found");
  if (p.product_id !== productId) throw new DomainError("Proposal belongs to a different product", "product_boundary");
  return p;
}

export type AcceptResult = { entityType: string; entityId: string; already: boolean; merged?: boolean };
const originOf = (m: string) => (m === "live" ? "ai-live" : "ai-demo");

/** Accept one item (or the whole draft for process maps). Idempotent: a second call returns the same record. */
export function acceptItem(productId: string, proposalId: string, index: number, overrides: Record<string, any> = {}, mergeIntoId?: string): AcceptResult {
  return tx(() => {
    const p = loadProposal(productId, proposalId);
    const accepted = parse<Record<string, any>>(p.accepted_items, {});
    const key = String(index);
    if (accepted[key]?.entityId) return { ...accepted[key], already: true };
    if (accepted[key]?.dismissed) throw new DomainError("This item was dismissed.");
    const payload = parse<Proposal>(p.payload, {} as Proposal);
    const item = payload.items[index];
    if (!item && p.kind !== "process_draft") throw new DomainError("Item not found", "not_found");
    const ctxSources = new Map(all<any>("SELECT id, content, source_type FROM sources WHERE product_id=?", productId).map((s) => [s.id, s]));
    const iid = p.initiative_id;
    let result: { entityType: string; entityId: string; merged?: boolean };

    if (p.kind === "synthesis") {
      const v = { ...item, ...overrides };
      let fid: string;
      if (mergeIntoId) { assertInProduct(productId, "finding", mergeIntoId); fid = mergeIntoId; }
      else fid = createEntity("finding", productId, { statement: v.statement, interpretation: v.interpretation, limitations: v.limitations, follow_up: v.followUp, segment: v.segment, origin: originOf(p.mode), status: "accepted" }, iid);
      for (const [refs, rel] of [[item.supporting, "supports"], [item.contradicting, "contradicts"]] as const) {
        for (const r of refs as Ref[]) {
          const s = ctxSources.get(r.sourceId);
          const loc = s && locateQuote(s.content, r.quote);
          if (!loc) continue; // re-verified at save time
          const ex = createExcerpt(productId, r.sourceId, loc[0], loc[1]);
          linkExcerptToFinding(productId, ex, fid, rel);
          if (iid) run("INSERT OR IGNORE INTO initiative_sources (initiative_id, source_id, added_at) VALUES (?,?,?)", iid, r.sourceId, now());
        }
      }
      result = { entityType: "finding", entityId: fid, merged: !!mergeIntoId };
    } else if (p.kind === "opportunities") {
      const v = { ...item, ...overrides };
      const id = createEntity("opportunity", productId, { title: v.title, problem: v.problem, segment: v.segment, context: v.context, desired_outcome: v.desiredOutcome, unknowns: v.unknowns, origin: originOf(p.mode) }, iid);
      for (const f of v.findingIds ?? []) link(productId, ["finding", f], ["opportunity", id], "informs");
      result = { entityType: "opportunity", entityId: id };
    } else if (p.kind === "concepts") {
      const v = { ...item, ...overrides };
      const id = createEntity("concept", productId, { title: v.title, description: v.description, intervention_type: v.interventionType, tradeoffs: v.tradeoffs, origin: originOf(p.mode) }, iid);
      if (v.opportunityId) link(productId, ["opportunity", v.opportunityId], ["concept", id], "addressed_by");
      result = { entityType: "concept", entityId: id };
    } else if (p.kind === "assumptions") {
      const v = { ...item, ...overrides };
      const id = createEntity("assumption", productId, { statement: v.statement, category: v.category, importance: v.importance, origin: originOf(p.mode) }, iid);
      if (v.conceptId) link(productId, ["concept", v.conceptId], ["assumption", id], "relies_on");
      if (v.opportunityId) link(productId, ["opportunity", v.opportunityId], ["assumption", id], "relies_on");
      result = { entityType: "assumption", entityId: id };
    } else if (p.kind === "experiment") {
      const v = { ...item, ...overrides };
      const id = createEntity("experiment", productId, { title: v.title, hypothesis: v.hypothesis, method: v.method, target: v.target, success_criterion: v.successCriterion, origin: originOf(p.mode) }, iid);
      for (const a of v.assumptionIds ?? []) link(productId, ["assumption", a], ["experiment", id], "tested_by");
      if (v.conceptId) link(productId, ["concept", v.conceptId], ["experiment", id], "tested_by");
      result = { entityType: "experiment", entityId: id };
    } else if (p.kind === "challenge") {
      const v = item;
      const table = v.targetType === "finding" ? "findings" : "opportunities";
      const lines = [
        ...(v.alternativeExplanations.length ? ["Alternative explanations to rule out:", ...v.alternativeExplanations.map((x: string) => `• ${x}`)] : []),
        ...(v.missingEvidence.length ? ["Missing evidence:", ...v.missingEvidence.map((x: string) => `• ${x}`)] : []),
        ...(v.evidenceThatWouldChangeView.length ? ["Would change our view:", ...v.evidenceThatWouldChangeView.map((x: string) => `• ${x}`)] : []),
        ...(v.tooBroad ? [`Scope: ${v.tooBroad}`] : []),
      ].join("\n");
      const col = v.targetType === "finding" ? "limitations" : "unknowns";
      const cur = get<any>(`SELECT ${col} c FROM ${table} WHERE id=? AND product_id=?`, v.targetId, productId);
      if (!cur) throw new DomainError("The record no longer exists.");
      const stamp = `— Challenge (${p.mode === "live" ? "AI" : "demo checklist"}, ${now().slice(0, 10)}) —`;
      updateEntity(v.targetType === "finding" ? "finding" : "opportunity", productId, v.targetId, { [col]: [cur.c, stamp, lines].filter(Boolean).join("\n") });
      result = { entityType: v.targetType, entityId: v.targetId };
    } else if (p.kind === "process_draft") {
      const scope = parse<any>(p.scope, {});
      const nodes = payload.items as any[];
      if (!nodes.length) throw new DomainError("The draft has no steps.");
      const mapId = createMap(productId, { name: overrides.name || payload.title || "Drafted process", initiativeId: iid, blank: false, description: `Drafted from ${(scope.sourceIds ?? []).map((s: any) => s.title).join(", ")}. Steps marked “inferred” need confirmation.` });
      const pos = autoLayout(nodes.map((n) => ({ key: n.tempId, type: n.type })), payload.edges.map((e) => ({ from: e.from, to: e.to })));
      const stable = new Map<string, string>();
      for (const n of nodes) {
        const pt = pos.get(n.tempId)!;
        const node = insertNode(mapId, {
          type: n.type, name: n.name, description: n.description, actor: n.actor, x: pt.x, y: pt.y,
          provenance: n.support === "evidence" && n.refs.length ? "evidence" : "inferred",
        });
        stable.set(n.tempId, node.stable_id);
        for (const r of n.refs as Ref[]) {
          const s = ctxSources.get(r.sourceId); const loc = s && locateQuote(s.content, r.quote);
          if (loc) { const ex = createExcerpt(productId, r.sourceId, loc[0], loc[1]); link(productId, ["excerpt", ex], ["process_node", node.id], "supports"); }
        }
      }
      for (const e of payload.edges) addEdge(productId, mapId, stable.get(e.from)!, stable.get(e.to)!, e.label);
      if (p.analysis_id) {
        const a = get<any>("SELECT config FROM analyses WHERE id=?", p.analysis_id);
        run("UPDATE analyses SET config=?, updated_at=? WHERE id=?", j({ ...parse<any>(a?.config, {}), mapId }), now(), p.analysis_id);
        link(productId, ["analysis", p.analysis_id], ["process_map", mapId], "produced");
      }
      for (let i = 0; i < nodes.length; i++) accepted[String(i)] = { entityType: "process_map", entityId: mapId };
      run("UPDATE ai_proposals SET accepted_items=?, status='resolved', resolved_at=? WHERE id=?", j(accepted), now(), proposalId);
      return { entityType: "process_map", entityId: mapId, already: false };
    } else throw new DomainError("Unsupported proposal type");

    accepted[key] = result;
    const total = payload.items.length;
    const done = Object.keys(accepted).length >= total;
    run("UPDATE ai_proposals SET accepted_items=?, status=?, resolved_at=? WHERE id=?", j(accepted), done ? "resolved" : "pending", done ? now() : null, proposalId);
    if (p.analysis_id) link(productId, ["analysis", p.analysis_id], [result.entityType as any, result.entityId], "produced");
    logActivity(productId, { initiativeId: iid, analysisId: p.analysis_id, kind: "accepted", entityType: result.entityType, entityId: result.entityId, summary: `Accepted ${p.mode === "live" ? "AI" : "demo"} proposal → ${result.entityType}: ${trunc(labelFor(result))}` });
    return { ...result, already: false };
  });
}
function labelFor(r: { entityType: string; entityId: string }) { return r.entityId; }

export function dismissItem(productId: string, proposalId: string, index: number) {
  tx(() => {
    const p = loadProposal(productId, proposalId);
    const accepted = parse<Record<string, any>>(p.accepted_items, {});
    if (accepted[String(index)]?.entityId) throw new DomainError("This item was already accepted.");
    accepted[String(index)] = { dismissed: true };
    const total = parse<Proposal>(p.payload, {} as Proposal).items.length;
    const done = Object.keys(accepted).length >= total;
    run("UPDATE ai_proposals SET accepted_items=?, status=?, resolved_at=? WHERE id=?", j(accepted), done ? "resolved" : "pending", done ? now() : null, proposalId);
  });
}
export function dismissProposal(productId: string, proposalId: string) {
  const p = loadProposal(productId, proposalId);
  if (p.status === "pending") run("UPDATE ai_proposals SET status='dismissed', resolved_at=? WHERE id=?", now(), proposalId);
}

export function readProposal(productId: string, id: string) {
  const p = loadProposal(productId, id);
  return { ...p, scope: parse<any>(p.scope, {}), payload: parse<Proposal>(p.payload, {} as Proposal), rejected: parse<Rejected[]>(p.rejected, []), accepted_items: parse<Record<string, any>>(p.accepted_items, {}) };
}
