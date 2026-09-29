import Link from "next/link";
import { buildBrief } from "@/lib/brief";
import { NarrativeEditor } from "@/components/brief";
import { Markdown } from "@/components/md";

export const dynamic = "force-dynamic";

export default async function Brief({ params }: { params: Promise<{ pid: string; iid: string }> }) {
  const { pid, iid } = await params;
  const b = buildBrief(pid, iid);
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-[17px] font-semibold">Discovery brief</h2><p className="text-[13.5px] text-muted">A living summary built from your records. Narrative is yours; the evidence beneath it stays linked and current.</p></div>
        <div className="no-print flex flex-wrap gap-2">
          <a className="btn btn-sm" href={`/api/brief/${pid}/${iid}?format=md`} download>Download Markdown</a>
          <a className="btn btn-sm" href={`/api/export/${pid}`} download>Export workspace (JSON)</a>
          <Link className="btn btn-sm btn-primary" href={`/p/${pid}/i/${iid}/brief/print`}>Print view</Link>
        </div>
      </div>
      {b.anyNeedsRefresh && <div role="status" className="mb-4 rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13.5px] text-warn">Some sections need refresh: underlying records changed after their narrative was last reviewed. Nothing was overwritten.</div>}
      <div className="space-y-6">
        {b.sections.filter((s) => s.applicable).map((s, i) => (
          <section key={s.key} aria-labelledby={`b-${s.key}`} className="card p-5">
            <h3 id={`b-${s.key}`} className="mb-2 text-[16px] font-semibold">{i + 1}. {s.title}{s.needsRefresh && <span className="badge badge-warn ml-2">Needs refresh</span>}</h3>
            <NarrativeEditor pid={pid} iid={iid} k={s.key} initial={s.narrative} needsRefresh={s.needsRefresh} changes={s.changes} hasItems={s.items.length > 0} />
            {s.items.length ? <Markdown text={s.items.map((x) => x.md).join(s.key === "evidence" ? "\n" : "\n\n")} /> : <p className="text-[13.5px] text-muted">Nothing recorded yet.</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
