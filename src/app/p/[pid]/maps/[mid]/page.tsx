import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { loadMap, diffMaps, mapWarnings, activityCount, handoffCount } from "@/lib/process";
import { listMaps } from "@/lib/queries";
import { MapEditor } from "@/components/map-editor";

export const dynamic = "force-dynamic";

export default async function MapPage({ params, searchParams }: { params: Promise<{ pid: string; mid: string }>; searchParams: Promise<{ node?: string; view?: string }> }) {
  const { pid, mid } = await params; const sp = await searchParams;
  const m = loadMap(mid);
  if (!m || m.map.product_id !== pid || m.map.deleted_at) notFound();
  const nodes = m.nodes.map((n) => ({
    ...n,
    evidence: all<any>("SELECT l.id linkId, e.id excerptId, e.text, e.source_id sourceId, s.title sourceTitle FROM links l JOIN excerpts e ON e.id=l.from_id JOIN sources s ON s.id=e.source_id WHERE l.to_type='process_node' AND l.to_id=? AND l.from_type='excerpt' AND s.deleted_at IS NULL", n.id),
    opportunities: all<any>("SELECT l.id linkId, o.id, o.title FROM links l JOIN opportunities o ON o.id=l.from_id WHERE l.to_type='process_node' AND l.to_id=? AND l.from_type='opportunity' AND o.deleted_at IS NULL", n.id),
  }));
  const base = m.map.baseline_snapshot;
  const diff = m.map.kind === "future" && base ? diffMaps(base, m).map(({ before, after, ...r }) => ({ ...r, before: before as any, after: after as any })) : null;
  const orig = base ? get<any>("SELECT updated_at FROM process_maps WHERE id=?", base.sourceMapId) : null;
  const evidenceCands = all<any>("SELECT e.id, e.text FROM excerpts e JOIN sources s ON s.id=e.source_id WHERE e.product_id=? AND s.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 100", pid).map((e) => ({ id: e.id, label: e.text }));
  const oppCands = all<any>("SELECT id, title FROM opportunities WHERE product_id=? AND deleted_at IS NULL", pid).map((o) => ({ id: o.id, label: o.title }));
  const siblings = listMaps(pid, m.map.initiative_id ?? undefined).map((x: any) => ({ id: x.id, name: x.name, kind: x.kind }));
  return <MapEditor pid={pid} map={{ id: m.map.id, name: m.map.name, kind: m.map.kind, description: m.map.description, scenario: m.map.scenario, initiative_id: m.map.initiative_id, updated_at: m.map.updated_at }}
    nodes={nodes as any} edges={m.edges as any} changes={m.changes as any} diff={diff as any}
    baseline={base ? { name: base.sourceMapName, takenAt: base.takenAt, nodes: base.nodes as any, edges: base.edges as any, activities: activityCount(base.nodes), handoffs: handoffCount(base.nodes, base.edges) } : null}
    warnings={mapWarnings(m.nodes, m.edges)} evidenceCands={evidenceCands} oppCands={oppCands} selected={sp.node} view={sp.view} baselineStale={!!(orig && base && orig.updated_at > base.takenAt)} siblings={siblings} />;
}
