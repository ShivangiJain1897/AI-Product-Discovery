import Link from "next/link";
import { getInitiative, listFindings, activityList, listOpportunities, listAssumptions } from "@/lib/queries";
import { readinessSignals } from "@/lib/signals";
import { entityHref } from "@/lib/routes";
import { FrameEditor, PlanCard } from "@/components/initiative";
import { ActivityFeed, Section, StrengthBadge, Workspace } from "@/components/bits";
import { trunc } from "@/lib/entities";
import { productKnowledge, suggestWork, topicWork } from "@/lib/knowledge";
import { AddWork } from "@/components/topic-flow";
import { TopicText, WhatNow } from "@/components/work-hub";
import { Icon } from "@/components/icon";
import { AddEvidence } from "@/components/records";
import type { TopicType } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const STATE: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-sunken text-muted" },
  in_progress: { label: "In progress", cls: "bg-accent-soft text-accent-strong" },
  done: { label: "Done", cls: "bg-accent text-white" },
  needs_refresh: { label: "Needs refresh", cls: "bg-warn-soft text-warn" },
};

export default async function TopicWork({ params, searchParams }: { params: Promise<{ pid: string; iid: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { pid, iid } = await params; const sp = await searchParams;
  const i = getInitiative(pid, iid);
  const b = `/p/${pid}/i/${iid}`;
  const work = topicWork(pid, iid);
  const suggestions = suggestWork(pid, iid);
  const k = productKnowledge(pid, iid);
  const signals = readinessSignals(pid, iid);
  const findings = listFindings(pid, { initiativeId: iid, status: "accepted" });
  const opps = listOpportunities(pid, iid);
  const unknowns = [
    ...(i.plan?.unknowns ?? []).map((u: string) => ({ text: u, from: "Plan" })),
    ...opps.filter((o) => o.unknowns).map((o) => ({ text: `${trunc(o.title, 90)}: ${o.unknowns}`, from: "Opportunity" })),
    ...listAssumptions(pid, iid).filter((a) => a.status === "untested" && a.importance === "high").map((a) => ({ text: a.statement, from: "Untested assumption" })),
  ];
  const topicType = (i.topic_type in { idea: 1, problem: 1, requirement: 1, question: 1 } ? i.topic_type : "question") as TopicType;
  return (
    <Workspace main={
      <>
        {sp.welcome && <div role="status" className="fade-in rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-[14px]">{work.length ? `Your plan is ready: ${work.length} piece${work.length === 1 ? "" : "s"} of work. Open any of them — there’s no required order.` : "Your topic is set up. Choose what to do with it whenever you’re ready."}</div>}
        <div className="card p-4"><TopicText pid={pid} iid={iid} type={i.topic_type} text={i.topic_text || i.question} /></div>

        <WhatNow pid={pid} iid={iid} items={suggestions} />

        <Section id="work-h" title="Your work" hint="Everything you’ve chosen to do with this topic. Each piece keeps its own history, and later work can build on earlier work." action={<AddWork pid={pid} iid={iid} topicType={topicType} knowledge={k} primary label="Add work" />}>
          {work.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
              <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-strong"><Icon name="compass" size={22} /></span>
              <p className="text-[16px] font-semibold">Nothing planned yet</p>
              <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">Choose from research, analysis, design and validation — as many as you like. You can always add more later.</p>
              <div className="mt-4 flex justify-center"><AddWork pid={pid} iid={iid} topicType={topicType} knowledge={k} primary label="Choose what to do" /></div>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {work.map((w) => {
                const st = STATE[w.state];
                return (
                  <li key={w.id}>
                    <Link href={`/p/${pid}/analyses/${w.id}`} className="tile block h-full">
                      <span className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-accent-strong"><Icon name={w.icon} size={19} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2"><span className="text-[14.5px] font-semibold leading-tight">{w.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span></span>
                          <span className="mt-1 block text-[12.5px] leading-snug text-muted">{w.state === "needs_refresh" ? w.outdatedReason : w.produces}</span>
                          {w.state === "not_started" && w.note && <span className="mt-1.5 block text-[12px] text-muted">Needs: {w.note}</span>}
                          {w.runs > 1 && <span className="mt-1.5 block text-[12px] text-muted">{w.runs} runs kept</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section id="know-h" title="What we know so far" hint="Evidence, findings, problems and decisions from this topic. They’re shared with all your work above." action={<div className="flex gap-2"><Link className="btn btn-sm" href={`${b}/evidence`}>Evidence</Link><Link className="btn btn-sm" href={`${b}/explore`}>Explore</Link><Link className="btn btn-sm" href={`${b}/decide`}>Decide</Link></div>}>
          <div className="space-y-3">
            {signals.length > 0 && <ul className="space-y-2">{signals.slice(0, 4).map((s) => (
              <li key={s.id} className="card px-4 py-2.5"><Link href={entityHref(pid, s.type, s.targetId, iid)} className="text-[14px] font-medium hover:underline">{s.message}</Link><p className="text-[13px] text-muted"><span className="font-medium">Why this appeared:</span> {s.why}</p></li>))}</ul>}
            {findings.length === 0 ? <p className="card px-4 py-3 text-[13.5px] text-muted">No findings yet. They appear when you accept themes from research, or highlight and state what evidence shows.</p> : (
              <ul className="space-y-2">{findings.slice(0, 4).map((f) => <li key={f.id} className="card px-4 py-2.5"><Link href={entityHref(pid, "finding", f.id, iid)} className="text-[14px] font-medium hover:underline">{f.statement}</Link><div className="mt-1"><StrengthBadge s={f.strength} /></div></li>)}</ul>
            )}
            {unknowns.length > 0 && <details className="card px-4 py-2.5"><summary className="cursor-pointer text-[13.5px] font-medium">What remains uncertain ({unknowns.length})</summary><ul className="mt-2 divide-y divide-line">{unknowns.slice(0, 8).map((u, n) => <li key={n} className="flex gap-3 py-1.5 text-[13.5px]"><span className="w-32 shrink-0 text-[12px] text-muted">{u.from}</span><span>{u.text}</span></li>)}</ul></details>}
          </div>
        </Section>

        <details className="card p-4"><summary className="cursor-pointer text-[14px] font-semibold">Frame, constraints and starting plan</summary>
          <div className="mt-3 space-y-4">
            <FrameEditor pid={pid} iid={iid} init={{ question: i.question, affected: i.affected, outcome: i.outcome, decision_to_inform: i.decision_to_inform, scope: i.scope, constraints: i.constraints }} />
            <PlanCard pid={pid} iid={iid} plan={i.plan} refined={i.refined_question} refinedStatus={i.refined_status} original={i.question} startHref={`${b}/evidence?add=1`} />
          </div>
        </details>
      </>
    } panel={
      <div className="space-y-5">
        <section className="card p-4"><h2 className="mb-1 text-[15px] font-semibold">Bring in what you have</h2><p className="mb-3 text-[13px] text-muted">Interview notes, tickets, a brief, or an event-log CSV. Every piece of work can use it.</p><AddEvidence pid={pid} iid={iid} label="Add evidence" primary /></section>
        <section className="card p-4"><h2 className="mb-2 text-[15px] font-semibold">Recent activity</h2><ActivityFeed pid={pid} items={activityList(pid, { initiativeId: iid, limit: 8 })} /></section>
      </div>
    } />
  );
}
