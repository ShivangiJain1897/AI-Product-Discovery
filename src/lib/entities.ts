// Generic, product-scoped CRUD for the simple discovery objects, plus soft-delete
// with an explanation of affected relationships.
import { all, get, run, newId, now, tx } from "./db";
import { DomainError, assertInProduct, connections, type LinkRow } from "./links";
import { ENTITY_TABLE, type EntityType } from "./types";
import { logActivity } from "./log";

type Cfg = { table: string; label: string; titleCol: string; fields: string[]; initiative: boolean; soft: boolean };

export const CRUD: Partial<Record<EntityType, Cfg>> = {
  finding: { table: "findings", label: "finding", titleCol: "statement", initiative: true, soft: true,
    fields: ["statement", "interpretation", "limitations", "follow_up", "segment", "status", "origin", "finding_date"] },
  opportunity: { table: "opportunities", label: "opportunity", titleCol: "title", initiative: true, soft: true,
    fields: ["title", "problem", "segment", "context", "desired_outcome", "frequency", "severity", "unknowns", "status", "origin"] },
  concept: { table: "solution_concepts", label: "solution concept", titleCol: "title", initiative: true, soft: true,
    fields: ["title", "description", "intervention_type", "tradeoffs", "status", "origin"] },
  assumption: { table: "assumptions", label: "assumption", titleCol: "statement", initiative: true, soft: true,
    fields: ["statement", "category", "importance", "support", "status", "origin"] },
  hypothesis: { table: "hypotheses", label: "hypothesis", titleCol: "statement", initiative: true, soft: true,
    fields: ["statement"] },
  experiment: { table: "experiments", label: "experiment", titleCol: "title", initiative: true, soft: true,
    fields: ["title", "hypothesis", "method", "target", "success_criterion", "status", "results", "interpretation", "limitations", "next_action", "outcome", "origin"] },
  decision: { table: "decisions", label: "decision", titleCol: "statement", initiative: true, soft: true,
    fields: ["decision_type", "statement", "rationale", "alternatives", "risks", "expected_outcome", "next_action", "decided_on", "status"] },
};

function cfg(type: EntityType): Cfg {
  const c = CRUD[type];
  if (!c) throw new DomainError(`${type} is not a generic entity`);
  return c;
}

const ID_PREFIX: Partial<Record<EntityType, string>> = {
  finding: "fnd", opportunity: "opp", concept: "sol", assumption: "asm", hypothesis: "hyp", experiment: "exp", decision: "dec",
};

export function pick(c: Cfg, data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of c.fields) if (f in data && data[f] !== undefined) out[f] = data[f];
  return out;
}

export function createEntity(type: EntityType, productId: string, data: Record<string, unknown>, initiativeId?: string | null) {
  const c = cfg(type);
  if (initiativeId) assertInProduct(productId, "initiative", initiativeId);
  const vals = pick(c, data);
  const title = String(vals[c.titleCol] ?? "").trim();
  if (!title) throw new DomainError(`A ${c.label} needs some text before it can be saved.`);
  const id = newId(ID_PREFIX[type]!);
  const ts = now();
  const cols = ["id", "product_id", "initiative_id", ...Object.keys(vals), "created_at", "updated_at"];
  const params = [id, productId, initiativeId ?? null, ...Object.values(vals), ts, ts];
  if (type === "decision" && !("decided_on" in vals)) { cols.push("decided_on"); params.push(ts.slice(0, 10)); }
  run(`INSERT INTO ${c.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...params as never[]);
  logActivity(productId, { initiativeId, kind: "created", entityType: type, entityId: id, summary: `Added ${c.label}: ${trunc(title)}` });
  return id;
}

export function updateEntity(type: EntityType, productId: string, id: string, data: Record<string, unknown>) {
  const c = cfg(type);
  assertInProduct(productId, type, id);
  const vals = pick(c, data);
  const keys = Object.keys(vals);
  if (!keys.length) return;
  if (c.titleCol in vals && !String(vals[c.titleCol]).trim()) throw new DomainError(`A ${c.label} needs some text.`);
  run(`UPDATE ${c.table} SET ${keys.map((k) => `${k}=?`).join(",")}, updated_at=? WHERE id=?`, ...Object.values(vals) as never[], now(), id);
  const row = get<Record<string, string>>(`SELECT initiative_id, ${c.titleCol} t FROM ${c.table} WHERE id=?`, id)!;
  logActivity(productId, { initiativeId: row.initiative_id, kind: "updated", entityType: type, entityId: id, summary: `Edited ${c.label}: ${trunc(row.t)}` });
}

export const trunc = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function labelOf(type: EntityType, id: string): { label: string; deleted: boolean } | null {
  const one = (sql: string) => get<{ l: string; d: string | null }>(sql, id);
  let r: { l: string; d: string | null } | undefined;
  switch (type) {
    case "source": r = one("SELECT title l, deleted_at d FROM sources WHERE id=?"); break;
    case "excerpt": r = one("SELECT e.text l, s.deleted_at d FROM excerpts e JOIN sources s ON s.id=e.source_id WHERE e.id=?"); break;
    case "observation": r = one("SELECT text l, deleted_at d FROM observations WHERE id=?"); break;
    case "process_map": r = one("SELECT name l, deleted_at d FROM process_maps WHERE id=?"); break;
    case "process_node": r = one("SELECT n.name l, m.deleted_at d FROM process_nodes n JOIN process_maps m ON m.id=n.map_id WHERE n.id=?"); break;
    case "analysis": r = one("SELECT title l, deleted_at d FROM analyses WHERE id=?"); break;
    case "analysis_run": r = one("SELECT 'Run ' || r.seq || ' of ' || a.title l, a.deleted_at d FROM analysis_runs r JOIN analyses a ON a.id=r.analysis_id WHERE r.id=?"); break;
    case "initiative": r = one("SELECT title l, NULL d FROM initiatives WHERE id=?"); break;
    default: { const c = CRUD[type]; if (c) r = one(`SELECT ${c.titleCol} l, deleted_at d FROM ${c.table} WHERE id=?`); }
  }
  return r ? { label: trunc(r.l, 120), deleted: !!r.d } : null;
}

export type Impact = { label: string; items: { linkId: string; relation: string; direction: "in" | "out"; type: EntityType; id: string; label: string }[] };

export function deletionImpact(type: EntityType, id: string): Impact {
  const l = labelOf(type, id);
  const items = connections(type, id).flatMap((k: LinkRow) => {
    const out = k.from_type === type && k.from_id === id;
    const t = out ? k.to_type : k.from_type, oid = out ? k.to_id : k.from_id;
    const o = labelOf(t, oid);
    if (!o || o.deleted) return [];
    return [{ linkId: k.id, relation: k.relation, direction: (out ? "out" : "in") as "in" | "out", type: t, id: oid, label: o.label }];
  });
  return { label: l?.label ?? id, items };
}

/** Recoverable deletion. Relationships are kept so the record can be restored intact;
 *  read paths hide relationships whose far end is deleted. */
export function softDelete(type: EntityType, productId: string, id: string) {
  const table = ENTITY_TABLE[type];
  assertInProduct(productId, type, id);
  const impact = deletionImpact(type, id);
  tx(() => {
    run(`UPDATE ${table} SET deleted_at=? WHERE id=?`, now(), id);
    flagDependents(productId, type, id, `“${trunc(impact.label, 50)}” was deleted`);
    logActivity(productId, { kind: "deleted", entityType: type, entityId: id, summary: `Deleted ${type}: ${trunc(impact.label)} (recoverable)` });
  });
  return impact;
}

export function restore(type: EntityType, productId: string, id: string) {
  assertInProduct(productId, type, id);
  run(`UPDATE ${ENTITY_TABLE[type]} SET deleted_at=NULL WHERE id=?`, id);
  logActivity(productId, { kind: "restored", entityType: type, entityId: id, summary: `Restored ${type}: ${trunc(labelOf(type, id)?.label ?? id)}` });
}

/** Flag records that depend on a changed/deleted one so the user reviews them. */
export function flagDependents(productId: string, type: EntityType, id: string, reason: string) {
  const deps = all<LinkRow>("SELECT * FROM links WHERE from_type=? AND from_id=? AND product_id=?", type, id, productId);
  for (const d of deps) {
    if (d.to_type === "finding") run("UPDATE findings SET needs_review=1, review_reason=? WHERE id=? AND deleted_at IS NULL", reason, d.to_id);
    if (d.to_type === "decision") run("UPDATE decisions SET needs_review=1, review_reason=? WHERE id=? AND deleted_at IS NULL", reason, d.to_id);
  }
}

export function listTrash(productId: string) {
  const out: { type: EntityType; id: string; label: string; deleted_at: string }[] = [];
  for (const [t, c] of Object.entries(CRUD) as [EntityType, Cfg][]) {
    for (const r of all<{ id: string; l: string; d: string }>(`SELECT id, ${c.titleCol} l, deleted_at d FROM ${c.table} WHERE product_id=? AND deleted_at IS NOT NULL`, productId))
      out.push({ type: t, id: r.id, label: trunc(r.l), deleted_at: r.d });
  }
  for (const r of all<{ id: string; l: string; d: string }>("SELECT id, title l, deleted_at d FROM sources WHERE product_id=? AND deleted_at IS NOT NULL", productId))
    out.push({ type: "source", id: r.id, label: trunc(r.l), deleted_at: r.d });
  for (const r of all<{ id: string; l: string; d: string }>("SELECT id, title l, deleted_at d FROM analyses WHERE product_id=? AND deleted_at IS NOT NULL", productId))
    out.push({ type: "analysis", id: r.id, label: trunc(r.l), deleted_at: r.d });
  for (const r of all<{ id: string; l: string; d: string }>("SELECT id, name l, deleted_at d FROM process_maps WHERE product_id=? AND deleted_at IS NOT NULL", productId))
    out.push({ type: "process_map", id: r.id, label: trunc(r.l), deleted_at: r.d });
  return out.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}
