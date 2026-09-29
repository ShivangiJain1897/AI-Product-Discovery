import Link from "next/link";
import { all } from "@/lib/db";
import { getInitiative, listAssumptions, listExperiments, listConcepts } from "@/lib/queries";
import { NewEntity, EntityEditor } from "@/components/entity";
import { ASSUMPTION_FIELDS, EXPERIMENT_NEW_FIELDS } from "@/components/specs";
import { ExperimentPanel } from "@/components/validate";
import { AssistPanel } from "@/components/assist";
import { DeleteButton, LinkAdder } from "@/components/records";
import { Empty } from "@/components/ui";
import { Workspace, OriginBadge } from "@/components/bits";
import { ASSUMPTION_CATEGORIES, EXPERIMENT_METHODS } from "@/lib/types";

export const dynamic = "force-dynamic";
const IMP: Record<string, number> = { high: 3, medium: 2, low: 1, unknown: 0 };
const SUP: Record<string, number> = { none: 3, unknown: 3, weak: 2, moderate: 1, strong: 0 };

export default async function Validate({ params, searchParams }: { params: Promise<{ pid: string; iid: string }>; searchParams: Promise<{ item?: string }> }) {
  const { pid, iid } = await params; const sp = await searchParams;
  getInitiative(pid, iid);
  const base = `/p/${pid}/i/${iid}/validate`;
  const assumptions = listAssumptions(pid, iid).sort((a, b) => IMP[b.importance] * (1 + SUP[b.support]) - IMP[a.importance] * (1 + SUP[a.support]));
  const experiments = listExperiments(pid, { initiativeId: iid });
  const concepts = listConcepts(pid, iid);
  const pending = all<any>("SELECT id, kind, mode FROM ai_proposals WHERE product_id=? AND initiative_id=? AND status='pending' ORDER BY created_at DESC", pid, iid);
  const [kind, id] = (sp.item ?? "").split(":");
  let panel: React.ReactNode = null;
  if (kind === "experiment") {
    const e = experiments.find((x) => x.id === id);
    if (e) panel = <div className="space-y-3"><ExperimentPanel pid={pid} iid={iid} e={e} closeHref={base} /><div className="px-1"><DeleteButton pid={pid} type="experiment" id={e.id} label="experiment" redirect={base} /></div></div>;
  } else if (kind === "assumption") {
    const a = assumptions.find((x) => x.id === id);
    if (a) {
      const conceptCands = concepts.filter((c) => !a.concepts.some((x: any) => x.id === c.id)).map((c) => ({ type: "concept", id: c.id, label: c.title }));
      panel = (
        <div className="space-y-3">
          <section className="card p-4"><div className="mb-1 flex items-center justify-between"><span className="h-section">Assumption</span><Link href={base} className="btn btn-quiet btn-sm" aria-label="Close">✕</Link></div>
            <EntityEditor pid={pid} type="assumption" id={a.id} fields={ASSUMPTION_FIELDS} values={a} />
            {a.concepts.length > 0 && <p className="mt-3 text-[13px]"><span className="h-section">Needed by </span>{a.concepts.map((c: any) => <Link key={c.id} className="ml-1 underline" href={`/p/${pid}/i/${iid}/explore?item=concept:${c.id}`}>{c.title}</Link>)}</p>}
            <LinkAdder pid={pid} fromType="assumption" fromId={a.id} candidates={conceptCands} relations={[{ value: "relies_on", label: "is relied on by", direction: "in" }]} label="Relied on by concept…" /></section>
          <section className="card p-4"><div className="mb-1.5 flex items-center justify-between"><h3 className="h-section">Experiments testing it</h3>
            <NewEntity pid={pid} iid={iid} type="experiment" fields={EXPERIMENT_NEW_FIELDS} defaults={{ hypothesis: `If ${a.statement.replace(/\.$/, "").replace(/^./, (c: string) => c.toLowerCase())}, we expect to observe…` }} title="Test this assumption" label="Test this assumption" links={[{ type: "assumption", id: a.id, relation: "tested_by", direction: "in" }]} gotoTemplate={`${base}?item=experiment:{id}`} /></div>
            {a.experiments.length === 0 ? <p className="text-[13px] text-muted">No experiment yet.</p> : <ul className="text-[13px]">{a.experiments.map((e: any) => <li key={e.id}><Link className="underline" href={`${base}?item=experiment:${e.id}`}>{e.title}</Link> <span className="badge">{e.outcome ?? e.status}</span></li>)}</ul>}</section>
          <AssistPanel pid={pid} pending={pending.filter((p) => p.kind === "experiment")} actions={[{ kind: "experiment", label: "Design a low-cost experiment", hint: "An outline with the success criterion left for you to define before running.", scope: { sourceIds: [], initiativeId: iid, targetType: "assumption", targetId: a.id } }]} />
          <div className="px-1"><DeleteButton pid={pid} type="assumption" id={a.id} label="assumption" redirect={base} /></div>
        </div>
      );
    }
  }
  return (
    <Workspace panel={panel} main={<>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[17px] font-semibold">Validate</h2><p className="text-[13.5px] text-muted">What must be true, how will we test it, and what happened? Sorted by how consequential and how weakly supported.</p></div>
        <div className="flex gap-2"><NewEntity pid={pid} iid={iid} type="assumption" fields={ASSUMPTION_FIELDS} title="Capture an assumption" label="Add assumption" gotoTemplate={`${base}?item=assumption:{id}`} /><NewEntity pid={pid} iid={iid} type="experiment" fields={EXPERIMENT_NEW_FIELDS} title="Design an experiment" label="Design an experiment" openOn="experiment" primary gotoTemplate={`${base}?item=experiment:{id}`} /></div></div>
      <section aria-labelledby="asm-h"><h3 id="asm-h" className="mb-1.5 text-[15px] font-semibold">Assumptions</h3>
        {assumptions.length === 0 ? <Empty title="No assumptions yet">Start from a solution concept in Explore: ask “what must be true for this to work?” Categories are optional.</Empty> : (
          <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Assumption</th><th>Kind</th><th>Consequence</th><th>Support</th><th>Status</th><th>Tests</th></tr></thead><tbody>
            {assumptions.map((a) => { const crit = a.importance === "high" && ["weak", "none", "unknown"].includes(a.support) && !["supported", "refuted"].includes(a.status); return (
              <tr key={a.id} className={sp.item === `assumption:${a.id}` ? "bg-accent-soft/40" : ""}><td className="min-w-[240px]"><Link className="font-medium hover:underline" href={`${base}?item=assumption:${a.id}`}>{a.statement}</Link>{crit && <span className="badge badge-warn ml-1.5">Consequential and weakly supported</span>}<OriginBadge origin={a.origin} /></td>
                <td>{ASSUMPTION_CATEGORIES[a.category]}</td><td className="capitalize">{a.importance === "unknown" ? "not judged" : a.importance}</td><td className="capitalize">{a.support}</td><td className="capitalize">{a.status}</td><td>{a.experiments.length || <span className="text-muted">none</span>}</td></tr>); })}</tbody></table></div>)}
      </section>
      <section aria-labelledby="exp-h"><h3 id="exp-h" className="mb-1.5 text-[15px] font-semibold">Experiments</h3>
        {experiments.length === 0 ? <Empty title="Nothing is being tested">Choose the assumption that is most consequential and least supported, and design the cheapest test that could show you’re wrong.</Empty> : (
          <ul className="space-y-2">{experiments.map((e) => (
            <li key={e.id}><Link href={`${base}?item=experiment:${e.id}`} className={`card block px-4 py-3 hover:border-accent ${sp.item === `experiment:${e.id}` ? "border-accent bg-accent-soft/40" : ""}`}>
              <div className="flex items-start justify-between gap-3"><p className="text-[14.5px] font-medium">{e.title}</p><div className="flex gap-1"><span className="badge capitalize">{e.status}</span>{e.outcome && <span className={`badge ${e.outcome === "supported" ? "badge-accent" : e.outcome === "refuted" ? "badge-danger" : "badge-warn"}`}>{e.outcome}</span>}{e.results && !e.interpretation && <span className="badge badge-warn">Needs interpretation</span>}</div></div>
              <p className="text-[13px] text-muted">{EXPERIMENT_METHODS[e.method]} · {e.target}</p>
              <p className="mt-0.5 text-[13px]"><span className="text-muted">Success criterion:</span> {e.success_criterion || <span className="text-warn">not defined</span>}</p></Link></li>))}</ul>)}
      </section>
    </>} />
  );
}
