import { all, get, run, newId, now, tx, j, parse } from "./db";
import { DomainError, assertInProduct } from "./links";
import { logActivity } from "./log";
import { trunc } from "./entities";

export const NODE_TYPES = ["start", "activity", "decision", "end"] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const NODE_FIELDS = ["name", "description", "actor", "system", "inputs", "outputs", "timing", "pain_points", "controls"] as const;

export type PNode = {
  id: string; map_id: string; stable_id: string; type: NodeType; name: string; description: string; actor: string; system: string;
  inputs: string; outputs: string; timing: string; pain_points: string; controls: string; provenance: "evidence" | "inferred" | "manual"; x: number; y: number;
};
export type PEdge = { id: string; map_id: string; source_stable_id: string; target_stable_id: string; label: string };
export type Snapshot = { takenAt: string; sourceMapId: string; sourceMapName: string; nodes: PNode[]; edges: PEdge[] };

export function createMap(productId: string, d: { name: string; kind?: "current" | "future"; initiativeId?: string | null; description?: string; blank?: boolean }) {
  if (d.initiativeId) assertInProduct(productId, "initiative", d.initiativeId);
  if (!d.name.trim()) throw new DomainError("Name the map.");
  const id = newId("map"); const ts = now();
  tx(() => {
    run("INSERT INTO process_maps (id, product_id, initiative_id, name, kind, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
      id, productId, d.initiativeId ?? null, d.name.trim(), d.kind ?? "current", d.description ?? "", ts, ts);
    if (d.blank !== false) {
      insertNode(id, { type: "start", name: "Start", x: 0, y: 120 });
      insertNode(id, { type: "end", name: "End", x: 660, y: 120 });
    }
    if (d.initiativeId) run("UPDATE initiatives SET process_enabled=1, updated_at=? WHERE id=?", ts, d.initiativeId);
    logActivity(productId, { initiativeId: d.initiativeId, kind: "created", entityType: "process_map", entityId: id, summary: `Started process map: ${trunc(d.name)}` });
  });
  return id;
}

export function insertNode(mapId: string, n: Partial<PNode> & { name: string }): PNode {
  const id = newId("stn");
  const stable = n.stable_id ?? newId("stp");
  run(`INSERT INTO process_nodes (id, map_id, stable_id, type, name, description, actor, system, inputs, outputs, timing, pain_points, controls, provenance, x, y)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, mapId, stable, n.type ?? "activity", n.name, n.description ?? "", n.actor ?? "", n.system ?? "", n.inputs ?? "", n.outputs ?? "",
    n.timing ?? "", n.pain_points ?? "", n.controls ?? "", n.provenance ?? "manual", n.x ?? 0, n.y ?? 0);
  return get<PNode>("SELECT * FROM process_nodes WHERE id=?", id)!;
}

function mapOf(productId: string, mapId: string) {
  assertInProduct(productId, "process_map", mapId);
  return get<{ id: string; initiative_id: string | null; name: string; kind: string }>("SELECT * FROM process_maps WHERE id=?", mapId)!;
}
const touch = (mapId: string) => run("UPDATE process_maps SET updated_at=? WHERE id=?", now(), mapId);

export function addNode(productId: string, mapId: string, n: Partial<PNode> & { name: string }) {
  const m = mapOf(productId, mapId);
  if (n.type && !NODE_TYPES.includes(n.type)) throw new DomainError("Unknown step type.");
  if (!n.name.trim()) throw new DomainError("Name the step.");
  const node = insertNode(mapId, { ...n, name: n.name.trim() });
  touch(mapId);
  logActivity(productId, { initiativeId: m.initiative_id, kind: "updated", entityType: "process_map", entityId: mapId, summary: `Added step “${trunc(node.name, 40)}” to ${trunc(m.name, 40)}` });
  return node;
}

export function updateNode(productId: string, mapId: string, stableId: string, d: Partial<PNode>) {
  const m = mapOf(productId, mapId);
  const cur = get<PNode>("SELECT * FROM process_nodes WHERE map_id=? AND stable_id=?", mapId, stableId);
  if (!cur) throw new DomainError("Step not found", "not_found");
  const keys = [...NODE_FIELDS, "type", "provenance"] as const;
  const sets: string[] = []; const p: unknown[] = [];
  for (const k of keys) if (k in d && (d as Record<string, unknown>)[k] !== undefined) {
    const v = (d as Record<string, unknown>)[k];
    if (k === "name" && !String(v).trim()) throw new DomainError("A step needs a name.");
    if (k === "type" && !NODE_TYPES.includes(v as NodeType)) throw new DomainError("Unknown step type.");
    sets.push(`${k}=?`); p.push(v);
  }
  // Editing a step's substance means a person has looked at it: confirm inferred provenance.
  if (cur.provenance === "inferred" && !("provenance" in d) && sets.length) { sets.push("provenance=?"); p.push("manual"); }
  if (!sets.length) return;
  run(`UPDATE process_nodes SET ${sets.join(",")} WHERE id=?`, ...p as never[], cur.id);
  touch(mapId);
  logActivity(productId, { initiativeId: m.initiative_id, kind: "updated", entityType: "process_map", entityId: mapId, summary: `Edited step “${trunc(String(d.name ?? cur.name), 40)}” in ${trunc(m.name, 40)}` });
}

export function deleteNode(productId: string, mapId: string, stableId: string) {
  const m = mapOf(productId, mapId);
  const cur = get<PNode>("SELECT * FROM process_nodes WHERE map_id=? AND stable_id=?", mapId, stableId);
  if (!cur) throw new DomainError("Step not found", "not_found");
  tx(() => {
    run("DELETE FROM process_edges WHERE map_id=? AND (source_stable_id=? OR target_stable_id=?)", mapId, stableId, stableId);
    run("DELETE FROM links WHERE (from_type='process_node' AND from_id=?) OR (to_type='process_node' AND to_id=?)", cur.id, cur.id);
    run("DELETE FROM process_nodes WHERE id=?", cur.id);
    run("DELETE FROM process_changes WHERE map_id=? AND stable_id=?", mapId, stableId);
    touch(mapId);
    logActivity(productId, { initiativeId: m.initiative_id, kind: "updated", entityType: "process_map", entityId: mapId, summary: `Removed step “${trunc(cur.name, 40)}” from ${trunc(m.name, 40)}` });
  });
}

export function addEdge(productId: string, mapId: string, source: string, target: string, label = "") {
  mapOf(productId, mapId);
  if (source === target) throw new DomainError("A step cannot connect to itself. Model a repeat as a loop through another step.");
  for (const s of [source, target]) if (!get("SELECT 1 x FROM process_nodes WHERE map_id=? AND stable_id=?", mapId, s)) throw new DomainError("Both steps must be on this map.");
  const ex = get<PEdge>("SELECT * FROM process_edges WHERE map_id=? AND source_stable_id=? AND target_stable_id=?", mapId, source, target);
  if (ex) { if (label && label !== ex.label) run("UPDATE process_edges SET label=? WHERE id=?", label, ex.id); return ex.id; }
  const id = newId("edg");
  run("INSERT INTO process_edges (id, map_id, source_stable_id, target_stable_id, label) VALUES (?,?,?,?,?)", id, mapId, source, target, label);
  touch(mapId);
  return id;
}
export function updateEdge(productId: string, mapId: string, edgeId: string, label: string) {
  mapOf(productId, mapId);
  run("UPDATE process_edges SET label=? WHERE id=? AND map_id=?", label, edgeId, mapId); touch(mapId);
}
export function deleteEdge(productId: string, mapId: string, edgeId: string) {
  mapOf(productId, mapId);
  run("DELETE FROM process_edges WHERE id=? AND map_id=?", edgeId, mapId); touch(mapId);
}
export function savePositions(productId: string, mapId: string, pos: { stableId: string; x: number; y: number }[]) {
  mapOf(productId, mapId);
  tx(() => { for (const p of pos) run("UPDATE process_nodes SET x=?, y=? WHERE map_id=? AND stable_id=?", p.x, p.y, mapId, p.stableId); touch(mapId); });
}

export function loadMap(mapId: string) {
  const map = get<Record<string, any>>("SELECT * FROM process_maps WHERE id=?", mapId);
  if (!map) return null;
  return {
    map: { ...map, scenario: parse<Scenario | null>(map.scenario, null), baseline_snapshot: parse<Snapshot | null>(map.baseline_snapshot, null) } as Record<string, any>,
    nodes: all<PNode>("SELECT * FROM process_nodes WHERE map_id=? ORDER BY x, y", mapId),
    edges: all<PEdge>("SELECT * FROM process_edges WHERE map_id=?", mapId),
    changes: all<Change>("SELECT * FROM process_changes WHERE map_id=?", mapId),
  };
}

export function snapshotMap(mapId: string): Snapshot {
  const m = loadMap(mapId)!;
  return { takenAt: now(), sourceMapId: mapId, sourceMapName: m.map.name, nodes: m.nodes, edges: m.edges };
}

/** Clone a map into a named future-state proposal. The original is untouched; the baseline is frozen. */
export function cloneAsFuture(productId: string, mapId: string, name: string) {
  const src = mapOf(productId, mapId);
  if (!name.trim()) throw new DomainError("Name the proposal.");
  const snap = snapshotMap(mapId);
  const id = newId("map"); const ts = now();
  tx(() => {
    run("INSERT INTO process_maps (id, product_id, initiative_id, name, kind, baseline_map_id, baseline_snapshot, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id, productId, src.initiative_id, name.trim(), "future", src.kind === "future" ? (loadMap(mapId)!.map.baseline_map_id ?? mapId) : mapId, j(snap), ts, ts);
    for (const n of snap.nodes) insertNode(id, { ...n, stable_id: n.stable_id });
    for (const e of snap.edges) run("INSERT INTO process_edges (id, map_id, source_stable_id, target_stable_id, label) VALUES (?,?,?,?,?)", newId("edg"), id, e.source_stable_id, e.target_stable_id, e.label);
    logActivity(productId, { initiativeId: src.initiative_id, kind: "created", entityType: "process_map", entityId: id, summary: `Created future-state proposal “${trunc(name, 40)}” from ${trunc(src.name, 40)}` });
  });
  return id;
}

// ---------- change rationale ----------
export type Change = { id: string; map_id: string; stable_id: string; what: string; why: string; addresses: string; expected_outcome: string; dependencies: string; risks: string; assumptions: string };
export function upsertChange(productId: string, mapId: string, stableId: string, d: Partial<Change>) {
  mapOf(productId, mapId);
  const f = ["what", "why", "addresses", "expected_outcome", "dependencies", "risks", "assumptions"] as const;
  const cur = get<Change>("SELECT * FROM process_changes WHERE map_id=? AND stable_id=?", mapId, stableId);
  if (!cur) {
    run("INSERT INTO process_changes (id, map_id, stable_id, what, why, addresses, expected_outcome, dependencies, risks, assumptions, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      newId("chg"), mapId, stableId, ...f.map((k) => String(d[k] ?? "")), now());
  } else {
    run(`UPDATE process_changes SET ${f.map((k) => `${k}=?`).join(",")}, updated_at=? WHERE id=?`, ...f.map((k) => String(d[k] ?? cur[k])), now(), cur.id);
  }
}

// ---------- comparison ----------
export type StepDiff = {
  stableId: string; status: "unchanged" | "modified" | "added" | "removed";
  before?: PNode; after?: PNode; changed: string[]; flowChanged: boolean;
};
export function diffMaps(before: { nodes: PNode[]; edges: PEdge[] }, after: { nodes: PNode[]; edges: PEdge[] }): StepDiff[] {
  const b = new Map(before.nodes.map((n) => [n.stable_id, n]));
  const a = new Map(after.nodes.map((n) => [n.stable_id, n]));
  const preds = (edges: PEdge[], id: string) => edges.filter((e) => e.target_stable_id === id).map((e) => e.source_stable_id).sort().join(",");
  const succs = (edges: PEdge[], id: string) => edges.filter((e) => e.source_stable_id === id).map((e) => `${e.target_stable_id}:${e.label}`).sort().join(",");
  const out: StepDiff[] = [];
  const labels: Record<string, string> = { name: "name", description: "description", actor: "owner", system: "system", timing: "timing", type: "type", controls: "controls", inputs: "inputs", outputs: "outputs", pain_points: "pain points" };
  for (const [id, n] of a) {
    const o = b.get(id);
    if (!o) { out.push({ stableId: id, status: "added", after: n, changed: [], flowChanged: false }); continue; }
    const changed = Object.keys(labels).filter((k) => (o as any)[k] !== (n as any)[k]).map((k) => labels[k]);
    const flow = preds(before.edges, id) !== preds(after.edges, id) || succs(before.edges, id) !== succs(after.edges, id);
    if (flow) changed.push("connections");
    out.push({ stableId: id, status: changed.length ? "modified" : "unchanged", before: o, after: n, changed, flowChanged: flow });
  }
  for (const [id, o] of b) if (!a.has(id)) out.push({ stableId: id, status: "removed", before: o, changed: [], flowChanged: false });
  const rank = { removed: 0, modified: 1, added: 2, unchanged: 3 } as const;
  return out.sort((x, y) => rank[x.status] - rank[y.status]);
}

export function handoffCount(nodes: PNode[], edges: PEdge[]) {
  const m = new Map(nodes.map((n) => [n.stable_id, n]));
  return edges.filter((e) => { const s = m.get(e.source_stable_id), t = m.get(e.target_stable_id); return s && t && s.actor && t.actor && s.actor !== t.actor; }).length;
}
export const activityCount = (nodes: PNode[]) => nodes.filter((n) => n.type === "activity").length;

// ---------- validation warnings ----------
export function mapWarnings(nodes: PNode[], edges: PEdge[]): string[] {
  const w: string[] = [];
  for (const n of nodes) {
    const out = edges.filter((e) => e.source_stable_id === n.stable_id);
    const inn = edges.filter((e) => e.target_stable_id === n.stable_id);
    if (n.type === "decision") {
      if (out.length < 2) w.push(`Decision “${n.name}” has fewer than two branches.`);
      if (out.some((e) => !e.label.trim())) w.push(`Decision “${n.name}” has unlabelled branches.`);
    }
    if (n.type !== "start" && inn.length === 0) w.push(`“${n.name}” has nothing leading into it.`);
    if (n.type !== "end" && out.length === 0) w.push(`“${n.name}” leads nowhere.`);
  }
  return w;
}

// ---------- layout ----------
export function autoLayout(nodes: { key: string; type: string }[], edges: { from: string; to: string }[]): Map<string, { x: number; y: number }> {
  const layer = new Map<string, number>();
  const start = nodes.filter((n) => n.type === "start").map((n) => n.key);
  const roots = start.length ? start : nodes.filter((n) => !edges.some((e) => e.to === n.key)).map((n) => n.key);
  const queue = [...roots]; roots.forEach((r) => layer.set(r, 0));
  while (queue.length) {
    const k = queue.shift()!;
    for (const e of edges.filter((e) => e.from === k)) {
      if (!layer.has(e.to)) { layer.set(e.to, layer.get(k)! + 1); queue.push(e.to); }
    }
  }
  let maxL = Math.max(0, ...layer.values());
  for (const n of nodes) if (!layer.has(n.key)) layer.set(n.key, ++maxL);
  const rows = new Map<number, number>();
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const l = layer.get(n.key)!; const r = rows.get(l) ?? 0; rows.set(l, r + 1);
    out.set(n.key, { x: l * 230, y: r * 120 + (l % 2) * 20 });
  }
  return out;
}

// ---------- benefit scenario (optional, always labelled an estimate) ----------
export type Scenario = { label: string; unit: string; formula: string; inputs: { name: string; value: number | null; unit: string; note: string }[] };

/** Tiny arithmetic evaluator: + - * / parentheses, numbers and input names. No eval(). */
export function evalFormula(formula: string, vars: Record<string, number | null>): { value: number | null; error?: string; missing: string[] } {
  const tokens = formula.match(/\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/])/g)?.map((t) => t.trim()) ?? [];
  if (tokens.join("").length !== formula.replace(/\s+/g, "").length) return { value: null, error: "Formula has unsupported characters.", missing: [] };
  let pos = 0; const missing: string[] = [];
  const peek = () => tokens[pos];
  const expr = (): number => { let v = term(); while (peek() === "+" || peek() === "-") { const op = tokens[pos++]; const r = term(); v = op === "+" ? v + r : v - r; } return v; };
  const term = (): number => { let v = factor(); while (peek() === "*" || peek() === "/") { const op = tokens[pos++]; const r = factor(); v = op === "*" ? v * r : v / r; } return v; };
  const factor = (): number => {
    const t = tokens[pos++];
    if (t === undefined) throw new Error("Formula ended unexpectedly.");
    if (t === "-") return -factor();
    if (t === "(") { const v = expr(); if (tokens[pos++] !== ")") throw new Error("Missing closing parenthesis."); return v; }
    if (/^\d/.test(t)) return parseFloat(t);
    if (/^[A-Za-z_]/.test(t)) { const v = vars[t]; if (v === undefined) throw new Error(`Unknown input “${t}”.`); if (v === null) { missing.push(t); return NaN; } return v; }
    throw new Error(`Unexpected “${t}”.`);
  };
  try {
    const v = expr();
    if (pos < tokens.length) return { value: null, error: "Formula has extra characters.", missing };
    if (missing.length) return { value: null, missing };
    return { value: Number.isFinite(v) ? v : null, error: Number.isFinite(v) ? undefined : "Result is not a finite number.", missing };
  } catch (e) { return { value: null, error: (e as Error).message, missing }; }
}

export function saveScenario(productId: string, mapId: string, s: Scenario | null) {
  mapOf(productId, mapId);
  if (s) {
    const vars: Record<string, number | null> = {};
    s.inputs.forEach((i) => (vars[i.name] = i.value));
    const r = evalFormula(s.formula, vars);
    if (r.error && s.formula.trim()) throw new DomainError(r.error);
  }
  run("UPDATE process_maps SET scenario=?, updated_at=? WHERE id=?", s ? j(s) : null, now(), mapId);
}
