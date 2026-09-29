import { newId, now, run } from "./db";

export function logActivity(productId: string, a: {
  initiativeId?: string | null; analysisId?: string | null; kind: string; entityType?: string; entityId?: string; summary: string;
}) {
  run("INSERT INTO activity (id, product_id, initiative_id, analysis_id, kind, entity_type, entity_id, summary, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    newId("act"), productId, a.initiativeId ?? null, a.analysisId ?? null, a.kind, a.entityType ?? null, a.entityId ?? null, a.summary, now());
}
