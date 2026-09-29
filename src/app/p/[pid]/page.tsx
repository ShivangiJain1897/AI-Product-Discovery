import Link from "next/link";
import { all } from "@/lib/db";
import { getProduct, listInitiatives, listFindings, listDecisions, attention, activityList, listAnalyses, listAssumptions } from "@/lib/queries";
import { ProductContext } from "@/components/product";
import { ActivityFeed, Section, StrengthBadge } from "@/components/bits";
import { StatusActions } from "@/components/initiative";
import { entityHref } from "@/lib/routes";
import { ago } from "@/lib/format";
import { trunc } from "@/lib/entities";
import { DECISION_TYPES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProductOverview({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const p = getProduct(pid);
  const inis = listInitiatives(pid);
  const att = attention(pid);
  const acts = activityList(pid, { limit: 60 });
  const lastInitiative = inis.find((i) => i.status === "active");
  const lastAnalysis = listAnalyses(pid)[0];
  const findings = listFindings(pid, { status: "accepted" }).slice(0, 5);
  const decisions = listDecisions(pid).filter((d) => d.status === "active").slice(0, 3);
  const untested = listAssumptions(pid).filter((a) => a.importance === "high" && a.status === "untested" && a.experiments.length === 0);
  const unresolved = att.experimentsToInterpret.length + att.findingsToReview.length + att.decisionsToReview.length + att.outdatedAnalyses.length + untested.length;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-5">
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-semibold">{p.name}</h1><span className="badge capitalize">{p.lifecycle}</span>{p.is_demo ? <span className="badge badge-warn">Demo · synthetic data</span> : null}{p.archived_at ? <span className="badge">Archived</span> : null}</div>
        {p.description && <p className="text-[14px] text-muted">{p.description}</p>}</div>

      <Section id="resume-h" title="Resume recent work" hint="Pick up where you left off.">
        <div className="grid gap-3 md:grid-cols-3">
          {lastInitiative && <Link href={`/p/${pid}/i/${lastInitiative.id}`} className="card p-3 hover:border-accent"><p className="h-section">Last topic</p><p className="mt-0.5 text-[14px] font-medium">{lastInitiative.title}</p><p className="text-[12.5px] text-muted">updated {ago(lastInitiative.updated_at)}</p></Link>}
          {lastAnalysis && <Link href={`/p/${pid}/analyses/${lastAnalysis.id}`} className="card p-3 hover:border-accent"><p className="h-section">Last analysis</p><p className="mt-0.5 text-[14px] font-medium">{lastAnalysis.title}</p><p className="text-[12.5px] text-muted">{lastAnalysis.typeLabel} · {ago(lastAnalysis.updated_at)}</p></Link>}
          <div className="card p-3"><p className="h-section">Start something</p><div className="mt-1.5 flex flex-wrap gap-1.5"><Link className="btn btn-sm btn-primary" href={`/p/${pid}/new`}>New topic</Link><Link className="btn btn-sm" href={`/p/${pid}/analyses?new=1`}>Start an analysis</Link><Link className="btn btn-sm" href={`/p/${pid}/knowledge?add=1`}>Add evidence</Link></div></div>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section id="learned-h" title="What has been learned" hint="Accepted findings keep their segment and date. None is assumed true for everyone." action={<Link className="btn btn-sm" href={`/p/${pid}/knowledge?tab=findings`}>All knowledge</Link>}>
          {findings.length === 0 ? <p className="card px-4 py-3 text-[13.5px] text-muted">Nothing yet. Findings appear here once you accept them from evidence.</p> : <ul className="space-y-2">{findings.map((f) => <li key={f.id} className="card px-4 py-2.5"><Link className="text-[14px] font-medium hover:underline" href={entityHref(pid, "finding", f.id, f.initiative_id)}>{f.statement}</Link><div className="mt-1 flex flex-wrap gap-1.5"><StrengthBadge s={f.strength} />{f.segment && <span className="badge">{f.segment}</span>}<span className="badge">{f.created_at.slice(0, 10)}</span></div></li>)}</ul>}
          {decisions.length > 0 && <div className="mt-3"><p className="h-section mb-1">Recent decisions</p><ul className="space-y-1.5">{decisions.map((d) => <li key={d.id} className="text-[13.5px]"><span className="badge badge-accent mr-1.5">{DECISION_TYPES[d.decision_type]}</span><Link className="hover:underline" href={entityHref(pid, "decision", d.id, d.initiative_id)}>{d.statement}</Link></li>)}</ul></div>}
        </Section>
        <Section id="open-h" title="What remains unresolved">
          {unresolved === 0 ? <p className="card px-4 py-3 text-[13.5px] text-muted">Nothing is flagged. That means no specific gap has been detected — not that everything is known.</p> : (
            <ul className="space-y-2">
              {att.outdatedAnalyses.map((a) => <li key={a.id} className="card px-4 py-2.5"><Link className="text-[14px] font-medium hover:underline" href={`/p/${pid}/analyses/${a.id}`}>Analysis may be outdated: {a.title}</Link><p className="text-[12.5px] text-muted">{a.reasons.join(" ")}</p><Link className="text-[12.5px] underline" href={`/p/${pid}/analyses/${a.id}`}>Review or rerun</Link></li>)}
              {att.findingsToReview.map((f: any) => <li key={f.id} className="card px-4 py-2.5"><Link className="text-[14px] font-medium hover:underline" href={entityHref(pid, "finding", f.id, f.initiative_id)}>Finding needs review: {trunc(f.statement, 70)}</Link><p className="text-[12.5px] text-muted">{f.review_reason}</p></li>)}
              {att.decisionsToReview.map((d: any) => <li key={d.id} className="card px-4 py-2.5"><Link className="text-[14px] font-medium hover:underline" href={entityHref(pid, "decision", d.id, d.initiative_id)}>Decision ready for review: {trunc(d.statement, 70)}</Link><p className="text-[12.5px] text-muted">{d.review_reason}</p></li>)}
              {att.experimentsToInterpret.map((e: any) => <li key={e.id} className="card px-4 py-2.5"><Link className="text-[14px] font-medium hover:underline" href={entityHref(pid, "experiment", e.id, e.initiative_id)}>Results waiting for interpretation: {e.title}</Link></li>)}
              {untested.map((a) => <li key={a.id} className="card px-4 py-2.5"><Link className="text-[14px] font-medium hover:underline" href={entityHref(pid, "assumption", a.id, a.initiative_id)}>Critical assumption untested: {trunc(a.statement, 70)}</Link></li>)}
            </ul>)}
          {att.openExperiments.length > 0 && <p className="mt-2 text-[13px] text-muted">{att.openExperiments.length} experiment(s) planned or running. <Link className="underline" href={`/p/${pid}/experiments`}>See experiments</Link></p>}
        </Section>
      </div>

      <Section id="ini-h" title="Topics" action={<Link className="btn btn-sm" href={`/p/${pid}/discovery`}>All topics</Link>}>
        <ul className="grid gap-2 md:grid-cols-2">{inis.filter((i) => i.status !== "archived").slice(0, 6).map((i) => <li key={i.id} className="card px-4 py-2.5"><div className="flex items-start justify-between gap-2"><Link className="text-[14px] font-medium hover:underline" href={`/p/${pid}/i/${i.id}`}>{i.title}</Link><span className={`badge capitalize ${i.status === "active" ? "badge-accent" : i.status === "paused" ? "badge-warn" : ""}`}>{i.status}</span></div><p className="text-[12.5px] text-muted">{i.counts.sources} sources · {i.counts.findings} findings · {i.counts.opportunities} opportunities · {i.counts.decisions} decisions</p></li>)}</ul>
        {inis.length === 0 && <p className="card px-4 py-3 text-[13.5px] text-muted">No topics yet. Start with an idea, a problem, a requirement or a question.</p>}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProductContext pid={pid} p={p} />
        <section className="card p-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Recent activity</h2><Link className="btn btn-sm" href={`/p/${pid}/activity`}>Full history</Link></div><ActivityFeed pid={pid} items={acts} limit={8} /></section>
      </div>
      <p className="text-[12.5px] text-muted"><a className="underline" href={`/api/export/${pid}`} download>Export this product’s workspace (JSON)</a> · <Link className="underline" href={`/p/${pid}/knowledge?tab=deleted`}>Recently deleted</Link></p>
    </div>
  );
  void all; void StatusActions;
}
