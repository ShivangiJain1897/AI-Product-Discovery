import Link from "next/link";
import { all } from "@/lib/db";
import { getInitiative, listOpportunities, listConcepts, listMaps, opportunityTree, related, listAssumptions } from "@/lib/queries";
import { productDims } from "@/lib/priority";
import { NewEntity, EntityEditor } from "@/components/entity";
import { CONCEPT_FIELDS, OPP_FIELDS, ASSUMPTION_FIELDS } from "@/components/specs";
import { TabLinks } from "@/components/findings";
import { AssistPanel } from "@/components/assist";
import { PriorityTable } from "@/components/priority";
import { DeleteButton, LinkAdder, Unlink } from "@/components/records";
import { Empty } from "@/components/ui";
import { Workspace, StrengthBadge, OriginBadge, Related } from "@/components/bits";
import { entityHref } from "@/lib/routes";
import { INTERVENTIONS } from "@/lib/types";
import { ProcessTab } from "@/components/process-tab";

export const dynamic = "force-dynamic";
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));

export default async function Explore({ params, searchParams }: { params: Promise<{ pid: string; iid: string }>; searchParams: Promise<{ tab?: string; item?: string }> }) {
  const { pid, iid } = await params; const sp = await searchParams;
  const ini = getInitiative(pid, iid);
  const maps = listMaps(pid, iid);
  const showProcess = !!ini.process_enabled || maps.length > 0;
  const tab = sp.tab ?? (sp.item ? "opportunities" : "opportunities");
  const base = `/p/${pid}/i/${iid}/explore`;
  const opps = listOpportunities(pid, iid);
  const concepts = listConcepts(pid, iid);
  const pending = all<any>("SELECT id, kind, mode FROM ai_proposals WHERE product_id=? AND initiative_id=? AND status='pending' ORDER BY created_at DESC", pid, iid);
  const tabs: [string, string][] = [["opportunities", "Opportunities"], ["tree", "Opportunity tree"], ["prioritize", "Compare & prioritise"], ...(showProcess ? [["process", "Process"] as [string, string]] : [])];
  const tabBar = <TabLinks base={base} current={tab} tabs={tabs} />;
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[17px] font-semibold">Explore</h2><p className="text-[13.5px] text-muted">Which problems deserve attention, for whom, and what could we do about them?</p></div>
      <div className="flex flex-wrap gap-2">
        {!showProcess && <Link href={`${base}?tab=process`} className="btn btn-sm btn-quiet">Add a process lens</Link>}
        <NewEntity pid={pid} iid={iid} type="opportunity" fields={OPP_FIELDS} title="Add an opportunity" label="Add opportunity" openOn="opportunity" primary gotoTemplate={`${base}?item=opportunity:{id}`} /></div></div>
  );

  if (tab === "process") return <div className="px-6 py-5 space-y-5">{header}{tabBar}<ProcessTab pid={pid} iid={iid} maps={maps} enabled={showProcess} sources={all<any>("SELECT s.id, s.title FROM initiative_sources x JOIN sources s ON s.id=x.source_id WHERE x.initiative_id=? AND s.deleted_at IS NULL AND s.content_kind='text'", iid)} /></div>;
  if (tab === "prioritize") return <div className="px-6 py-5 space-y-5">{header}{tabBar}{opps.length ? <PriorityTable pid={pid} dims={productDims(pid)} opps={opps as any} /> : <Empty title="Nothing to compare yet">Add at least two opportunities to compare them.</Empty>}</div>;
  if (tab === "tree") {
    const t = opportunityTree(pid, iid);
    return <div className="px-6 py-5 space-y-5">{header}{tabBar}
      <p className="text-[13px] text-muted">The same records as the list, arranged as outcome → opportunities → solution concepts → experiments. Edit in the list; this view updates.</p>
      <div className="card p-4"><p className="rounded bg-accent-soft px-3 py-2 text-[14px] font-medium">Desired outcome: {t.outcome}</p>
        <ul className="mt-3 space-y-3 border-l-2 border-line pl-4">{t.opportunities.map((o) => (
          <li key={o.id}><Link className="font-medium hover:underline" href={`${base}?item=opportunity:${o.id}`}>◆ {o.title}</Link>
            {o.concepts.length === 0 ? <p className="ml-4 text-[12.5px] text-muted">No solution concepts yet</p> : <ul className="ml-4 mt-1 space-y-1.5 border-l border-line pl-4">{o.concepts.map((c) => (
              <li key={c.id}><Link className="hover:underline" href={`${base}?item=concept:${c.id}`}>◇ {c.title}</Link>
                {c.experiments.length > 0 && <ul className="ml-4 border-l border-dashed border-line pl-4">{c.experiments.map((e) => <li key={e.id}><Link className="text-[13px] text-muted hover:underline" href={`/p/${pid}/i/${iid}/validate?item=experiment:${e.id}`}>▸ {e.title} <span className="badge">{e.outcome ?? e.status}</span></Link></li>)}</ul>}</li>))}</ul>}
          </li>))}</ul>{t.opportunities.length === 0 && <p className="mt-3 text-[13px] text-muted">No opportunities yet.</p>}</div></div>;
  }

  // list + detail
  const [kind, id] = (sp.item ?? "").split(":");
  let panel: React.ReactNode = null;
  if (kind === "opportunity") {
    const o = opps.find((x) => x.id === id);
    if (o) {
      const rel = related("opportunity", o.id);
      const findingLinks = rel.filter((r) => r.type === "finding");
      const findingCands = all<any>("SELECT id, statement FROM findings WHERE product_id=? AND deleted_at IS NULL AND status='accepted'", pid).filter((f) => !findingLinks.some((l) => l.id === f.id)).map((f) => ({ type: "finding", id: f.id, label: f.statement }));
      const stepCands = all<any>("SELECT n.id, n.name, m.name mname FROM process_nodes n JOIN process_maps m ON m.id=n.map_id WHERE m.product_id=? AND m.deleted_at IS NULL AND m.kind='current' AND n.type='activity'", pid).filter((s) => !o.processSteps.some((p: any) => p.id === s.id)).map((s) => ({ type: "process_node", id: s.id, label: `${s.name} (${s.mname})` }));
      const mine = tokens(o.title + " " + o.problem);
      const dups = opps.filter((x) => x.id !== o.id).map((x) => { const t = tokens(x.title + " " + x.problem); const inter = [...mine].filter((w) => t.has(w)).length; return { x, j: inter / (mine.size + t.size - inter || 1) }; }).filter((d) => d.j >= 0.25).sort((a, b) => b.j - a.j);
      panel = (
        <div className="space-y-3">
          <section className="card p-4" aria-label="Opportunity details">
            <div className="mb-1 flex items-center justify-between"><span className="h-section">Opportunity</span><Link href={base} className="btn btn-quiet btn-sm" aria-label="Close">✕</Link></div>
            <div className="mb-2 flex gap-1.5"><OriginBadge origin={o.origin} /></div>
            <EntityEditor pid={pid} type="opportunity" id={o.id} fields={OPP_FIELDS} values={o} />
            {dups.length > 0 && <div className="mt-3 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]"><p className="font-medium text-warn">May overlap with</p><ul className="list-disc pl-4">{dups.map((d) => <li key={d.x.id}><Link className="underline" href={`${base}?item=opportunity:${d.x.id}`}>{d.x.title}</Link></li>)}</ul><p className="text-[12px] text-muted">Based on shared wording only. Check whether they describe the same problem for the same people.</p></div>}
          </section>
          <section className="card p-4"><h3 className="h-section mb-1.5">Supporting and conflicting evidence</h3>
            {o.findings.length === 0 && o.metricRefs.length === 0 ? <p className="text-[13px] text-warn">No finding is linked, so nothing shows this problem is real yet.</p> : <ul className="space-y-2">{o.findings.map((f: any) => <li key={f.id} className="text-[13px]"><Link className="hover:underline" href={entityHref(pid, "finding", f.id, iid)}>{f.statement}</Link><div className="mt-0.5"><StrengthBadge s={f.strength} />{f.strength.contradicting > 0 && <span className="badge badge-danger ml-1">{f.strength.contradicting} contradicting</span>}<span className="ml-1"><Unlink pid={pid} linkId={findingLinks.find((l) => l.id === f.id)?.linkId ?? ""} /></span></div></li>)}</ul>}
            {o.metricRefs.map((m: any) => <p key={m.run_id + m.metric} className="mt-1 text-[12.5px] text-muted">Data: {m.label} = {m.value}</p>)}
            <LinkAdder pid={pid} fromType="opportunity" fromId={o.id} candidates={findingCands} relations={[{ value: "informs", label: "informs this", direction: "in" }]} label="Link a finding…" /></section>
          {o.processSteps.length > 0 && <section className="card p-4"><h3 className="h-section mb-1">Related process steps</h3><ul className="text-[13px]">{o.processSteps.map((s: any) => <li key={s.id}><Link className="underline" href={`/p/${pid}/maps/${s.map_id}`}>{s.name}</Link> <span className="text-muted">· {s.map_name}</span></li>)}</ul></section>}
          {stepCands.length > 0 && <div className="px-1"><LinkAdder pid={pid} fromType="opportunity" fromId={o.id} candidates={stepCands} relations={[{ value: "relates_to", label: "relates to" }]} label="Relate to a process step…" /></div>}
          <section className="card p-4"><div className="mb-1.5 flex items-center justify-between"><h3 className="h-section">Solution concepts</h3><NewEntity pid={pid} iid={iid} type="concept" fields={CONCEPT_FIELDS} title="Add a solution concept" label="Add concept" links={[{ type: "opportunity", id: o.id, relation: "addressed_by", direction: "in" }]} gotoTemplate={`${base}?item=concept:{id}`} /></div>
            {o.concepts.length === 0 ? <p className="text-[13px] text-muted">None yet. Consider information, policy, process and workflow options — not only features or AI.</p> : <ul className="space-y-1">{o.concepts.map((c: any) => <li key={c.id} className="text-[13px]"><Link className="font-medium hover:underline" href={`${base}?item=concept:${c.id}`}>{c.title}</Link> <span className="badge">{INTERVENTIONS[c.intervention_type]}</span> {c.status !== "considering" && <span className="badge capitalize">{c.status}</span>}</li>)}</ul>}</section>
          <AssistPanel pid={pid} pending={pending.filter((p) => ["challenge", "concepts"].includes(p.kind))} actions={[
            { kind: "challenge", label: "Challenge this opportunity", hint: "Separate symptoms from causes, spot a too-broad statement, and list what would change our view.", scope: { sourceIds: [], initiativeId: iid, targetType: "opportunity", targetId: o.id } },
            { kind: "concepts", label: "Suggest alternative approaches", hint: "Distinct kinds of response — information, policy, process, workflow, automation, feature.", scope: { sourceIds: [], initiativeId: iid, targetType: "opportunity", targetId: o.id } },
          ]} />
          <div className="px-1"><DeleteButton pid={pid} type="opportunity" id={o.id} label="opportunity" redirect={base} /></div>
        </div>
      );
    }
  } else if (kind === "concept") {
    const c = concepts.find((x) => x.id === id);
    if (c) {
      const assumptions = listAssumptions(pid, iid).filter((a) => c.assumptions.some((x: any) => x.id === a.id));
      panel = (
        <div className="space-y-3">
          <section className="card p-4"><div className="mb-1 flex items-center justify-between"><span className="h-section">Solution concept</span><Link href={base} className="btn btn-quiet btn-sm" aria-label="Close">✕</Link></div>
            <EntityEditor pid={pid} type="concept" id={c.id} fields={CONCEPT_FIELDS} values={c} />
            <p className="mt-3 text-[13px]"><span className="h-section">Responds to </span>{c.opportunities.map((o: any) => <Link key={o.id} className="ml-1 underline" href={`${base}?item=opportunity:${o.id}`}>{o.title}</Link>)}</p></section>
          <section className="card p-4"><div className="mb-1.5 flex items-center justify-between"><h3 className="h-section">What must be true</h3><NewEntity pid={pid} iid={iid} type="assumption" fields={ASSUMPTION_FIELDS} title="Capture an assumption" label="Add assumption" links={[{ type: "concept", id: c.id, relation: "relies_on", direction: "in" }]} /></div>
            {assumptions.length === 0 ? <p className="text-[13px] text-muted">No assumptions captured. Every concept relies on some.</p> : <ul className="space-y-1.5">{assumptions.map((a) => <li key={a.id} className="text-[13px]"><Link className="hover:underline" href={`/p/${pid}/i/${iid}/validate?item=assumption:${a.id}`}>{a.statement}</Link><div><span className="badge">{a.category.replace("_", " ")}</span> <span className="badge">importance: {a.importance}</span> <span className="badge">support: {a.support}</span></div></li>)}</ul>}</section>
          <AssistPanel pid={pid} pending={pending.filter((p) => p.kind === "assumptions")} actions={[{ kind: "assumptions", label: "List assumptions to test", hint: "One prompt per risk category; keep only the consequential ones.", scope: { sourceIds: [], initiativeId: iid, targetType: "concept", targetId: c.id } }]} />
          <div className="px-1"><DeleteButton pid={pid} type="concept" id={c.id} label="solution concept" redirect={base} /></div>
        </div>
      );
    }
  }

  const findingsCount = all<any>("SELECT COUNT(*) n FROM findings WHERE initiative_id=? AND deleted_at IS NULL AND status='accepted'", iid)[0].n;
  return (
    <Workspace panel={panel ?? <AssistPanel pid={pid} title="Ask AI to help" pending={pending.filter((p) => p.kind === "opportunities")} actions={[{ kind: "opportunities", label: "Draft opportunities from my findings", hint: `Works from your ${findingsCount} accepted finding(s) in this discovery.`, scope: { sourceIds: [], initiativeId: iid }, disabled: findingsCount ? undefined : "Accept at least one finding first." }]} />} main={<>
      {header}{tabBar}
      {opps.length === 0 ? <Empty title="No opportunities yet" action={<NewEntity pid={pid} iid={iid} type="opportunity" fields={OPP_FIELDS} title="Add an opportunity" label="Add your first opportunity" primary gotoTemplate={`${base}?item=opportunity:{id}`} />}>An opportunity is a problem worth solving for someone. Start from a finding, and say who is affected and why it matters.</Empty> : (
        <ul className="space-y-2">{opps.map((o) => (
          <li key={o.id}><Link href={`${base}?item=opportunity:${o.id}`} className={`card block px-4 py-3 hover:border-accent ${id === o.id ? "border-accent bg-accent-soft/40" : ""}`}>
            <div className="flex items-start justify-between gap-3"><p className="text-[14.5px] font-medium">{o.title}</p><div className="flex shrink-0 gap-1">{o.status !== "active" && <span className="badge capitalize">{o.status}</span>}<OriginBadge origin={o.origin} /></div></div>
            {o.segment && <p className="text-[13px] text-muted">For: {o.segment}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {o.findings.length ? <><span className="text-muted">Evidence:</span>{o.findings.slice(0, 2).map((f: any) => <StrengthBadge key={f.id} s={f.strength} />)}</> : o.metricRefs.length ? <span className="badge">Operational data</span> : <span className="badge badge-warn">No linked finding</span>}
              <span className="text-muted">· {o.concepts.length} concept{o.concepts.length === 1 ? "" : "s"}</span>
              {o.calc.score != null && <span className="text-muted">· score {o.calc.score.toFixed(1)}</span>}
            </div></Link></li>))}</ul>)}
      <p className="text-[12px] text-muted">Potential causes stay hypotheses until validated. Related: <Link className="underline" href={`/p/${pid}/i/${iid}/validate`}>Validate</Link></p>
    </>} />
  );
}
void Related;
