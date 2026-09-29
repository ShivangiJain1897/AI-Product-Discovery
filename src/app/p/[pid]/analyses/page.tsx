import Link from "next/link";
import { listAnalyses, listInitiatives, listSources } from "@/lib/queries";
import { NewAnalysis } from "@/components/new-analysis";
import { Empty } from "@/components/ui";
import { ANALYSIS_TYPES } from "@/lib/types";
import { ago } from "@/lib/format";
import { labelOf } from "@/lib/entities";
import type { EntityType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Analyses({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { pid } = await params; const sp = await searchParams;
  const since = sp.since === "7" ? new Date(Date.now() - 7 * 864e5).toISOString() : sp.since === "30" ? new Date(Date.now() - 30 * 864e5).toISOString() : undefined;
  const list = listAnalyses(pid, { type: sp.type || undefined, initiativeId: sp.i && sp.i !== "none" ? sp.i : undefined, standalone: sp.i === "none", status: sp.status || undefined, since, q: sp.q || undefined });
  const initiatives = listInitiatives(pid);
  const all = listSources(pid);
  const from = sp.from ? (() => { const [t, id] = sp.from.split(":"); const l = labelOf(t as EntityType, id); return l ? { type: t, id, label: l.label } : null; })() : null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[20px] font-semibold">Outputs</h1><p className="text-[13.5px] text-muted">Investigations for this product. Start one inside a discovery, straight from here, or from a finding or opportunity. Reruns keep earlier results.</p></div>
        <NewAnalysis pid={pid} initiatives={initiatives.filter((i) => i.status !== "archived").map((i) => ({ id: i.id, title: i.title }))} sources={all.filter((s) => s.content_kind === "text").map((s) => ({ id: s.id, title: s.title }))} csvSources={all.filter((s) => s.content_kind === "csv").map((s) => ({ id: s.id, title: s.title }))} defaultInitiative={sp.i && sp.i !== "none" ? sp.i : undefined} from={from} /></div>
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" role="search" aria-label="Filter analyses">
        <div><label className="label" htmlFor="f-q">Search</label><input id="f-q" name="q" defaultValue={sp.q} className="input" /></div>
        <div><label className="label" htmlFor="f-t">Type</label><select id="f-t" name="type" defaultValue={sp.type ?? ""} className="input"><option value="">All types</option>{Object.entries(ANALYSIS_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label className="label" htmlFor="f-i">Discovery</label><select id="f-i" name="i" defaultValue={sp.i ?? ""} className="input"><option value="">Any</option><option value="none">No discovery (product-level)</option>{initiatives.map((i) => <option key={i.id} value={i.id}>{i.title.slice(0, 50)}</option>)}</select></div>
        <div><label className="label" htmlFor="f-s">Status</label><select id="f-s" name="status" defaultValue={sp.status ?? ""} className="input"><option value="">Any</option><option value="draft">Draft</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></div>
        <div><label className="label" htmlFor="f-d">Updated</label><select id="f-d" name="since" defaultValue={sp.since ?? ""} className="input"><option value="">Any time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></div>
        <button className="btn">Filter</button><Link className="btn btn-quiet" href={`/p/${pid}/analyses`}>Clear</Link>
      </form>
      {list.length === 0 ? <Empty title="No analyses match">Start one with the button above — for example a problem analysis needs no evidence at all, and a research synthesis needs only the sources you choose.</Empty> : (
        <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Analysis</th><th>Type</th><th>Discovery</th><th>Status</th><th>Runs</th><th>Updated</th></tr></thead><tbody>
          {list.map((a) => (
            <tr key={a.id}><td className="min-w-[240px]"><Link className="font-medium hover:underline" href={`/p/${pid}/analyses/${a.id}`}>{a.title}</Link>{a.freshness.outdated && <span className="badge badge-warn ml-1.5" title={a.freshness.reasons.join(" ")}>May be outdated</span>}{a.question && <p className="line-clamp-1 text-[12.5px] text-muted">{a.question}</p>}</td>
              <td>{a.typeLabel}</td><td>{a.initiative ? <Link className="hover:underline" href={`/p/${pid}/i/${a.initiative.id}`}>{a.initiative.title.slice(0, 40)}</Link> : <span className="text-muted">Product-level</span>}</td>
              <td className="capitalize">{a.status.replace("_", " ")}</td><td>{a.runCount}</td><td className="whitespace-nowrap">{ago(a.updated_at)}</td></tr>))}</tbody></table></div>)}
    </div>
  );
}
