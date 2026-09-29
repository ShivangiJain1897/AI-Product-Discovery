"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";
import { DeleteButton, LinkAdder, Unlink } from "./records";

export function NewFinding({ pid, iid }: { pid: string; iid?: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, router } = useAction();
  const [v, setV] = useState({ statement: "", interpretation: "", limitations: "", segment: "" });
  return (<>
    <button className="btn btn-sm" onClick={() => setOpen(true)}>New finding</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Record what we learned">
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("finding.create", { productId: pid, initiativeId: iid, ...v }, { refresh: false }); if (r.ok) { setOpen(false); router.push(`${iid ? `/p/${pid}/i/${iid}/evidence` : `/p/${pid}/knowledge`}?tab=findings&item=finding:${r.data.id}`); router.refresh(); } }}>
        <p className="mb-3 rounded bg-warn-soft px-3 py-2 text-[13px] text-warn">A finding is only as good as its evidence. After saving, link excerpts from your sources to support it. It will show “No support yet” until you do.</p>
        <Field label="What did we learn?" htmlFor="nf-s"><textarea id="nf-s" required className="input" rows={2} value={v.statement} onChange={(e) => setV({ ...v, statement: e.target.value })} /></Field>
        <Field label="Interpretation — what does it mean?" htmlFor="nf-i"><textarea id="nf-i" className="input" rows={2} value={v.interpretation} onChange={(e) => setV({ ...v, interpretation: e.target.value })} /></Field>
        <Field label="What remains uncertain (limitations)" htmlFor="nf-l"><textarea id="nf-l" className="input" rows={2} value={v.limitations} onChange={(e) => setV({ ...v, limitations: e.target.value })} /></Field>
        <Field label="Segment or context it applies to" htmlFor="nf-g"><input id="nf-g" className="input" value={v.segment} onChange={(e) => setV({ ...v, segment: e.target.value })} /></Field>
        <ErrorText message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save finding</button></div>
      </form>
    </Modal>
  </>);
}

type Ex = { id: string; text: string; source_id: string; source_title: string; source_version: number; current_version: number; participant: string; segment: string; status: string };
export function FindingPanel({ pid, iid, f, opportunityCandidates, excerptCandidates, mergeTargets, closeHref }: { pid: string; iid?: string; f: any; opportunityCandidates: { type: string; id: string; label: string }[]; excerptCandidates: { type: string; id: string; label: string }[]; mergeTargets: { id: string; statement: string }[]; closeHref: string }) {
  const { run, pending, error, router } = useAction();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ statement: f.statement, interpretation: f.interpretation, limitations: f.limitations, follow_up: f.follow_up, segment: f.segment });
  const [mergeInto, setMergeInto] = useState("");
  const S = f.strength;
  const ExRow = ({ e, rel }: { e: Ex; rel: string }) => (
    <li className="rounded border border-line bg-paper px-2.5 py-1.5 text-[13px]">
      <q className="block">{e.text.length > 260 ? e.text.slice(0, 260) + "…" : e.text}</q>
      <span className="text-[12px] text-muted">
        <Link className="underline" href={`/p/${pid}/sources/${e.source_id}?excerpt=${e.id}${iid ? `&i=${iid}` : ""}`}>{e.source_title}</Link> v{e.source_version}{e.participant ? ` · ${e.participant}` : ""}{e.segment ? ` · ${e.segment}` : ""}
        {e.status !== "ok" && <span className={`badge ml-1 ${e.status === "broken" ? "badge-danger" : "badge-warn"}`}>{e.status === "broken" ? "No longer in current version" : "Moved in current version"}</span>}
        {e.source_version !== e.current_version && e.status === "ok" && <span className="badge ml-1">source now v{e.current_version}</span>}
        <button className="ml-2 text-danger underline" disabled={pending} onClick={() => run("finding.unlinkExcerpt", { productId: pid, findingId: f.id, excerptId: e.id })}>unlink</button>
      </span>
    </li>
  );
  return (
    <section className="card p-4" aria-label="Finding details">
      <div className="mb-2 flex items-center justify-between"><span className="h-section">Finding</span><Link href={closeHref} className="btn btn-quiet btn-sm" aria-label="Close details">✕</Link></div>
      {f.needs_review ? <div className="mb-3 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]"><p className="font-medium text-warn">Needs review</p><p>{f.review_reason}</p><button className="btn btn-sm mt-1.5" disabled={pending} onClick={() => run("finding.markReviewed", { productId: pid, id: f.id })}>I’ve reviewed it — clear the flag</button></div> : null}
      {!edit ? (<>
        <h3 className="text-[15.5px] font-semibold leading-snug">{f.statement}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5"><span className="badge capitalize">{f.status}</span>{f.segment && <span className="badge">Applies to: {f.segment}</span>}{f.origin.startsWith("ai") && <span className="badge badge-warn">{f.origin === "ai-demo" ? "From a demo sample" : "From an AI proposal you accepted"}</span>}{f.origin === "analysis" && <span className="badge">From data</span>}</div>
        <dl className="mt-3 space-y-2 text-[13.5px]">
          <div><dt className="h-section">Interpretation</dt><dd>{f.interpretation || <span className="text-muted">Not written yet</span>}</dd></div>
          <div><dt className="h-section">What remains uncertain</dt><dd className="whitespace-pre-line">{f.limitations || <span className="text-muted">Not written yet</span>}</dd></div>
          <div><dt className="h-section">Suggested follow-up question</dt><dd>{f.follow_up || <span className="text-muted">—</span>}</dd></div>
        </dl>
        <button className="btn btn-sm mt-2" onClick={() => setEdit(true)}>Edit</button>
      </>) : (
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run("entity.update", { productId: pid, type: "finding", id: f.id, data: v }); if (r.ok) setEdit(false); }}>
          <Field label="Finding"><textarea className="input" rows={3} value={v.statement} onChange={(e) => setV({ ...v, statement: e.target.value })} /></Field>
          <Field label="Interpretation"><textarea className="input" rows={2} value={v.interpretation} onChange={(e) => setV({ ...v, interpretation: e.target.value })} /></Field>
          <Field label="Limitations"><textarea className="input" rows={3} value={v.limitations} onChange={(e) => setV({ ...v, limitations: e.target.value })} /></Field>
          <Field label="Follow-up question"><input className="input" value={v.follow_up} onChange={(e) => setV({ ...v, follow_up: e.target.value })} /></Field>
          <Field label="Segment / context"><input className="input" value={v.segment} onChange={(e) => setV({ ...v, segment: e.target.value })} /></Field>
          <ErrorText message={error} /><div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button><button type="button" className="btn btn-sm" onClick={() => setEdit(false)}>Cancel</button></div>
        </form>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="h-section mb-1">Supporting evidence</h4>
        <p className="mb-1.5 text-[13px]"><span className={`badge ${S.level === "strong" ? "badge-accent" : S.level === "weak" ? "badge-warn" : S.level === "unknown" ? "badge-danger" : ""}`}>{S.level === "unknown" ? "No support yet" : `${S.level} evidence`}</span> <span className="text-muted">{S.explanation}</span></p>
        {f.supporting.length > 0 ? <ul className="space-y-1.5">{f.supporting.map((e: Ex) => <ExRow key={e.id} e={e} rel="supports" />)}</ul> : f.dataRefs.length === 0 && <p className="text-[13px] text-muted">Open a source, highlight an excerpt and link it here.</p>}
        {f.dataRefs.map((d: any) => <p key={d.run_id} className="mt-1.5 rounded border border-line bg-paper px-2.5 py-1.5 text-[13px]">Data: <strong>{d.ref?.label}</strong> = {d.ref?.value} · <Link className="underline" href={`/p/${pid}/analyses/${d.analysis_id}?run=${d.seq}`}>{d.title}, run {d.seq}</Link></p>)}
        {f.contradicting.length > 0 && <><h4 className="h-section mb-1 mt-3">Contradicting evidence</h4><ul className="space-y-1.5">{f.contradicting.map((e: Ex) => <ExRow key={e.id} e={e} rel="contradicts" />)}</ul></>}
        {excerptCandidates.length > 0 && <ExcerptLinker pid={pid} findingId={f.id} candidates={excerptCandidates} />}
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="h-section mb-1">Opportunities this informs</h4>
        {f.opportunities.length ? <ul className="text-[13px]">{f.opportunities.map((o: any) => <li key={o.id}><Link className="underline" href={`/p/${pid}/${iid ? `i/${iid}/explore` : "knowledge?tab=opportunities"}${iid ? "?" : "&"}item=opportunity:${o.id}`}>{o.title}</Link></li>)}</ul> : <p className="text-[13px] text-muted">None yet.</p>}
        <LinkAdder pid={pid} fromType="finding" fromId={f.id} candidates={opportunityCandidates} relations={[{ value: "informs", label: "informs" }]} label="Link to an opportunity…" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {f.status === "accepted" ? <button className="btn btn-sm" disabled={pending} onClick={() => run("finding.setStatus", { productId: pid, id: f.id, status: "dismissed" })}>Dismiss</button> : <button className="btn btn-sm" disabled={pending} onClick={() => run("finding.setStatus", { productId: pid, id: f.id, status: "accepted" })}>Accept again</button>}
        {mergeTargets.length > 0 && <>
          <select aria-label="Merge into another finding" className="input !w-auto max-w-[160px] !py-1 text-[12.5px]" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}><option value="">Merge into…</option>{mergeTargets.map((m) => <option key={m.id} value={m.id}>{m.statement.slice(0, 48)}</option>)}</select>
          {mergeInto && <button className="btn btn-sm" disabled={pending} onClick={async () => { if (confirm("Merge? This finding’s evidence moves to the other one and this one is kept as superseded.")) { const r = await run("finding.merge", { productId: pid, fromId: f.id, intoId: mergeInto }); if (r.ok) router.push(closeHref); } }}>Merge</button>}</>}
        <DeleteButton pid={pid} type="finding" id={f.id} label="finding" redirect={closeHref} />
      </div>
    </section>
  );
}

function ExcerptLinker({ pid, findingId, candidates }: { pid: string; findingId: string; candidates: { type: string; id: string; label: string }[] }) {
  const { run, pending } = useAction();
  const [c, setC] = useState(""); const [rel, setRel] = useState("supports");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <select aria-label="Link an existing excerpt" className="input !w-auto max-w-[210px] !py-1 text-[12.5px]" value={c} onChange={(e) => setC(e.target.value)}><option value="">Link an existing excerpt…</option>{candidates.map((x) => <option key={x.id} value={x.id}>{x.label.slice(0, 70)}</option>)}</select>
      <select aria-label="Relationship" className="input !w-auto !py-1 text-[12.5px]" value={rel} onChange={(e) => setRel(e.target.value)}><option value="supports">supports</option><option value="contradicts">contradicts</option></select>
      <button className="btn btn-sm" disabled={!c || pending} onClick={async () => { const r = await run("finding.linkExcerpt", { productId: pid, findingId, excerptId: c, relation: rel }); if (r.ok) setC(""); }}>Link</button>
    </div>
  );
}

export function TabLinks({ tabs, current, base }: { tabs: [string, string][]; current: string; base: string }) {
  return <div role="tablist" className="mb-3 flex gap-1 border-b border-line">{tabs.map(([k, l]) => <Link key={k} role="tab" aria-selected={current === k} href={`${base}${base.includes("?") ? "&" : "?"}tab=${k}`} className={`-mb-px border-b-2 px-3 py-1.5 text-[13.5px] ${current === k ? "border-accent font-medium text-accent-strong" : "border-transparent text-muted hover:text-ink"}`}>{l}</Link>)}</div>;
}
export const _r = { useRouter, useSearchParams, Unlink };
