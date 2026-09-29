import Link from "next/link";
import { METRIC_DEFS, fmtDuration, pct, type Analysis } from "@/lib/eventlog";
import { DeriveButton } from "./derive";
import { ProposalReview } from "./assist";
import { get } from "@/lib/db";
import { parse } from "@/lib/db";

const Tile = ({ l, v, sub }: { l: string; v: string; sub?: string }) => <div className="card p-3"><p className="h-section">{l}</p><p className="mt-0.5 text-[19px] font-semibold">{v}</p>{sub && <p className="text-[12px] text-muted">{sub}</p>}</div>;

export function EventLogResults({ pid, iid, run, analysisTitle }: { pid: string; iid: string | null; run: { id: string; seq: number; results: any }; analysisTitle: string }) {
  const a: Analysis = run.results.detail;
  const ds = run.results.datasetId ? get<any>("SELECT * FROM event_datasets WHERE id=?", run.results.datasetId) : null;
  const val = parse<any>(ds?.validation, null);
  const total = a.counts.cases;
  const D = (metric: string, key: string, label: string, value: string, statement: string, title: string) => <DeriveButton pid={pid} iid={iid} runId={run.id} metric={metric} keyName={key} label={label} value={value} statement={statement} title={title} />;
  return (
    <div className="space-y-5">
      <p className="rounded border border-line bg-surface px-3 py-2 text-[13px]"><span className="font-medium">How durations are measured: </span>{a.durationBasisLabel}{ds && <span className="text-muted"> · dataset “{ds.name}”, source version {ds.source_version}</span>}</p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile l="Cases" v={String(a.counts.cases)} /><Tile l="Events" v={String(a.counts.events)} /><Tile l="Variants" v={String(a.variants.length)} />
        <Tile l={a.durationBasis === "observed_span" ? "Median observed span" : "Median to end"} v={fmtDuration(a.span?.median)} sub={a.span ? `n=${a.span.n}` : undefined} /><Tile l="90th percentile" v={fmtDuration(a.span?.p90)} sub={a.span ? `min ${fmtDuration(a.span.min)} · max ${fmtDuration(a.span.max)}` : undefined} />
        <Tile l="Cases without a duration" v={String(a.counts.casesWithoutDuration)} sub={a.counts.casesWithoutDuration ? "never reached the end" : undefined} />
      </div>
      <details className="rounded border border-line bg-surface px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium">What each metric means (and doesn’t)</summary><dl className="mt-1.5 space-y-1">{Object.entries(METRIC_DEFS).map(([k, d]) => <div key={k}><dt className="inline font-medium capitalize">{k.replace("_", " ")}: </dt><dd className="inline text-muted">{d}</dd></div>)}</dl></details>

      <section aria-labelledby="var-h"><h3 id="var-h" className="mb-1.5 text-[15px] font-semibold">Process variants</h3><p className="mb-2 text-[12.5px] text-muted">{METRIC_DEFS.variants}</p>
        <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Sequence</th><th>Cases</th><th>Share</th><th>Median span</th><th /></tr></thead><tbody>{a.variants.slice(0, 10).map((v, i) => (
          <tr key={v.key}><td className="min-w-[320px]"><span className="badge mr-1.5">V{i + 1}</span><span className="text-[12.5px]">{v.sequence.join(" → ")}</span><p className="text-[11.5px] text-muted">e.g. {v.caseIds.slice(0, 3).join(", ")}</p></td><td>{v.cases}</td><td>{pct(v.share)}</td><td>{fmtDuration(v.span?.median)}{v.span && <span className="block text-[11.5px] text-muted">n={v.span.n}</span>}</td>
            <td>{D("variants", v.key, `Variant V${i + 1}`, `${v.cases} of ${total} cases (${pct(v.share)})`, `${v.cases} of ${total} cases (${pct(v.share)}) followed this exact sequence: ${v.sequence.join(" → ")}.`, `Cases follow the variant: ${v.sequence.slice(0, 4).join(" → ")}…`)}</td></tr>))}</tbody></table></div></section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="gap-h"><h3 id="gap-h" className="mb-1.5 text-[15px] font-semibold">Longest gaps between recorded events</h3><p className="mb-2 text-[12.5px] text-muted">{METRIC_DEFS.transition_gap}</p>
          <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Between</th><th>Median</th><th>P90</th><th>n</th><th /></tr></thead><tbody>{a.gaps.slice(0, 8).map((g) => (
            <tr key={g.from + g.to}><td>{g.from} → {g.to}</td><td>{fmtDuration(g.median)}</td><td>{fmtDuration(g.p90)}</td><td>{g.count}</td>
              <td>{D("transition_gap", `${g.from}→${g.to}`, `Median gap ${g.from} → ${g.to}`, fmtDuration(g.median), `The recorded gap between “${g.from}” and “${g.to}” has a median of ${fmtDuration(g.median)} (n=${g.count}, 90th percentile ${fmtDuration(g.p90)}). This is elapsed time between recorded events, not verified waiting time.`, `Long gap between ${g.from} and ${g.to}`)}</td></tr>))}</tbody></table></div></section>
        <section aria-labelledby="rep-h"><h3 id="rep-h" className="mb-1.5 text-[15px] font-semibold">Repeated activities</h3><p className="mb-2 text-[12.5px] text-muted">{METRIC_DEFS.repeats}</p>
          {a.repeats.length === 0 ? <p className="text-[13px] text-muted">No activity repeats within a case.</p> : <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Activity</th><th>Cases</th><th>Share</th><th>Extra times</th><th /></tr></thead><tbody>{a.repeats.map((r) => (
            <tr key={r.activity}><td>{r.activity}</td><td>{r.cases}</td><td>{pct(r.share)}</td><td>{r.extraOccurrences}</td>
              <td>{D("repeats", r.activity, `Cases with a repeated ${r.activity}`, `${r.cases} of ${total} (${pct(r.share)})`, `${r.cases} of ${total} cases (${pct(r.share)}) contain more than one “${r.activity}”. The log does not say why; this is a pattern to explain, not confirmed rework.`, `Repeated ${r.activity}`)}</td></tr>))}</tbody></table></div>}</section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="act-h"><h3 id="act-h" className="mb-1.5 text-[15px] font-semibold">Activities</h3>
          <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Activity</th><th>Events</th><th>Cases containing it</th></tr></thead><tbody>{a.activities.map((x) => <tr key={x.activity}><td>{x.activity}</td><td>{x.events}</td><td>{x.cases} ({pct(x.share)})</td></tr>)}</tbody></table></div></section>
        <section aria-labelledby="ho-h"><h3 id="ho-h" className="mb-1.5 text-[15px] font-semibold">Handoffs between actors</h3>
          {!a.handoffs ? <p className="text-[13px] text-muted">No actor column was mapped, so handoffs can’t be counted.</p> : <><p className="mb-2 text-[12.5px] text-muted">{METRIC_DEFS.handoffs} {a.handoffs.totalChanges} changes across {a.handoffs.casesWithChange} cases (mean {a.handoffs.perCaseMean.toFixed(1)} per case).</p>
            <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>From</th><th>To</th><th>Times</th></tr></thead><tbody>{a.handoffs.pairs.slice(0, 8).map((p) => <tr key={p.from + p.to}><td>{p.from}</td><td>{p.to}</td><td>{p.count}</td></tr>)}</tbody></table></div></>}</section>
      </div>
      {a.activityDurations && <section><h3 className="mb-1.5 text-[15px] font-semibold">Recorded activity durations</h3><p className="mb-2 text-[12.5px] text-muted">{METRIC_DEFS.activity_duration}</p><div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Activity</th><th>Median</th><th>P90</th><th>n</th></tr></thead><tbody>{a.activityDurations.map((d) => <tr key={d.activity}><td>{d.activity}</td><td>{fmtDuration(d.median)}</td><td>{fmtDuration(d.p90)}</td><td>{d.n}</td></tr>)}</tbody></table></div></section>}
      {val && <section aria-labelledby="dq-h"><h3 id="dq-h" className="mb-1.5 text-[15px] font-semibold">Data quality at import</h3>
        <p className="mb-2 text-[13px]">{val.includedRows.toLocaleString()} of {val.totalRows.toLocaleString()} rows were analysed; {val.excludedRows.toLocaleString()} excluded.</p>
        {val.issues.length ? <ul className="card divide-y divide-line">{val.issues.map((i: any) => <li key={i.code} className="px-3 py-2 text-[13px]"><span className="font-medium">{i.label}</span> — {i.count} row(s). <span className="text-muted">{i.handling}</span></li>)}</ul> : <p className="text-[13px] text-muted">No problems found.</p>}</section>}
      <p className="text-[12px] text-muted">All numbers on this page come from deterministic code applied to the dataset above ({analysisTitle}, run {run.seq}). AI never calculates or alters them.</p>
    </div>
  );
}

export function SynthesisResults({ pid, run }: { pid: string; run: { results: any } }) {
  const d = run.results.detail ?? {};
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{run.results.summary.map((s: any) => <Tile key={s.label} l={s.label} v={s.value} />)}</div>
      {run.results.proposalId ? <div><h3 className="mb-1.5 text-[15px] font-semibold">Proposals from this run</h3><ProposalReview pid={pid} proposalId={run.results.proposalId} /></div> : null}
      {d.notes && Object.entries(d.notes).some(([, v]) => (v as string[])?.length) && <p className="text-[12.5px] text-muted">Themes, contradictions and gaps are listed inside the proposal above.</p>}
    </div>
  );
}

export function TableResults({ type, run }: { type: string; run: { results: any } }) {
  const r = run.results; const d = r.detail ?? {};
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">{r.summary.map((s: any) => <Tile key={s.label} l={s.label} v={s.value} />)}</div>
      {r.note && <p className="text-[12.5px] text-muted">{r.note}</p>}
      {type === "opportunity_analysis" && <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Opportunity</th>{d.dims.map((x: any) => <th key={x.key}>{x.label}</th>)}<th>Score</th></tr></thead><tbody>{d.rows.map((o: any) => <tr key={o.id}><td className="font-medium">{o.title}</td>{d.dims.map((x: any) => <td key={x.key}>{o.scores[x.key] ?? <span className="text-muted">unknown</span>}</td>)}<td>{o.score == null ? <span className="badge badge-warn">not scored ({o.known}/{o.of} known)</span> : <>{Number(o.score).toFixed(2)}{o.overridden && <span className="badge badge-warn ml-1" title={o.rationale}>override</span>}</>}</td></tr>)}</tbody></table></div>}
      {type === "assumption_analysis" && <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Assumption</th><th>Importance</th><th>Support</th><th>Status</th><th /></tr></thead><tbody>{d.rows.map((o: any) => <tr key={o.id}><td>{o.statement}</td><td className="capitalize">{o.importance}</td><td className="capitalize">{o.support}</td><td className="capitalize">{o.status}</td><td>{o.critical && <span className="badge badge-warn">test first</span>}</td></tr>)}</tbody></table></div>}
      {type === "solution_comparison" && <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Concept</th>{d.criteria.map((c: any) => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{d.rows.map((o: any) => <tr key={o.id}><td className="font-medium">{o.title}</td>{d.criteria.map((c: any) => <td key={c.key}>{o.ratings?.[c.key]?.value ?? <span className="text-muted">unknown</span>}{o.ratings?.[c.key]?.note && <span className="block text-[12px] text-muted">{o.ratings[c.key].note}</span>}</td>)}</tr>)}</tbody></table></div>}
      {type === "future_state" && <ul className="card divide-y divide-line">{d.diff.filter((x: any) => x.status !== "unchanged").map((x: any) => <li key={x.stableId} className="px-3 py-1.5 text-[13px]"><span className={`badge mr-1.5 ${x.status === "added" ? "badge-accent" : x.status === "removed" ? "badge-danger" : "badge-warn"}`}>{x.status}</span>{x.afterName ?? x.beforeName}{x.changed.length > 0 && <span className="text-muted"> — {x.changed.join(", ")}</span>}</li>)}</ul>}
      {type === "experiment_analysis" && <dl className="card space-y-2 p-4 text-[13.5px]">{[["Success criterion", d.success_criterion], ["Results", d.results], ["Interpretation", d.interpretation], ["Limitations", d.limitations]].map(([l, v]) => <div key={l}><dt className="h-section">{l}</dt><dd className="whitespace-pre-line">{v || <span className="text-muted">—</span>}</dd></div>)}</dl>}
    </div>
  );
}
void Link;
