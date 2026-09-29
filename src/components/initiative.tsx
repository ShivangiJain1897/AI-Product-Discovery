"use client";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { Empty, ErrorText, Field } from "./ui";

export function NewDiscoveryForm({ pid, mode, q }: { pid: string; mode: string; q: string }) {
  const { run, pending, error, router } = useAction();
  const [question, setQuestion] = useState(q);
  const [title, setTitle] = useState("");
  const [more, setMore] = useState(mode !== "question" || !!q);
  const [ctx, setCtx] = useState({ affected: "", outcome: "", decision: "", constraints: "" });
  const [unknown, setUnknown] = useState<Record<string, boolean>>({});
  const fields: [keyof typeof ctx, string, string][] = [
    ["affected", "Who is affected?", "e.g. new business clients and the staff who onboard them"],
    ["outcome", "What outcome matters?", "e.g. onboarding finishes faster with fewer repeated requests"],
    ["decision", "What decision will this work inform?", "e.g. which improvement to pilot first"],
    ["constraints", "What constraints are already known?", "e.g. compliance controls cannot be weakened"],
  ];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run<{ id: string }>("initiative.create", { productId: pid, title, question, mode, ...Object.fromEntries(fields.map(([k]) => [k, unknown[k] ? "" : ctx[k]])) }, { refresh: false });
    if (!r.ok) return;
    const b = `/p/${pid}/i/${r.data.id}`;
    router.push(mode === "evidence" ? `${b}/evidence?add=1` : mode === "process" ? `${b}/explore?tab=process` : `${b}?welcome=1`);
  }
  return (
    <form onSubmit={submit} className="card mx-auto max-w-2xl p-6">
      <h1 className="text-[21px] font-semibold">{mode === "evidence" ? "Start with evidence" : mode === "process" ? "Start with a process" : "Start with a question"}</h1>
      <p className="mb-5 mt-1 text-[13.5px] text-muted">Two things are enough to begin. Everything else can wait, and you can say “I don’t know yet”.</p>
      <Field label="Discovery question" htmlFor="dq" hint="What are you trying to understand? Your wording is kept exactly as written; any refinement is offered as a proposal.">
        <textarea id="dq" autoFocus className="input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} required />
      </Field>
      <Field label="Initiative title (optional)" htmlFor="dt" hint="Defaults to the question."><input id="dt" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      {!more ? <button type="button" className="btn btn-quiet btn-sm mb-4" onClick={() => setMore(true)}>＋ Add context (optional)</button> : (
        <fieldset className="mb-2 rounded-md border border-line p-3">
          <legend className="px-1 text-[12.5px] font-medium text-muted">Context (all optional)</legend>
          {fields.map(([k, label, ph]) => (
            <Field key={k} label={label} htmlFor={`c-${k}`}>
              <input id={`c-${k}`} className="input" disabled={!!unknown[k]} placeholder={unknown[k] ? "I don’t know yet" : ph} value={unknown[k] ? "" : ctx[k]} onChange={(e) => setCtx({ ...ctx, [k]: e.target.value })} />
              <label className="mt-1 flex items-center gap-1.5 text-[12px] text-muted"><input type="checkbox" checked={!!unknown[k]} onChange={(e) => setUnknown({ ...unknown, [k]: e.target.checked })} />I don’t know yet</label>
            </Field>
          ))}
        </fieldset>
      )}
      <ErrorText message={error} />
      <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => router.back()}>Cancel</button><button className="btn btn-primary" disabled={pending}>{pending ? "Drafting a plan…" : "Create and draft a plan"}</button></div>
    </form>
  );
}

export function StatusActions({ pid, iid, status }: { pid: string; iid: string; status: string }) {
  const { run, pending } = useAction();
  const set = (s: string) => run("initiative.setStatus", { productId: pid, id: iid, status: s });
  return (
    <div className="no-print flex flex-wrap gap-1.5">
      {status === "active" && <><button className="btn btn-sm" disabled={pending} onClick={() => set("paused")}>Pause</button><button className="btn btn-sm" disabled={pending} onClick={() => set("completed")}>Mark complete</button></>}
      {status === "paused" && <><button className="btn btn-sm btn-primary" disabled={pending} onClick={() => set("active")}>Resume</button><button className="btn btn-sm" disabled={pending} onClick={() => set("completed")}>Mark complete</button></>}
      {(status === "completed" || status === "archived") && <button className="btn btn-sm btn-primary" disabled={pending} onClick={() => set("active")}>Reopen for further discovery</button>}
      {status !== "archived" && <button className="btn btn-sm btn-quiet" disabled={pending} onClick={() => { if (confirm("Archive this discovery? History and relationships are preserved and you can reopen it.")) set("archived"); }}>Archive</button>}
    </div>
  );
}

const FRAME: [string, string, string][] = [
  ["question", "Discovery question", "What are we investigating?"],
  ["affected", "Who is affected", "Target users or segment"],
  ["outcome", "Desired outcome", "What would tell us we succeeded?"],
  ["decision_to_inform", "Decision this informs", "What will be decided with this?"],
  ["scope", "Scope", "What is in and out?"],
  ["constraints", "Constraints", "What is already fixed?"],
];
export function FrameEditor({ pid, iid, init }: { pid: string; iid: string; init: Record<string, string> }) {
  const { run, pending, error, setError } = useAction();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(init);
  return (
    <section aria-labelledby="frame-h" className="card p-4">
      <div className="mb-2 flex items-center justify-between"><h2 id="frame-h" className="text-[15px] font-semibold">The question and its frame</h2>
        {!edit ? <button className="btn btn-sm" onClick={() => setEdit(true)}>Edit</button> : null}</div>
      {!edit ? (
        <dl className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
          {FRAME.map(([k, l]) => (
            <div key={k} className={k === "question" ? "md:col-span-2" : ""}>
              <dt className="h-section">{l}</dt>
              <dd className={k === "question" ? "text-[16px] font-medium" : "text-[14px]"}>{init[k] || <span className="text-muted">Not yet known</span>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run("initiative.update", { productId: pid, id: iid, fields: v }); if (r.ok) setEdit(false); }}>
          {FRAME.map(([k, l, ph]) => <Field key={k} label={l} htmlFor={`f-${k}`}><textarea id={`f-${k}`} rows={k === "question" ? 2 : 1} className="input" placeholder={ph} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}
          <ErrorText message={error} />
          <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button><button type="button" className="btn btn-sm" onClick={() => { setEdit(false); setV(init); setError(null); }}>Cancel</button></div>
        </form>
      )}
    </section>
  );
}

type Plan = { mode: string; refinedQuestion: string; known: string[]; unknowns: string[]; firstActivity: string; evidenceToCollect: string[]; edited?: boolean };
export function PlanCard({ pid, iid, plan, refined, refinedStatus, original, startHref }: { pid: string; iid: string; plan: Plan | null; refined: string; refinedStatus: string; original: string; startHref: string }) {
  const { run, pending, error } = useAction();
  const [edit, setEdit] = useState(false);
  const [p, setP] = useState<Plan | null>(plan);
  const [ref, setRef] = useState(refined);
  if (!plan || !p) return null;
  const lines = (a: string[]) => a.join("\n");
  const parse = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <section aria-labelledby="plan-h" className="card border-accent/30 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 id="plan-h" className="text-[15px] font-semibold">Discovery plan</h2>
        <span className={`badge ${plan.mode === "live" ? "badge-accent" : "badge-warn"}`}>{plan.mode === "live" ? "Drafted by a live model" : "Template draft (demo mode)"}</span>
        {plan.edited && <span className="badge">Edited by you</span>}
        <button className="btn btn-sm ml-auto" onClick={() => setEdit(!edit)}>{edit ? "Done" : "Edit plan"}</button>
      </div>
      <p className="mb-3 text-[12.5px] text-muted">A starting proposal, not a requirement. Change anything.</p>
      {refinedStatus === "proposed" && refined && refined !== original && (
        <div className="mb-3 rounded-md border border-line bg-accent-soft/50 p-3">
          <p className="h-section">Proposed refinement of your question</p>
          <p className="mt-0.5 text-[14.5px]">{refined}</p>
          <p className="mt-1 text-[12px] text-muted">Your original wording stays as the discovery question unless you accept this.</p>
          <div className="mt-2 flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run("initiative.refined", { productId: pid, id: iid, action: "accept" })}>Accept as refined question</button><button className="btn btn-sm" disabled={pending} onClick={() => run("initiative.refined", { productId: pid, id: iid, action: "dismiss" })}>Keep my wording</button></div>
        </div>
      )}
      {refinedStatus === "accepted" && <p className="mb-3 text-[13px]"><span className="badge badge-accent mr-1.5">Refined question accepted</span>{refined}</p>}
      {!edit ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div><p className="h-section mb-1">What is already known</p>{p.known.length ? <ul className="list-disc pl-5 text-[13.5px]">{p.known.map((k) => <li key={k}>{k}</li>)}</ul> : <p className="text-[13.5px] text-muted">Nothing stated yet.</p>}</div>
          <div><p className="h-section mb-1">Important unknowns</p><ul className="list-disc pl-5 text-[13.5px]">{p.unknowns.map((k) => <li key={k}>{k}</li>)}</ul></div>
          <div><p className="h-section mb-1">Suggested first activity</p><p className="text-[13.5px]">{p.firstActivity}</p><a href={startHref} className="btn btn-primary btn-sm mt-2">Start here</a></div>
          <div><p className="h-section mb-1">Evidence worth collecting</p><ul className="list-disc pl-5 text-[13.5px]">{p.evidenceToCollect.map((k) => <li key={k}>{k}</li>)}</ul></div>
        </div>
      ) : (
        <form className="grid gap-3 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await run("initiative.savePlan", { productId: pid, id: iid, plan: p }); setEdit(false); }}>
          <Field label="Refined question (proposal)"><textarea className="input" rows={2} value={ref} onChange={(e) => { setRef(e.target.value); setP({ ...p, refinedQuestion: e.target.value }); }} /></Field>
          <Field label="Suggested first activity"><textarea className="input" rows={2} value={p.firstActivity} onChange={(e) => setP({ ...p, firstActivity: e.target.value })} /></Field>
          <Field label="Already known (one per line)"><textarea className="input" rows={4} value={lines(p.known)} onChange={(e) => setP({ ...p, known: parse(e.target.value) })} /></Field>
          <Field label="Important unknowns (one per line)"><textarea className="input" rows={4} value={lines(p.unknowns)} onChange={(e) => setP({ ...p, unknowns: parse(e.target.value) })} /></Field>
          <Field label="Evidence to collect (one per line)"><textarea className="input" rows={4} value={lines(p.evidenceToCollect)} onChange={(e) => setP({ ...p, evidenceToCollect: parse(e.target.value) })} /></Field>
          <div className="md:col-span-2"><ErrorText message={error} /><button className="btn btn-primary btn-sm" disabled={pending}>Save plan</button></div>
        </form>
      )}
    </section>
  );
}

export function EmptyState(props: { title: string; body: string; children?: React.ReactNode }) { return <Empty title={props.title} action={props.children}>{props.body}</Empty>; }
