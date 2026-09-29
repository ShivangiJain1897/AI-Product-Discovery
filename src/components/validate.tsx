"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";
import { EntityEditor, EntityView } from "./entity";
import { EXPERIMENT_NEW_FIELDS, DECISION_FIELDS } from "./specs";

export function ExperimentPanel({ pid, iid, e, closeHref }: { pid: string; iid?: string; e: any; closeHref: string }) {
  const { run, pending, error, setError } = useAction();
  const [res, setRes] = useState({ results: e.results ?? "", outcome: e.outcome ?? "inconclusive" });
  const [interp, setInterp] = useState({ interpretation: e.interpretation ?? "", limitations: e.limitations ?? "", next_action: e.next_action ?? "" });
  const locked = !!e.criterion_locked_at;
  const hasCrit = !!e.success_criterion?.trim();
  return (
    <section className="card p-4" aria-label="Experiment details">
      <div className="mb-1 flex items-center justify-between"><span className="h-section">Experiment</span><Link href={closeHref} className="btn btn-quiet btn-sm" aria-label="Close">✕</Link></div>
      <div className="mb-2 flex flex-wrap gap-1.5"><span className="badge capitalize">{e.status}</span>{e.outcome && <span className={`badge ${e.outcome === "supported" ? "badge-accent" : e.outcome === "refuted" ? "badge-danger" : "badge-warn"}`}>{e.outcome}</span>}{locked && <span className="badge" title={`Locked ${e.criterion_locked_at.slice(0, 10)}`}>🔒 Criterion locked</span>}</div>
      {e.status === "planned" ? <EntityEditor pid={pid} type="experiment" id={e.id} fields={EXPERIMENT_NEW_FIELDS} values={e} /> : <EntityView fields={EXPERIMENT_NEW_FIELDS} values={e} />}
      <div className="mt-3 text-[13px]">
        {e.assumptions.length > 0 && <p><span className="h-section">Tests </span>{e.assumptions.map((a: any) => <span key={a.id} className="mr-1 block">• {a.statement}</span>)}</p>}
        {e.concepts.length > 0 && <p><span className="h-section">Concept </span>{e.concepts.map((c: any) => c.title).join(", ")}</p>}
      </div>
      <ErrorText message={error} />
      {e.status === "planned" && (
        <div className="mt-3 rounded border border-line bg-paper p-3">
          <p className="text-[13px]">{hasCrit ? "Ready to run? Starting locks the success criterion so it can’t be adjusted after you see results." : "Define a success criterion before you start. Without one, results can’t be interpreted honestly."}</p>
          <button className="btn btn-primary btn-sm mt-2" disabled={pending || !hasCrit} onClick={() => run("entity.update", { productId: pid, type: "experiment", id: e.id, data: { status: "running" } })}>Start experiment and lock criterion</button>
        </div>
      )}
      {e.status !== "planned" && (<>
        <form className="mt-3 border-t border-line pt-3" onSubmit={async (ev) => { ev.preventDefault(); setError(null); await run("entity.update", { productId: pid, type: "experiment", id: e.id, data: { results: res.results, outcome: res.outcome, status: "completed" } }); }}>
          <h3 className="h-section mb-1">Results — what happened</h3>
          <p className="mb-1.5 text-[12.5px] text-muted">Facts only. Interpretation comes next, separately.</p>
          <textarea aria-label="Results" className="input" rows={3} value={res.results} onChange={(x) => setRes({ ...res, results: x.target.value })} />
          <div className="mt-1.5 flex flex-wrap items-center gap-2"><label className="text-[12.5px]" htmlFor="oc">Against the criterion:</label>
            <select id="oc" className="input !w-auto !py-1" value={res.outcome} onChange={(x) => setRes({ ...res, outcome: x.target.value })}><option value="supported">Criterion met (supported)</option><option value="refuted">Criterion not met (refuted)</option><option value="inconclusive">Inconclusive</option></select>
            <button className="btn btn-sm btn-primary" disabled={pending || !res.results.trim()}>Save results</button></div>
          <p className="mt-1 text-[12px] text-muted">Negative and inconclusive results are valid outcomes; they don’t have to lead to delivery.</p>
        </form>
        <form className="mt-3 border-t border-line pt-3" onSubmit={async (ev) => { ev.preventDefault(); await run("entity.update", { productId: pid, type: "experiment", id: e.id, data: interp }); }}>
          <h3 className="h-section mb-1">Interpretation — what we make of it</h3>
          <Field label="Interpretation"><textarea className="input" rows={3} value={interp.interpretation} onChange={(x) => setInterp({ ...interp, interpretation: x.target.value })} /></Field>
          <Field label="Limitations"><textarea className="input" rows={2} value={interp.limitations} onChange={(x) => setInterp({ ...interp, limitations: x.target.value })} /></Field>
          <Field label="Next action"><input className="input" value={interp.next_action} onChange={(x) => setInterp({ ...interp, next_action: x.target.value })} /></Field>
          <button className="btn btn-sm" disabled={pending}>Save interpretation</button>
        </form>
        {e.assumptions.length > 0 && e.outcome && (
          <div className="mt-3 border-t border-line pt-3"><h3 className="h-section mb-1">Update what we believe</h3>
            {e.assumptions.map((a: any) => <div key={a.id} className="mb-1.5 text-[13px]"><p>{a.statement}</p><div className="mt-0.5 flex flex-wrap gap-1">{["supported", "refuted", "inconclusive", "testing"].map((s) => <button key={s} className="btn btn-sm" disabled={pending} onClick={() => run("entity.update", { productId: pid, type: "assumption", id: a.id, data: { status: s } })}>Mark {s}</button>)}</div></div>)}</div>
        )}
      </>)}
    </section>
  );
}

type Cand = { id: string; label: string };
export function DecisionForm({ pid, iid, cands, initial, decisionId, gotoTemplate }: { pid: string; iid: string; cands: { findings: Cand[]; opportunities: Cand[]; experiments: Cand[]; runs: Cand[] }; initial?: Record<string, string>; decisionId?: string; gotoTemplate: string }) {
  const sp = useSearchParams(); const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(sp.get("new") === "decision");
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(DECISION_FIELDS.map((f) => [f.key, initial?.[f.key] ?? (f.kind === "select" ? f.options![0][0] : f.kind === "date" ? new Date().toISOString().slice(0, 10) : "")])));
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const { run, pending, error, setError } = useAction();
  const close = () => { setOpen(false); setError(null); if (sp.get("new")) router.replace(path); };
  const groups: [string, string, Cand[]][] = [["finding", "Findings", cands.findings], ["opportunity", "Opportunities", cands.opportunities], ["experiment", "Experiments and their results", cands.experiments], ["analysis_run", "Analysis runs (exact version)", cands.runs]];
  return (<>
    <button className="btn btn-primary" onClick={() => setOpen(true)}>Record a decision</button>
    <Modal open={open} onClose={close} title="Record a decision" wide>
      <form onSubmit={async (e) => { e.preventDefault(); const links = groups.flatMap(([t, , cs]) => cs.filter((c) => sel[`${t}:${c.id}`]).map((c) => ({ type: t, id: c.id, relation: "informs", direction: "in" }))); const r = await run<{ id: string }>("entity.create", { productId: pid, initiativeId: iid, type: "decision", data: v, links }, { refresh: false }); if (r.ok) { close(); router.push(gotoTemplate.replace("{id}", r.data.id)); router.refresh(); } }}>
        <div className="grid gap-x-3 md:grid-cols-2">{DECISION_FIELDS.map((f) => (
          <div key={f.key} className={f.kind === "area" || f.key === "expected_outcome" || f.key === "next_action" ? "md:col-span-2" : ""}><Field label={f.label} htmlFor={`d-${f.key}`}>
            {f.kind === "select" ? <select id={`d-${f.key}`} className="input" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              : f.kind === "area" ? <textarea id={`d-${f.key}`} required={f.required} rows={f.rows} className="input" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
              : <input id={`d-${f.key}`} type={f.kind === "date" ? "date" : "text"} className="input" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}</Field></div>))}</div>
        <fieldset className="mb-3 rounded-md border border-line p-3"><legend className="px-1 text-[12.5px] font-medium text-muted">Supporting evidence — what does this decision rest on?</legend>
          {groups.map(([t, l, cs]) => cs.length > 0 && <div key={t} className="mb-2"><p className="h-section">{l}</p>{cs.map((c) => <label key={c.id} className="flex items-start gap-2 py-0.5 text-[13px]"><input type="checkbox" className="mt-1" checked={!!sel[`${t}:${c.id}`]} onChange={(e) => setSel({ ...sel, [`${t}:${c.id}`]: e.target.checked })} />{c.label}</label>)}</div>)}
          <p className="text-[12px] text-muted">The exact source versions and run versions are recorded at the time you decide.</p></fieldset>
        <ErrorText message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save decision</button></div>
      </form>
    </Modal>
  </>);
  void decisionId;
}

export function DecisionActions({ pid, d }: { pid: string; d: any }) {
  const { run, pending, error } = useAction();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {d.needs_review ? <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run("decision.reaffirm", { productId: pid, id: d.id })}>I’ve reviewed the changes — reaffirm</button> : null}
      {d.status === "active" && <button className="btn btn-sm" disabled={pending} onClick={() => { if (confirm("Mark this decision superseded? Record the new decision first so the history makes sense.")) run("decision.supersede", { productId: pid, id: d.id }); }}>Mark superseded</button>}
      <ErrorText message={error} />
    </div>
  );
}
export { EntityEditor };
