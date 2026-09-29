import Link from "next/link";
import { listInitiatives } from "@/lib/queries";
import { StatusActions } from "@/components/initiative";
import { Empty } from "@/components/ui";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Discovery({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const inis = listInitiatives(pid);
  const groups: [string, string][] = [["active", "Active"], ["paused", "Paused"], ["completed", "Completed"], ["archived", "Archived"]];
  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[20px] font-semibold">Discovery</h1><p className="text-[13.5px] text-muted">Ongoing and past investigations. Completing one never closes the product: its evidence, findings and decisions stay in Knowledge, and you can reopen it any time.</p></div><Link className="btn btn-primary" href={`/p/${pid}/new`}>New discovery</Link></div>
      {inis.length === 0 && <Empty title="No discovery initiatives yet" action={<Link className="btn btn-primary" href={`/p/${pid}/new`}>Ask your first question</Link>}>A discovery is an investigation organised around a question and the decision it should inform. Or skip it and start an analysis directly.</Empty>}
      {groups.map(([k, l]) => { const list = inis.filter((i) => i.status === k); return list.length > 0 && (
        <section key={k} className="mb-6" aria-labelledby={`g-${k}`}><h2 id={`g-${k}`} className="h-section mb-2">{l} ({list.length})</h2>
          <ul className="space-y-2">{list.map((i) => (
            <li key={i.id} className="card px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><Link className="text-[15px] font-medium hover:underline" href={`/p/${pid}/i/${i.id}`}>{i.title}</Link>{i.is_demo ? <span className="badge badge-warn ml-2">Demo</span> : null}<p className="text-[13px] text-muted">{i.question}</p>
                <p className="mt-1 text-[12.5px] text-muted">{i.counts.sources} sources · {i.counts.findings} findings · {i.counts.opportunities} opportunities · {i.counts.experiments} experiments · {i.counts.decisions} decisions · updated {ago(i.updated_at)}{i.closed_at ? ` · closed ${i.closed_at.slice(0, 10)}` : ""}</p></div>
              <StatusActions pid={pid} iid={i.id} status={i.status} /></div></li>))}</ul></section>); })}
    </div>
  );
}
