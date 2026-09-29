import { all, get } from "../db";
import { DomainError, assertInProduct } from "../links";
import { findingStrength } from "../strength";

export type Scope = {
  sourceIds: string[]; initiativeId?: string | null; includeProductKnowledge?: boolean;
  targetType?: string; targetId?: string; question?: string; extra?: Record<string, unknown>;
};
export type SrcCtx = { id: string; title: string; type: string; participant: string; segment: string; date: string | null; content: string; kind: string; version: number };
export type Ctx = {
  productId: string; sources: SrcCtx[]; scope: Scope;
  knowledge: { findings: { id: string; statement: string; segment: string; strength: string; origin: string }[] };
  product: { name: string; description: string; target_users: string; objectives: string };
};

export function buildContext(productId: string, scope: Scope): Ctx {
  const ids = [...new Set(scope.sourceIds)];
  for (const id of ids) assertInProduct(productId, "source", id);
  const sources = ids.map((id) => get<any>("SELECT * FROM sources WHERE id=? AND deleted_at IS NULL", id)).filter(Boolean).map((s) => ({
    id: s.id, title: s.title, type: s.source_type, participant: s.participant, segment: s.segment, date: s.source_date, content: s.content, kind: s.content_kind, version: s.version,
  })) as SrcCtx[];
  const findings = scope.includeProductKnowledge
    ? all<any>("SELECT id, statement, segment, origin FROM findings WHERE product_id=? AND deleted_at IS NULL AND status='accepted' LIMIT 40", productId)
        .map((f) => ({ id: f.id, statement: f.statement, segment: f.segment, origin: f.origin, strength: findingStrength(f.id).level }))
    : [];
  const product = get<any>("SELECT name, description, target_users, objectives FROM products WHERE id=?", productId);
  if (!product) throw new DomainError("Product not found", "not_found");
  return { productId, sources, scope, knowledge: { findings }, product };
}
