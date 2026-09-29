import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get, parse } from "@/lib/db";
import { getAnalysis, listRuns, analysisFreshness, analysisSourceIds } from "@/lib/analyses";
import { listInitiatives, listSources, listFindings, listOpportunities, listExperiments, listDecisions, listConcepts, related } from "@/lib/queries";
import { ANALYSIS_TYPES } from "@/lib/types";
import { AnalysisMeta, ScopePicker, RunBar, RunHistory, RevisionList, ResultLinks, ProblemEditor, ComparisonEditor, SimplePick } from "@/components/analysis";
import { EventLogResults, SynthesisResults, TableResults } from "@/components/results";
import { DeleteAnalysis } from "@/components/delete-analysis";
import { entityHref } from "@/lib/routes";
import { Empty } from "@/components/ui";
import { TEMPLATES, intakeStatus, liteOf } from "@/lib/templates";
import { buildDocCtx, readDocData } from "@/lib/docs";
import { labelOf } from "@/lib/entities";
import { CATALOG_BY_KEY, NEXT } from "@/lib/catalog";
import { productKnowledge } from "@/lib/knowledge";
import { aiMode } from "@/lib/ai/live";
import { DocWorkbench } from "@/components/doc-workbench";
import { AnalysisHeaderLite } from "@/components/analysis";
import { AddEvidence } from "@/components/records";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ params, searchParams }: { params: Promise<{ pid: string; aid: string }>; searchParams: Promise<{ run?: string }> }) {
  const { pid, aid } = await params; const sp = await searchParams;
  let a; try { a = getAnalysis(pid, aid); } catch { notFound(); }
  if (a.deleted_at) notFound();
  const T = ANALYSIS_TYPES[a.type];
  const runs = listRuns(aid);
  const cur = runs.find((r) => String(r.seq) === sp.run) ?? runs[0];
  const fresh = analysisFreshness(a as any);
  const initiatives = listInitiatives(pid).map((i) => ({ id: i.id, title: i.title }));
  const src = listSources(pid);
  const selected = all<any>("SELECT source_id FROM analysis_sources WHERE analysis_id=?", aid).map((r) => r.source_id);
  const data = parse<any>(a.data, {});
  const aRow = { ...a, data };
  const revisions = all<any>("SELECT seq, note, created_at FROM analysis_revisions WHERE analysis_id=? ORDER BY seq DESC", aid);
  const cfg = parse<any>(a.config, {});
  const iniCount = a.initiative_id ? get<any>("SELECT COUNT(*) n FROM initiative_sources WHERE initiative_id=?", a.initiative_id)!.n : 0;
  const scopedIds = analysisSourceIds(a as any);

  const tpl = TEMPLATES[a.type];
  if (tpl) {
    const dd = readDocData(a);
    const ctx = buildDocCtx(pid, a);
    const refs: Record<string, { label: string; href: string }> = {};
    const scan = (v: unknown) => { const str = JSON.stringify(v ?? ""); for (const m of str.matchAll(/\[\[([a-z_]+):([A-Za-z0-9_]+)\]\]/g)) { const l = labelOf(m[1] as any, m[2]); if (l && !l.deleted) refs[`${m[1]}:${m[2]}`] = { label: l.label, href: entityHref(pid, m[1], m[2], a.initiative_id) }; } };
    scan(dd.sections);
    const lastRun = runs[0];
    const cat = CATALOG_BY_KEY[a.type];
    const initiative = a.initiative_id ? initiatives.find((i) => i.id === a.initiative_id) ?? null : null;
    return (
      <div className="mx-auto max-w-5xl px-6 py-6">
        <AnalysisHeaderLite pid={pid} a={a as any} icon={cat?.icon ?? "file"} initiative={initiative} />
        {fresh.outdated && <div role="status" className="mb-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px]"><p className="font-medium text-warn">The material behind this may have changed</p><ul className="list-disc pl-5">{fresh.reasons.map((r) => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-[12.5px]">Regenerate to get a fresh draft. Sections you edited are kept, and earlier drafts stay in history.</p></div>}
        <DocWorkbench pid={pid} a={{ id: a.id, title: a.title, type: a.type, initiative_id: a.initiative_id }} tpl={liteOf(tpl)} sections={dd.sections} prov={dd.prov} pending={dd.pending}
          intake={intakeStatus(tpl, ctx)} refs={refs} sources={src.filter((s) => s.content_kind === "text").map((s) => ({ id: s.id, title: s.title }))} selectedSources={selected} useRecords={dd.useRecords !== false}
          counts={{ findings: ctx.findings.length, opportunities: ctx.opportunities.length, concepts: ctx.concepts.length, assumptions: ctx.assumptions.length, decisions: ctx.decisions.length }}
          last={lastRun ? { seq: lastRun.seq, uncertainties: (lastRun.results.detail as any)?.uncertainties ?? [], notes: (lastRun.results.detail as any)?.notes ?? [], mode: lastRun.mode } : null}
          next={(NEXT[a.type] ?? []).map((k) => ({ key: k, label: CATALOG_BY_KEY[k].label, produces: CATALOG_BY_KEY[k].produces }))} hasInitiative={!!a.initiative_id} mode={aiMode()} icon={cat?.icon ?? "file"} />
        <div className="mt-6 grid gap-4 md:grid-cols-2 no-print">
          <RunHistory pid={pid} a={aRow} current={cur?.seq ?? 0} runs={runs.map((r) => ({ seq: r.seq, mode: r.mode, created_at: r.created_at, summary: "", sourceCount: r.inputs.sources?.length ?? 0 }))} />
          <RevisionList pid={pid} a={aRow} revisions={revisions} />
        </div>
        <div className="mt-4"><DeleteAnalysis pid={pid} id={aid} title={a.title} /></div>
      </div>
    );
  }
  let inputs: React.ReactNode = null, action: React.ReactNode = null, results: React.ReactNode = null;
  const sourceBased = ["research_synthesis", "custom", "process_mapping"].includes(a.type);
  if (sourceBased) {
    inputs = <ScopePicker pid={pid} a={aRow} sources={src.map((s) => ({ id: s.id, title: s.title, content_kind: s.content_kind }))} selected={selected} initiativeCount={iniCount} />;
    action = <RunBar pid={pid} a={aRow} label={runs.length ? "Re-run with current evidence" : a.type === "process_mapping" ? "Draft a process from this evidence" : "Run analysis"} disabledReason={scopedIds.length ? undefined : "Choose the evidence to analyse first."} />;
  } else if (a.type === "event_log") {
    action = <RunBar pid={pid} a={aRow} label={runs.length ? "Re-run with latest evidence" : "Run"} disabledReason={cfg.sourceId ? undefined : "Import and map an event log first."} extra={cfg.sourceId ? <Link className="btn" href={`/p/${pid}/eventlog/${cfg.sourceId}?a=${aid}${a.initiative_id ? `&i=${a.initiative_id}` : ""}`}>Change mapping or options</Link> : undefined} />;
    const s = cfg.sourceId ? get<any>("SELECT id, title, version FROM sources WHERE id=?", cfg.sourceId) : null;
    if (!cfg.sourceId) {
      const csvs = src.filter((x) => x.content_kind === "csv");
      inputs = <section className="card p-5"><h2 className="text-[16px] font-semibold">Choose the event log to mine</h2><p className="mb-3 mt-1 text-[13.5px] text-muted">Process mining needs a CSV with a case ID, an activity name and a timestamp for each event. You’ll map the columns and review data quality before anything is analysed.</p>
        {csvs.length ? <ul className="mb-3 divide-y divide-line rounded-lg border border-line">{csvs.map((x) => <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]"><span className="truncate">{x.title}</span><Link className="btn btn-sm btn-primary" href={`/p/${pid}/eventlog/${x.id}?a=${aid}${a.initiative_id ? `&i=${a.initiative_id}` : ""}`}>Map columns</Link></li>)}</ul> : <p className="mb-3 text-[13px] text-muted">No CSV in this product yet.</p>}
        <AddEvidence pid={pid} iid={a.initiative_id ?? undefined} label="Add a CSV or other evidence" /></section>;
    }
    inputs = inputs ?? (s && <section className="card p-4 text-[13.5px]"><h2 className="text-[15px] font-semibold">Inputs</h2><p>Dataset source: <Link className="underline" href={`/p/${pid}/sources/${s.id}`}>{s.title}</Link> (currently version {s.version}). Mapping: case = {cfg.mapping?.caseId}, activity = {cfg.mapping?.activity}, time = {cfg.mapping?.timestamp}{cfg.mapping?.actor ? `, actor = ${cfg.mapping.actor}` : ""}. To add newer evidence, update the source’s content in the reader, then re-run.</p></section>);
  } else if (a.type === "problem_analysis") inputs = <ProblemEditor pid={pid} a={aRow} />;
  else if (a.type === "solution_comparison") { inputs = <ComparisonEditor pid={pid} a={aRow} concepts={listConcepts(pid, a.initiative_id ?? undefined).map((c) => ({ id: c.id, title: c.title }))} />; action = <RunBar pid={pid} a={aRow} label="Save this comparison as a run" />; }
  else if (a.type === "opportunity_analysis" || a.type === "assumption_analysis") {
    action = <RunBar pid={pid} a={aRow} label={runs.length ? "Re-run with current records" : "Run"} />;
    if (a.type === "assumption_analysis") inputs = <SimplePick pid={pid} a={aRow} field="category" label="Which kind of assumption?" allowAll options={[{ value: "all", label: "All" }, ...["desirability", "usability", "feasibility", "viability", "operational_fit"].map((v) => ({ value: v, label: v.replace("_", " ") }))]} />;
  } else if (a.type === "future_state") { inputs = <SimplePick pid={pid} a={aRow} field="mapId" label="Future-state proposal to compare with its baseline" options={all<any>("SELECT id, name FROM process_maps WHERE product_id=? AND kind='future' AND deleted_at IS NULL", pid).map((m) => ({ value: m.id, label: m.name }))} />; action = <RunBar pid={pid} a={aRow} label={runs.length ? "Re-run comparison" : "Compare"} disabledReason={data.mapId ? undefined : "Choose a proposal first."} />; }
  else if (a.type === "experiment_analysis") { inputs = <SimplePick pid={pid} a={aRow} field="experimentId" label="Experiment to interpret" options={listExperiments(pid).map((e) => ({ value: e.id, label: e.title }))} />; action = <RunBar pid={pid} a={aRow} label={runs.length ? "Re-run with latest results" : "Snapshot results and criterion"} disabledReason={data.experimentId ? undefined : "Choose an experiment first."} />; }

  if (cur) {
    if (a.type === "event_log") results = <EventLogResults pid={pid} iid={a.initiative_id} run={cur} analysisTitle={a.title} />;
    else if (sourceBased) results = <SynthesisResults pid={pid} run={cur} />;
    else results = <TableResults type={a.type} run={cur} />;
  }
  const linkable = [...listFindings(pid).map((f) => ({ type: "finding", id: f.id, label: f.statement })), ...listOpportunities(pid).map((o) => ({ type: "opportunity", id: o.id, label: o.title })), ...listExperiments(pid).map((e) => ({ type: "experiment", id: e.id, label: e.title })), ...listDecisions(pid).map((d) => ({ type: "decision", id: d.id, label: d.statement }))];
  const runLinks = cur ? related("analysis_run", cur.id).filter((l) => l.direction === "out").map((l) => ({ linkId: l.linkId, type: l.type, label: l.label, href: entityHref(pid, l.type, l.id, a.initiative_id) })) : [];
  const ini = a.initiative_id ? initiatives.find((i) => i.id === a.initiative_id) : null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <div className="mb-3"><div className="flex flex-wrap items-center gap-2"><span className="badge badge-accent">{T.label}</span>{ini ? <Link className="badge hover:underline" href={`/p/${pid}/i/${ini.id}`}>Discovery: {ini.title.slice(0, 50)}</Link> : <span className="badge">Product-level analysis</span>}</div>
        <p className="mt-1 text-[13px] text-muted">{T.purpose}. Pattern: question → inputs → method → results → limitations → next action.</p></div>
      {fresh.outdated && <div role="status" className="mb-4 rounded-md border border-warn/30 bg-warn-soft px-4 py-3 text-[13.5px]"><p className="font-medium text-warn">This analysis may be outdated</p><ul className="list-disc pl-5">{fresh.reasons.map((r) => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-[12.5px]">Earlier results and any decisions built on them are preserved. Review, or re-run to create a new run and compare it with the last.</p></div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <AnalysisMeta pid={pid} a={aRow} initiatives={initiatives} />
          {inputs}
          {a.type === "process_mapping" && cfg.mapId && <p className="card px-4 py-3 text-[13.5px]">Map created from this analysis: <Link className="underline" href={`/p/${pid}/maps/${cfg.mapId}`}>open the process map</Link>.</p>}
          {a.type === "process_mapping" && !cfg.mapId && <p className="card px-4 py-3 text-[13.5px]">Prefer to draw it yourself? <Link className="underline" href={a.initiative_id ? `/p/${pid}/i/${a.initiative_id}/explore?tab=process` : `/p/${pid}/discovery`}>Start a blank map in a discovery</Link>.</p>}
          {action && <div className="card p-4"><h2 className="mb-2 text-[15px] font-semibold">Method</h2><p className="mb-2 text-[13px] text-muted">{a.type === "event_log" ? "Deterministic code calculates every metric; AI is not involved." : sourceBased ? "AI or demo proposals, verified against your sources before you can accept anything." : "Deterministic summary of your current records."}</p>{action}</div>}
          <section aria-labelledby="res-h"><h2 id="res-h" className="mb-2 text-[16px] font-semibold">Results{cur ? ` — run ${cur.seq}` : ""}{cur && cur.seq !== runs[0].seq && <span className="badge badge-warn ml-2">An earlier run</span>}</h2>
            {cur ? <><p className="mb-3 text-[12.5px] text-muted">Run {cur.seq} · {cur.created_at.slice(0, 16).replace("T", " ")} · {cur.mode === "demo" ? "Demo sample (no model)" : cur.mode === "live" ? "Live model" : cur.mode === "deterministic" ? "Deterministic code" : "Your input"} · inputs: {cur.inputs.sources?.length ? cur.inputs.sources.map((s: any) => `${s.title} v${s.version}`).join("; ") : "records in this product at that time"}</p>{results}</>
              : a.type === "problem_analysis" || a.type === "custom" && false ? null : <Empty title="No run yet">{action ? "Set the inputs above and run it. Results appear here, and every rerun is kept." : "This analysis is completed by hand: use the editor above and save revisions."}</Empty>}</section>
          {cur?.results.note && <p className="text-[12.5px] text-muted">Limitations: {cur.results.note}</p>}
          <DeleteAnalysis pid={pid} id={aid} title={a.title} />
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-[57px] xl:self-start" aria-label="Runs, revisions and links">
          <RunHistory pid={pid} a={aRow} current={cur?.seq ?? 0} runs={runs.map((r) => ({ seq: r.seq, mode: r.mode, created_at: r.created_at, summary: "", sourceCount: r.inputs.sources?.length ?? 0 }))} />
          {cur && <ResultLinks pid={pid} runId={cur.id} links={runLinks} candidates={linkable} />}
          <RevisionList pid={pid} a={aRow} revisions={revisions} />
        </aside>
      </div>
    </div>
  );
}
