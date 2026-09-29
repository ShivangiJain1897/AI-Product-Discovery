"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText } from "./ui";

type Ref = { sourceId: string; quote: string };
type Props = { pid: string; proposalId: string; sourceTitles?: Record<string, string>; onDone?: () => void };

export function ProposalReview({ pid, proposalId }: Props) {
  const { run, pending, error } = useAction();
  const [data, setData] = useState<any>(null);
  const [edits, setEdits] = useState<Record<number, any>>({});
  const [merge, setMerge] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/proposal?pid=${pid}&id=${proposalId}`).then((x) => x.json());
    if (r.ok) setData(r); else setErr(r.error);
  }, [pid, proposalId]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="text-[13px] text-danger">{err}</p>;
  if (!data) return <p className="text-[13px] text-muted">Loading proposal…</p>;
  const p = data.proposal, pr = p.payload, acc = p.accepted_items as Record<string, any>;
  const demo = p.mode === "demo";
  const srcTitle: Record<string, string> = Object.fromEntries((p.scope.sourceIds ?? []).map((s: any) => [s.id, s.title]));
  const act = async (index: number, dismiss = false) => {
    const r = dismiss ? await run("ai.dismissItem", { productId: pid, proposalId, index }) : await run("ai.accept", { productId: pid, proposalId, index, overrides: edits[index] ?? {}, mergeIntoId: merge[index] || undefined });
    if (r.ok) load();
  };
  const set = (i: number, k: string, v: string) => setEdits({ ...edits, [i]: { ...(edits[i] ?? {}), [k]: v } });
  const val = (i: number, k: string, d: string) => edits[i]?.[k] ?? d;
  const Quote = ({ r }: { r: Ref }) => <li className="text-[12.5px]"><q className="text-ink">{r.quote}</q> <span className="text-muted">— {srcTitle[r.sourceId] ?? r.sourceId}</span></li>;

  return (
    <div className="rounded-md border border-line-strong bg-paper p-3" aria-label="AI proposal preview">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`badge ${demo ? "badge-warn" : "badge-accent"}`}>{demo ? "Demo sample — not a model response" : "Live model response"}</span>
        <span className="badge">Preview: nothing is saved until you accept</span>
      </div>
      <h3 className="mt-2 text-[14.5px] font-semibold">{pr.title}</h3>
      <p className="text-[13px] text-muted">{pr.summary}</p>
      {p.rejected.length > 0 && (
        <details className="mt-2 rounded border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[12.5px]"><summary className="cursor-pointer font-medium text-danger">{p.rejected.length} item(s) rejected: references could not be verified</summary>
          <ul className="mt-1 list-disc pl-4">{p.rejected.map((r: any) => <li key={r.index}>“{r.label}” — {r.reason}</li>)}</ul></details>
      )}
      {pr.notes && Object.entries(pr.notes).some(([, v]) => (v as string[])?.length) && (
        <details className="mt-2 text-[13px]" open><summary className="cursor-pointer font-medium">Themes, contradictions and gaps</summary>
          {Object.entries(pr.notes).filter(([, v]) => (v as string[])?.length).map(([k, v]) => <div key={k} className="mt-1"><span className="h-section">{k}</span><ul className="list-disc pl-4 text-[12.5px]">{(v as string[]).map((x) => <li key={x}>{x}</li>)}</ul></div>)}</details>
      )}
      <div className="mt-3 space-y-2.5">
        {p.kind === "process_draft" ? (
          <div>
            {pr.items.length === 0 ? <p className="text-[13px] text-muted">No steps could be drafted.</p> : <>
              <table className="tbl"><thead><tr><th>Step</th><th>Owner</th><th>Basis</th></tr></thead><tbody>
                {pr.items.map((s: any) => <tr key={s.tempId}><td>{s.type !== "activity" && <span className="badge mr-1">{s.type}</span>}{s.name}</td><td>{s.actor || "—"}</td><td>{s.support === "evidence" ? <span className="badge badge-accent" title={s.refs[0]?.quote}>Supported by evidence</span> : <span className="badge badge-warn">Inferred — confirm</span>}</td></tr>)}
              </tbody></table>
              {acc["0"]?.entityId ? <p className="mt-2 text-[13px]">Created. <Link className="underline" href={`/p/${pid}/maps/${acc["0"].entityId}`}>Open the map →</Link></p> : (
                <div className="mt-2 flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(0)}>Create editable map from draft</button><button className="btn btn-sm" onClick={() => act(0, true)}>Dismiss</button></div>)}
            </>}
          </div>
        ) : pr.items.map((it: any, i: number) => {
          const a = acc[String(i)];
          return (
            <div key={i} className={`card p-3 ${a?.dismissed ? "opacity-50" : ""}`}>
              {p.kind === "synthesis" && (<>
                <textarea aria-label="Finding statement" className="input mb-1.5 font-medium" rows={2} disabled={!!a} value={val(i, "statement", it.statement)} onChange={(e) => set(i, "statement", e.target.value)} />
                <p className="text-[12.5px]"><span className="font-medium">Interpretation:</span> {it.interpretation}</p>
                <p className="text-[12.5px]"><span className="font-medium">Limitations:</span> {it.limitations}</p>
                <p className="text-[12.5px]"><span className="font-medium">Suggested follow-up:</span> {it.followUp}</p>
                <p className="mt-1.5 h-section">Supporting excerpts (verified verbatim)</p><ul className="list-disc pl-4">{it.supporting.map((r: Ref, k: number) => <Quote key={k} r={r} />)}</ul>
                {it.contradicting.length > 0 && <><p className="mt-1.5 h-section">Contradicting</p><ul className="list-disc pl-4">{it.contradicting.map((r: Ref, k: number) => <Quote key={k} r={r} />)}</ul></>}
                <p className="mt-1.5 text-[12.5px]"><span className={`badge ${it.strengthPreview.level === "strong" ? "badge-accent" : it.strengthPreview.level === "weak" ? "badge-warn" : ""}`}>{it.strengthPreview.level} evidence</span> {it.strengthPreview.explanation} <em className="text-muted">Calculated from the excerpts, not by AI.</em></p>
              </>)}
              {["opportunities", "concepts", "assumptions", "experiment"].includes(p.kind) && (<>
                <input aria-label="Title" className="input mb-1.5 font-medium" disabled={!!a} value={val(i, it.title !== undefined ? "title" : "statement", it.title ?? it.statement)} onChange={(e) => set(i, it.title !== undefined ? "title" : "statement", e.target.value)} />
                {(it.problem || it.description || it.hypothesis) && <p className="text-[13px]">{it.problem || it.description || it.hypothesis}</p>}
                {it.tradeoffs && <p className="text-[12.5px] text-muted">Trade-offs: {it.tradeoffs}</p>}
                {it.interventionType && <span className="badge">{it.interventionType.replace("_", " ")}</span>}
                {it.category && it.category !== "none" && <span className="badge">{it.category.replace("_", " ")}</span>}
                {it.method && <span className="badge">{it.method.replace("_", " ")}</span>}
                {p.kind === "experiment" && <p className="mt-1 text-[12.5px]">Success criterion: {it.successCriterion || <em className="text-warn">not set — define it before running</em>}</p>}
              </>)}
              {p.kind === "challenge" && (<>
                {[["Alternative explanations", it.alternativeExplanations], ["Missing evidence", it.missingEvidence], ["Would change our view", it.evidenceThatWouldChangeView]].map(([l, arr]: any) => arr.length > 0 && <div key={l} className="mb-1"><p className="h-section">{l}</p><ul className="list-disc pl-4 text-[13px]">{arr.map((x: string) => <li key={x}>{x}</li>)}</ul></div>)}
                {it.tooBroad && <p className="text-[13px]"><span className="font-medium">Scope:</span> {it.tooBroad}</p>}
              </>)}
              {a?.entityId ? <p className="mt-2 text-[13px] text-accent-strong">✓ {a.merged ? "Merged into existing finding" : p.kind === "challenge" ? "Added to the record’s limitations/unknowns" : "Accepted and saved"}. <Link className="underline" href={a.href ?? "#"} onClick={(e) => { if (!a.href) e.preventDefault(); }}>{a.href ? "View →" : ""}</Link></p>
                : a?.dismissed ? <p className="mt-2 text-[12.5px] text-muted">Dismissed</p> : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => act(i)}>{p.kind === "synthesis" ? "Accept as finding" : p.kind === "challenge" ? "Add to record" : "Accept"}</button>
                  {p.kind === "synthesis" && data.mergeTargets.length > 0 && (
                    <select aria-label="Merge into an existing finding" className="input !w-auto max-w-[170px] !py-1 text-[12.5px]" value={merge[i] ?? ""} onChange={(e) => setMerge({ ...merge, [i]: e.target.value })}>
                      <option value="">Merge into…</option>{data.mergeTargets.map((f: any) => <option key={f.id} value={f.id}>{f.statement.slice(0, 50)}</option>)}
                    </select>)}
                  {merge[i] && <button className="btn btn-sm" disabled={pending} onClick={() => act(i)}>Merge</button>}
                  <button className="btn btn-sm btn-quiet" onClick={() => act(i, true)}>Dismiss</button>
                </div>)}
            </div>
          );
        })}
      </div>
      {pr.items.length === 0 && <p className="mt-2 text-[13px] text-muted">Nothing was proposed.</p>}
      <ErrorText message={error} />
      {[["Assumptions made", pr.assumptions], ["Uncertainties and limitations", pr.uncertainties], ["Suggested follow-up", pr.followUps]].map(([l, arr]: any) => arr?.length > 0 && (
        <div key={l} className="mt-2"><p className="h-section">{l}</p><ul className="list-disc pl-4 text-[12.5px]">{arr.map((x: string) => <li key={x}>{x}</li>)}</ul></div>))}
    </div>
  );
}

export type AssistAction = { kind: string; label: string; hint: string; scope: Record<string, unknown>; analysisId?: string; disabled?: string };

export function AssistPanel({ pid, actions, pending: pendingProposals = [], title = "Ask AI to help" }: { pid: string; actions: AssistAction[]; pending?: { id: string; kind: string; mode: string }[]; title?: string }) {
  const { run, pending, error } = useAction();
  const [open, setOpen] = useState<string[]>([]);
  async function go(a: AssistAction) {
    const r = await run<{ id: string }>("ai.generate", { productId: pid, kind: a.kind, scope: a.scope, analysisId: a.analysisId }, { refresh: false });
    if (r.ok) setOpen((o) => [r.data.id, ...o]);
  }
  const ids = [...new Set([...open, ...pendingProposals.map((p) => p.id)])];
  return (
    <section className="card p-4" aria-labelledby="assist-h">
      <h2 id="assist-h" className="text-[15px] font-semibold">{title}</h2>
      <p className="mb-2 text-[12.5px] text-muted">Works only on what you have selected. Every result is a preview you can accept, edit or dismiss.</p>
      <div className="space-y-1.5">
        {actions.map((a) => (
          <div key={a.label}><button className="btn w-full !justify-start !whitespace-normal text-left" disabled={pending || !!a.disabled} onClick={() => go(a)} title={a.disabled ?? a.hint}>{a.label}</button>
            <p className="px-1 text-[12px] text-muted">{a.disabled ?? a.hint}</p></div>
        ))}
      </div>
      <ErrorText message={error} />
      {ids.length > 0 && <div className="mt-3 space-y-3">{ids.map((id) => <ProposalReview key={id} pid={pid} proposalId={id} />)}</div>}
    </section>
  );
}
