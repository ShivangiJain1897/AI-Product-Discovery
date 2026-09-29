import { all, get, run, newId, now, tx } from "./db";
import { ENTITY_TABLE, type EntityType } from "./types";

export class DomainError extends Error {
  constructor(message: string, public code = "invalid") {
    super(message);
  }
}

/** Product the entity belongs to, or undefined if it does not exist. */
export function entityProduct(type: EntityType, id: string): string | undefined {
  const table = ENTITY_TABLE[type];
  if (!table) throw new DomainError(`Unknown entity type ${type}`);
  if (type === "process_node") {
    return get<{ p: string }>(
      "SELECT m.product_id p FROM process_nodes n JOIN process_maps m ON m.id = n.map_id WHERE n.id = ?", id)?.p;
  }
  if (type === "analysis_run") {
    return get<{ p: string }>(
      "SELECT a.product_id p FROM analysis_runs r JOIN analyses a ON a.id = r.analysis_id WHERE r.id = ?", id)?.p;
  }
  if (type === "initiative") return get<{ p: string }>("SELECT product_id p FROM initiatives WHERE id = ?", id)?.p;
  return get<{ p: string }>(`SELECT product_id p FROM ${table} WHERE id = ?`, id)?.p;
}

/** Throws unless the entity exists and belongs to the product. */
export function assertInProduct(productId: string, type: EntityType, id: string) {
  const p = entityProduct(type, id);
  if (!p) throw new DomainError(`${type} ${id} does not exist`, "not_found");
  if (p !== productId) throw new DomainError(`${type} ${id} belongs to a different product`, "product_boundary");
}

/** Create a relationship. Both ends must exist in the same product. Idempotent. */
export function link(productId: string, from: [EntityType, string], to: [EntityType, string], relation: string, note = "") {
  assertInProduct(productId, from[0], from[1]);
  assertInProduct(productId, to[0], to[1]);
  const existing = get<{ id: string }>(
    "SELECT id FROM links WHERE from_type=? AND from_id=? AND to_type=? AND to_id=? AND relation=?",
    from[0], from[1], to[0], to[1], relation);
  if (existing) return existing.id;
  const id = newId("lnk");
  run("INSERT INTO links (id, product_id, from_type, from_id, to_type, to_id, relation, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id, productId, from[0], from[1], to[0], to[1], relation, note, now());
  return id;
}

export function unlink(productId: string, linkId: string) {
  run("DELETE FROM links WHERE id = ? AND product_id = ?", linkId, productId);
}

export type LinkRow = { id: string; from_type: EntityType; from_id: string; to_type: EntityType; to_id: string; relation: string; note: string };

export function linksFrom(type: EntityType, id: string, toType?: EntityType, relation?: string): LinkRow[] {
  let sql = "SELECT * FROM links WHERE from_type=? AND from_id=?";
  const p: unknown[] = [type, id];
  if (toType) { sql += " AND to_type=?"; p.push(toType); }
  if (relation) { sql += " AND relation=?"; p.push(relation); }
  return all<LinkRow>(sql + " ORDER BY created_at", ...p);
}
export function linksTo(type: EntityType, id: string, fromType?: EntityType, relation?: string): LinkRow[] {
  let sql = "SELECT * FROM links WHERE to_type=? AND to_id=?";
  const p: unknown[] = [type, id];
  if (fromType) { sql += " AND from_type=?"; p.push(fromType); }
  if (relation) { sql += " AND relation=?"; p.push(relation); }
  return all<LinkRow>(sql + " ORDER BY created_at", ...p);
}

/** Everything connected to an entity, either direction. Used to explain deletion impact. */
export function connections(type: EntityType, id: string): LinkRow[] {
  return all<LinkRow>("SELECT * FROM links WHERE (from_type=? AND from_id=?) OR (to_type=? AND to_id=?)", type, id, type, id);
}

/** Remove all relationships touching an entity (used on hard removal only). */
export function dropLinks(type: EntityType, id: string) {
  tx(() => run("DELETE FROM links WHERE (from_type=? AND from_id=?) OR (to_type=? AND to_id=?)", type, id, type, id));
}
