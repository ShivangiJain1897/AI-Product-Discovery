import Link from "next/link";
import { listExperiments } from "@/lib/queries";
import { Empty } from "@/components/ui";
import { EXPERIMENT_METHODS } from "@/lib/types";
import { entityHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function Experiments({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const all = listExperiments(pid);
  const groups: [string, string, (e: any) => boolean][] = [["Needs interpretation", "Results are recorded but not yet interpreted.", (e) => !!e.results && !e.interpretation], ["Planned and running", "Being designed or in the field.", (e) => ["planned", "running"].includes(e.status) && !(e.results && !e.interpretation)], ["Completed", "Negative and inconclusive results are valid learning.", (e) => e.status === "completed" && !(e.results && !e.interpretation)]];
  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      <h1 className="text-[20px] font-semibold">Experiments</h1><p className="mb-4 text-[13.5px] text-muted">Validation activities across every discovery in this product. Design one from an assumption in a discovery’s Validate section.</p>
      {all.length === 0 && <Empty title="No experiments yet">Open a discovery, choose an assumption that is consequential and weakly supported, and design the cheapest test that could prove you wrong.</Empty>}
      {groups.map(([t, h, f]) => { const list = all.filter(f); return list.length > 0 && (
        <section key={t} className="mb-6"><h2 className="text-[15px] font-semibold">{t} ({list.length})</h2><p className="mb-2 text-[12.5px] text-muted">{h}</p>
          <ul className="space-y-2">{list.map((e) => (
            <li key={e.id}><Link href={entityHref(pid, "experiment", e.id, e.initiative_id)} className="card block px-4 py-3 hover:border-accent"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[14.5px] font-medium">{e.title}</p><div className="flex gap-1"><span className="badge capitalize">{e.status}</span>{e.outcome && <span className={`badge ${e.outcome === "supported" ? "badge-accent" : e.outcome === "refuted" ? "badge-danger" : "badge-warn"}`}>{e.outcome}</span>}</div></div>
              <p className="text-[12.5px] text-muted">{EXPERIMENT_METHODS[e.method]}{e.initiative ? ` · ${e.initiative.title}` : ""}</p><p className="mt-1 text-[13px]"><span className="text-muted">Criterion:</span> {e.success_criterion || "not defined"}</p>{e.results && <p className="text-[13px]"><span className="text-muted">Result:</span> {e.results.slice(0, 140)}{e.results.length > 140 ? "…" : ""}</p>}</Link></li>))}</ul></section>); })}
    </div>
  );
}
