import { notFound } from "next/navigation";
import { get } from "@/lib/db";
import { parse } from "@/lib/db";
import { EventLogWizard } from "@/components/eventlog-wizard";
import { assertInProduct } from "@/lib/links";

export const dynamic = "force-dynamic";

export default async function EventLogPage({ params, searchParams }: { params: Promise<{ pid: string; sid: string }>; searchParams: Promise<{ i?: string; a?: string }> }) {
  const { pid, sid } = await params; const sp = await searchParams;
  try { assertInProduct(pid, "source", sid); } catch { notFound(); }
  const s = get<any>("SELECT title, content_kind FROM sources WHERE id=?", sid)!;
  if (s.content_kind !== "csv") return <div className="mx-auto max-w-xl px-6 py-10"><p className="card p-5 text-[14px]">Event-log analysis needs a CSV source. Supported evidence formats are pasted text, .txt, .md and .csv.</p></div>;
  const a = sp.a ? get<any>("SELECT config FROM analyses WHERE id=? AND product_id=?", sp.a, pid) : null;
  const cfg = a ? parse<any>(a.config, null) : null;
  return <EventLogWizard pid={pid} sid={sid} iid={sp.i} analysisId={sp.a} title={s.title} initial={cfg?.mapping ? { mapping: cfg.mapping, options: cfg.options } : undefined} />;
}
