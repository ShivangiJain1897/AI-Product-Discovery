import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { getSourceFull, listFindings, listSources } from "@/lib/queries";
import { parseCsv } from "@/lib/eventlog";
import { Reader } from "@/components/reader";

export const dynamic = "force-dynamic";

export default async function SourcePage({ params, searchParams }: { params: Promise<{ pid: string; sid: string }>; searchParams: Promise<{ i?: string; excerpt?: string }> }) {
  const { pid, sid } = await params; const sp = await searchParams;
  let s;
  try { s = getSourceFull(pid, sid); } catch { notFound(); }
  if (s.deleted_at) notFound();
  const iid = sp.i && get("SELECT 1 x FROM initiatives WHERE id=? AND product_id=?", sp.i, pid) ? sp.i : undefined;
  const findings = listFindings(pid, iid ? { initiativeId: iid, status: "accepted" } : { status: "accepted" }).map((f) => ({ id: f.id, statement: f.statement }));
  const siblings = listSources(pid, iid ? { initiativeId: iid } : {}).map((x) => ({ id: x.id, title: x.title }));
  let csv;
  if (s.content_kind === "csv") { const p = parseCsv(s.content); csv = { headers: p.headers, rows: p.rows.slice(0, 300), total: p.rows.length }; }
  const exIds = s.excerpts.map((e: any) => e.id);
  const deps = { findings: exIds.length ? new Set(all<any>(`SELECT DISTINCT to_id FROM links WHERE from_type='excerpt' AND to_type='finding' AND from_id IN (${exIds.map(() => "?").join(",")})`, ...exIds).map((r) => r.to_id)).size : 0, decisions: 0 };
  return <Reader pid={pid} iid={iid} src={{ id: s.id, title: s.title, content: s.content, content_kind: s.content_kind, version: s.version, source_type: s.source_type, source_date: s.source_date, participant: s.participant, segment: s.segment, tags: s.tags, synthetic: s.synthetic, imported_at: s.imported_at, filename: s.filename }}
    excerpts={s.excerpts as any} observations={s.observations} findings={findings} versions={s.versions} dependents={deps} activeExcerpt={sp.excerpt} siblings={siblings} csv={csv} />;
}
