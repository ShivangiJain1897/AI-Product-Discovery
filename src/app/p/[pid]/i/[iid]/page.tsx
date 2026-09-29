import Link from "next/link";
import { getInitiative, listFindings, listAnalyses, activityList, listOpportunities, listAssumptions } from "@/lib/queries";
import { readinessSignals, suggestNext } from "@/lib/signals";
import { entityHref } from "@/lib/routes";
import { FrameEditor, PlanCard } from "@/components/initiative";
import { ActivityFeed, Section, StrengthBadge, Workspace } from "@/components/bits";
import { trunc } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function Overview({ params, searchParams }: { params: Promise<{ pid: string; iid: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { pid, iid } = await params; const sp = await searchParams;
  const i = getInitiative(pid, iid);
  const b = `/p/${pid}/i/${iid}`;
  const signals = readinessSignals(pid, iid);
  const next = suggestNext(pid, iid);
  const findings = listFindings(pid, { initiativeId: iid, status: "accepted" });
  const opps = listOpportunities(pid, iid);
  const unknowns = [
    ...(i.plan?.unknowns ?? []).map((u: string) => ({ text: u, from: "Plan" })),
    ...opps.filter((o) => o.unknowns).map((o) => ({ text: `${trunc(o.title, 90)}: ${o.unknowns}`, from: "Opportunity" })),
    ...listAssumptions(pid, iid).filter((a) => a.status === "untested" && a.importance === "high").map((a) => ({ text: a.statement, from: "Untested assumption" })),
  ];
  const analyses = listAnalyses(pid, { initiativeId: iid });
  const startHref = i.started_mode === "process" ? `${b}/explore?tab=process` : `${b}/evidence?add=1`;
  return (
    <Workspace main={
      <>
        {sp.welcome && <div role="status" className="rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-[14px]">Your discovery is set up. Below is a starting plan you can edit; when you’re ready, add whatever evidence you already have — rough notes are fine.</div>}
        <div className="card border-accent/40 bg-accent-soft/40 p-4">
          <p className="h-section">Suggested next action</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-[16px] font-semibold">{next.label}</p><p className="text-[13.5px] text-muted">{next.why}</p></div>
            <Link href={next.href} className="btn btn-primary">{next.label} →</Link>
          </div>
        </div>
        <FrameEditor pid={pid} iid={iid} init={{ question: i.question, affected: i.affected, outcome: i.outcome, decision_to_inform: i.decision_to_inform, scope: i.scope, constraints: i.constraints }} />
        <PlanCard pid={pid} iid={iid} plan={i.plan} refined={i.refined_question} refinedStatus={i.refined_status} original={i.question} startHref={startHref} />
        <Section id="signals-h" title="What needs attention" hint="Specific signals, each with the reason it appeared. There is no completion percentage: discovery is iterative.">
          {signals.length === 0 ? <p className="card px-4 py-3 text-[13.5px] text-muted">Nothing is flagged right now. That is not proof the work is done — it means no specific gap or conflict has been detected.</p> : (
            <ul className="space-y-2">
              {signals.map((s) => (
                <li key={s.id} className="card px-4 py-2.5">
                  <Link href={entityHref(pid, s.type, s.targetId, iid)} className="text-[14px] font-medium hover:underline">{s.message}</Link>
                  <p className="text-[13px] text-muted"><span className="font-medium">Why this appeared:</span> {s.why}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section id="learned-h" title="What we learned so far" action={<Link className="btn btn-sm" href={`${b}/evidence?tab=findings`}>All findings</Link>}>
          {findings.length === 0 ? <p className="card px-4 py-3 text-[13.5px] text-muted">No findings yet. Findings come from evidence — add some, highlight what matters, then state what it tells you.</p> : (
            <ul className="space-y-2">{findings.slice(0, 5).map((f) => (
              <li key={f.id} className="card px-4 py-2.5"><Link href={entityHref(pid, "finding", f.id, iid)} className="text-[14px] font-medium hover:underline">{f.statement}</Link><div className="mt-1"><StrengthBadge s={f.strength} /></div></li>
            ))}</ul>
          )}
        </Section>
        <Section id="unknown-h" title="What remains uncertain">
          {unknowns.length === 0 ? <p className="text-[13.5px] text-muted">No unknowns recorded.</p> : <ul className="card divide-y divide-line">{unknowns.slice(0, 8).map((u, k) => <li key={k} className="flex gap-3 px-4 py-2 text-[13.5px]"><span className="w-36 shrink-0 text-[12px] text-muted">{u.from}</span><span>{u.text}</span></li>)}</ul>}
        </Section>
      </>
    } panel={
      <div className="space-y-5">
        <section className="card p-4"><h2 className="mb-2 text-[15px] font-semibold">Recent activity</h2><ActivityFeed pid={pid} items={activityList(pid, { initiativeId: iid, limit: 8 })} /></section>
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Analyses</h2><Link className="btn btn-sm" href={`/p/${pid}/analyses?new=1&i=${iid}`}>Start one</Link></div>
          {analyses.length === 0 ? <p className="text-[13.5px] text-muted">No analyses yet. Start one from evidence, or directly from the product.</p> : (
            <ul className="space-y-1.5">{analyses.slice(0, 6).map((a) => (
              <li key={a.id} className="text-[13.5px]"><Link href={`/p/${pid}/analyses/${a.id}`} className="hover:underline">{a.title}</Link> <span className="text-muted">· {a.typeLabel}</span>{a.freshness.outdated && <span className="badge badge-warn ml-1.5" title={a.freshness.reasons.join(" ")}>May be outdated</span>}</li>
            ))}</ul>
          )}
        </section>
      </div>
    } />
  );
}
