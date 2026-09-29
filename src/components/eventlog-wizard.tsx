"use client";
import { useEffect, useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText } from "./ui";

type Mapping = { caseId?: string; activity?: string; timestamp?: string; actor?: string; start?: string; end?: string; complete?: string };
type Options = { endActivity?: string; duplicates: "exclude" | "keep"; singleEventCases: "exclude" | "keep"; dateOrder: "mdy" | "dmy" };
type Preview = { headers: string[]; sample: Record<string, string>[]; totalRows: number; parseErrors: string[]; guessed: Mapping; validation: null | { totalRows: number; includedRows: number; excludedRows: number; caseCount: number; activities: string[]; issues: { code: string; label: string; severity: string; count: number; rows: number[]; handling: string }[] } };

export function EventLogWizard({ pid, sid, iid, analysisId, title, initial }: { pid: string; sid: string; iid?: string; analysisId?: string; title: string; initial?: { mapping: Mapping; options: Options } }) {
  const { run, pending, error, router } = useAction();
  const [mapping, setMapping] = useState<Mapping>(initial?.mapping ?? {});
  const [options, setOptions] = useState<Options>(initial?.options ?? { duplicates: "exclude", singleEventCases: "exclude", dateOrder: "mdy" });
  const [pv, setPv] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState(title);
  const [question, setQuestion] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "eventlog.preview", args: { productId: pid, sourceId: sid, mapping: Object.keys(mapping).length ? mapping : undefined, options } }) }).then((x) => x.json());
      if (r.ok) { setPv(r.data); setLoadErr(null); if (!Object.keys(mapping).length) setMapping(r.data.guessed); } else setLoadErr(r.error.message);
    }, 150);
    return () => clearTimeout(t);
  }, [pid, sid, mapping, options]);
  useEffect(() => setConfirmed(false), [mapping, options]);

  const H = pv?.headers ?? [];
  const sel = (k: keyof Mapping, label: string, required: boolean, hint?: string) => (
    <div>
      <label className="label" htmlFor={`m-${k}`}>{label}{required ? " *" : " (optional)"}</label>
      <select id={`m-${k}`} className="input" value={mapping[k] ?? ""} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value || undefined })}>
        <option value="">{required ? "Choose a column…" : "Not used"}</option>{H.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>{hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
  const v = pv?.validation;
  const ready = !!(mapping.caseId && mapping.activity && mapping.timestamp && v && v.includedRows > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-6 py-6">
      <div><h1 className="text-[20px] font-semibold">Analyse an event log</h1><p className="text-[13.5px] text-muted">Deterministic analysis of “{title}”. Nothing is deleted or repaired silently: every exclusion is counted and explained below.</p></div>
      <ErrorText message={loadErr} />
      {pv?.parseErrors.length ? <div className="rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]"><p className="font-medium text-warn">The file has structural problems</p><ul className="list-disc pl-5">{pv.parseErrors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}

      <section className="card p-4" aria-labelledby="s1"><h2 id="s1" className="mb-1 text-[15px] font-semibold">1. Map the columns</h2>
        <p className="mb-3 text-[13px] text-muted">We guessed from the headers — please check. {pv ? `${pv.totalRows.toLocaleString()} rows found.` : "Reading file…"}</p>
        <div className="grid gap-3 md:grid-cols-3">
          {sel("caseId", "Case ID", true, "Identifies one run of the process, e.g. an application")}
          {sel("activity", "Activity name", true)}
          {sel("timestamp", "Event timestamp", true)}
          {sel("actor", "Actor or team", false, "Enables handoff counts")}
          {sel("start", "Activity start", false)}
          {sel("end", "Activity end", false)}
          {sel("complete", "Case completion indicator", false, "A true/yes column marking the closing event")}
        </div>
        {pv && <div className="mt-3 overflow-x-auto"><table className="tbl"><thead><tr>{pv.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{pv.sample.map((r, i) => <tr key={i}>{pv.headers.map((h) => <td key={h} className="whitespace-nowrap">{r[h]}</td>)}</tr>)}</tbody></table><p className="mt-1 text-[12px] text-muted">First 5 rows.</p></div>}
      </section>

      <section className="card p-4" aria-labelledby="s2"><h2 id="s2" className="mb-1 text-[15px] font-semibold">2. Decide how to handle edge cases</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label" htmlFor="o-end">What marks a case as finished?</label>
            <select id="o-end" className="input" value={options.endActivity ?? ""} disabled={!!mapping.complete} onChange={(e) => setOptions({ ...options, endActivity: e.target.value || undefined })}>
              <option value="">Nothing — report observed spans only</option>{v?.activities.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <p className="mt-0.5 text-[12px] text-muted">{mapping.complete ? "The completion column you mapped is used." : options.endActivity ? `Durations run from a case’s first event to its first “${options.endActivity}”. Cases that never reach it are left out of duration statistics.` : "Without an end activity, durations are labelled “observed span”: first to last recorded event, not a confirmed cycle time."}</p></div>
          <div><label className="label" htmlFor="o-dup">Exact duplicate rows</label><select id="o-dup" className="input" value={options.duplicates} onChange={(e) => setOptions({ ...options, duplicates: e.target.value as any })}><option value="exclude">Exclude repeats (keep the first)</option><option value="keep">Keep all as real events</option></select></div>
          <div><label className="label" htmlFor="o-one">Cases with only one event</label><select id="o-one" className="input" value={options.singleEventCases} onChange={(e) => setOptions({ ...options, singleEventCases: e.target.value as any })}><option value="exclude">Exclude (no sequence or duration)</option><option value="keep">Keep (zero-length spans)</option></select></div>
          <div><label className="label" htmlFor="o-date">Ambiguous dates like 03/04/2025</label><select id="o-date" className="input" value={options.dateOrder} onChange={(e) => setOptions({ ...options, dateOrder: e.target.value as any })}><option value="mdy">Month/day/year</option><option value="dmy">Day/month/year</option></select></div>
        </div>
      </section>

      <section className="card p-4" aria-labelledby="s3"><h2 id="s3" className="mb-1 text-[15px] font-semibold">3. Review validation</h2>
        {!v ? <p className="text-[13.5px] text-muted">Map the three required columns to see validation results.</p> : (<>
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            {[["Rows in file", v.totalRows], ["Included", v.includedRows], ["Excluded", v.excludedRows], ["Cases analysed", v.caseCount]].map(([l, n]) => <div key={String(l)} className="rounded border border-line bg-paper p-2.5"><p className="h-section">{l}</p><p className="text-[18px] font-semibold">{Number(n).toLocaleString()}</p></div>)}
          </div>
          {v.issues.length === 0 ? <p className="text-[13.5px] text-accent-strong">No problems found in the rows checked.</p> : (
            <table className="tbl"><thead><tr><th>Issue</th><th>Rows</th><th>Effect</th><th>How it is handled</th></tr></thead><tbody>{v.issues.map((i) => (
              <tr key={i.code}><td className="font-medium">{i.label}</td><td>{i.count.toLocaleString()}{i.rows.length > 0 && <span className="block text-[11.5px] text-muted">e.g. rows {i.rows.slice(0, 5).join(", ")}</span>}</td>
                <td><span className={`badge ${i.severity === "excluded" ? "badge-danger" : i.severity === "flagged" ? "badge-warn" : ""}`}>{i.severity === "excluded" ? "Excluded" : i.severity === "flagged" ? "Kept, flagged" : "Note"}</span></td><td>{i.handling}</td></tr>))}</tbody></table>)}
        </>)}
      </section>

      <section className="card p-4" aria-labelledby="s4"><h2 id="s4" className="mb-2 text-[15px] font-semibold">4. Confirm and open the analysis</h2>
        {!analysisId && <div className="mb-3 grid gap-3 md:grid-cols-2"><div><label className="label" htmlFor="a-n">Analysis title</label><input id="a-n" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div><div><label className="label" htmlFor="a-q">Question (optional)</label><input id="a-q" className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to learn from this log?" /></div></div>}
        <label className="flex items-start gap-2 text-[13.5px]"><input type="checkbox" className="mt-1" checked={confirmed} disabled={!ready} onChange={(e) => setConfirmed(e.target.checked)} />I have reviewed the mapping and which rows will be analysed{v ? ` (${v.includedRows.toLocaleString()} included, ${v.excludedRows.toLocaleString()} excluded)` : ""}.</label>
        <ErrorText message={error} />
        <button className="btn btn-primary mt-3" disabled={!ready || !confirmed || pending} onClick={async () => { const r = await run<{ analysisId: string }>("eventlog.run", { productId: pid, sourceId: sid, initiativeId: iid, analysisId, title: name, question, mapping, options }, { refresh: false }); if (r.ok) router.push(`/p/${pid}/analyses/${r.data.analysisId}`); }}>{pending ? "Analysing…" : "Open the analysis"}</button>
      </section>
    </div>
  );
}
