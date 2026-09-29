import Link from "next/link";
import { getInitiative, listDecisions, listFindings, listOpportunities, listExperiments, listAnalyses } from "@/lib/queries";
import { all } from "@/lib/db";
import { DecisionForm, DecisionActions } from "@/components/validate";
import { EntityEditor } from "@/components/entity";
import { DECISION_FIELDS } from "@/components/specs";
import { DeleteButton } from "@/components/records";
import { Empty } from "@/components/ui";
import { Workspace } from "@/components/bits";
import { DECISION_TYPES } from "@/lib/types";
import { entityHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function Decide({ params, searchParams }: { params: Promise<{ pid: string; iid: string }>; searchParams: Promise<{ item?: string }> }) {
  const { pid, iid } = await params; const sp = await searchParams;
  getInitiative(pid, iid);
  const base = `/p/${pid}/i/${iid}/decide`;
  const decisions = listDecisions(pid, iid);
  const cands = {
    findings: listFindings(pid, { initiativeId: iid, status: "accepted" }).map((f) => ({ id: f.id, label: f.statement })),
    opportunities: listOpportunities(pid, iid).map((o) => ({ id: o.id, label: o.title })),
    experiments: listExperiments(pid, { initiativeId: iid }).map((e) => ({ id: e.id, label: `${e.title} (${e.outcome ?? e.status})` })),
    runs: listAnalyses(pid, { initiativeId: iid }).flatMap((a) => all<any>("SELECT id, seq FROM analysis_runs WHERE analysis_id=? ORDER BY seq DESC LIMIT 1", a.id).map((r) => ({ id: r.id, label: `${a.title} — run ${r.seq}` }))),
  };
  const [kind, id] = (sp.item ?? "").split(":");
  const sel = kind === "decision" ? decisions.find((d) => d.id === id) : null;
  const panel = sel && (
    <div className="space-y-3">
      <section className="card p-4" aria-label="Decision details">
        <div className="mb-1 flex items-center justify-between"><span className="h-section">Decision</span><Link href={base} className="btn btn-quiet btn-sm" aria-label="Close">✕</Link></div>
        {sel.needs_review ? <div className="mb-3 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]"><p className="font-medium text-warn">Ready for review</p><p>{sel.review_reason}</p></div> : null}
        <EntityEditor pid={pid} type="decision" id={sel.id} fields={DECISION_FIELDS} values={sel} />
        <DecisionActions pid={pid} d={sel} />
      </section>
      <section className="card p-4"><h3 className="h-section mb-1">Evidence trail</h3>
        <p className="mb-2 text-[12.5px] text-muted">What this decision traces back to, with the exact versions at the time it was recorded.</p>
        {sel.trace.findings.length + sel.trace.opportunities.length + sel.trace.experiments.length + sel.trace.runs.length === 0 && <p className="text-[13px] text-warn">No supporting records are linked. Edit the decision’s evidence by recording it again with links.</p>}
        {sel.trace.findings.map((f: any) => <div key={f.id} className="mb-2 text-[13px]"><Link className="font-medium hover:underline" href={entityHref(pid, "finding", f.id, iid)}>Finding: {f.statement}</Link>
          <ul className="mt-0.5 space-y-0.5">{f.excerpts.map((e: any) => <li key={e.id} className="text-[12.5px]">“{e.text.slice(0, 120)}{e.text.length > 120 ? "…" : ""}” — <Link className="underline" href={`/p/${pid}/sources/${e.source_id}?excerpt=${e.id}&i=${iid}`}>{e.source_title}</Link> v{e.version}{e.current !== e.version && <span className="badge badge-warn ml-1">now v{e.current}</span>}</li>)}</ul></div>)}
        {sel.trace.opportunities.map((o: any) => <p key={o.id} className="text-[13px]">Opportunity: <Link className="underline" href={entityHref(pid, "opportunity", o.id, iid)}>{o.title}</Link></p>)}
        {sel.trace.experiments.map((e: any) => <p key={e.id} className="text-[13px]">Experiment: <Link className="underline" href={entityHref(pid, "experiment", e.id, iid)}>{e.title}</Link> <span className="badge">{e.outcome ?? "no outcome"}</span></p>)}
        {sel.trace.runs.map((r: any) => <div key={r.id} className="text-[13px]">Analysis: <Link className="underline" href={`/p/${pid}/analyses/${r.analysis_id}?run=${r.seq}`}>{r.analysis_title}, run {r.seq}</Link> <span className="badge">{r.mode}</span>
          <ul className="text-[12.5px] text-muted">{r.sources.map((s: any) => <li key={s.id}>used {s.title} v{s.version}{s.current !== s.version && <span className="badge badge-warn ml-1">now v{s.current}</span>}</li>)}</ul></div>)}
      </section>
      <div className="px-1"><DeleteButton pid={pid} type="decision" id={sel.id} label="decision" redirect={base} /></div>
    </div>
  );
  return (
    <Workspace panel={panel} main={<>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[17px] font-semibold">Decide</h2><p className="text-[13.5px] text-muted">What should we do next, given the evidence — and what would change our mind?</p></div><DecisionForm pid={pid} iid={iid} cands={cands} gotoTemplate={`${base}?item=decision:{id}`} /></div>
      {decisions.length === 0 ? <Empty title="No decision recorded yet">A decision can be “investigate further”, “pause” or “stop”. It doesn’t have to be “build it”. Say what you decided, why, what else you considered, and what is still unresolved.</Empty> : (
        <ul className="space-y-2">{decisions.map((d) => (
          <li key={d.id}><Link href={`${base}?item=decision:${d.id}`} className={`card block px-4 py-3 hover:border-accent ${sel?.id === d.id ? "border-accent bg-accent-soft/40" : ""} ${d.status === "superseded" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-1.5"><span className="badge badge-accent">{DECISION_TYPES[d.decision_type]}</span><span className="text-[12.5px] text-muted">{d.decided_on}</span>{d.status === "superseded" && <span className="badge">Superseded</span>}{d.needs_review ? <span className="badge badge-warn">Ready for review</span> : null}</div>
            <p className="mt-1 text-[14.5px] font-medium">{d.statement}</p><p className="line-clamp-2 text-[13px] text-muted">{d.rationale}</p>
            <p className="mt-1 text-[12px] text-muted">Rests on {d.trace.findings.length} finding(s), {d.trace.experiments.length} experiment(s), {d.trace.runs.length} analysis run(s)</p></Link></li>))}</ul>)}
    </>} />
  );
}
