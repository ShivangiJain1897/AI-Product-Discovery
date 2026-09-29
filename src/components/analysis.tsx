"use client";
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText, Field } from "./ui";
import { LinkAdder, Unlink } from "./records";

export function AnalysisMeta({ pid, a, initiatives }: { pid: string; a: any; initiatives: { id: string; title: string }[] }) {
  const { run, pending, error } = useAction();
  const [v, setV] = useState({ title: a.title, question: a.question, notes: a.notes, interpretation: a.interpretation });
  const dirty = v.title !== a.title || v.question !== a.question || v.notes !== a.notes || v.interpretation !== a.interpretation;
  const [note, setNote] = useState("");
  return (
    <section className="card p-4" aria-labelledby="am-h">
      <h2 id="am-h" className="sr-only">Analysis details</h2>
      <div className="grid gap-x-4 md:grid-cols-[1fr_auto_auto]">
        <Field label="Title" htmlFor="an-t"><input id="an-t" className="input font-medium" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Status" htmlFor="an-s"><select id="an-s" className="input" value={a.status} onChange={(e) => run("analysis.update", { productId: pid, id: a.id, fields: { status: e.target.value } })}><option value="draft">Draft</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></Field>
        <Field label="Belongs to discovery" htmlFor="an-i"><select id="an-i" className="input" value={a.initiative_id ?? ""} onChange={(e) => run("analysis.update", { productId: pid, id: a.id, fields: { initiativeId: e.target.value || null } })}><option value="">None (product-level)</option>{initiatives.map((i) => <option key={i.id} value={i.id}>{i.title.slice(0, 48)}</option>)}</select></Field>
      </div>
      <Field label="Question being investigated" htmlFor="an-q"><textarea id="an-q" className="input" rows={2} value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} /></Field>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Your notes" htmlFor="an-n"><textarea id="an-n" className="input" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        <Field label="Your interpretation" htmlFor="an-p" hint="Kept separate from the results above."><textarea id="an-p" className="input" rows={3} value={v.interpretation} onChange={(e) => setV({ ...v, interpretation: e.target.value })} /></Field>
      </div>
      <ErrorText message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending || !dirty} onClick={() => run("analysis.update", { productId: pid, id: a.id, fields: v })}>Save changes</button>
        <input aria-label="Revision note" className="input !w-52 !py-1" placeholder="Revision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-sm" disabled={pending || dirty} title={dirty ? "Save your changes first" : ""} onClick={async () => { const r = await run("analysis.saveRevision", { productId: pid, id: a.id, note: note || "Saved revision" }); if (r.ok) setNote(""); }}>Save a revision</button>
        <button className="btn btn-sm" disabled={pending} onClick={async () => { const r = await run<{ id: string }>("analysis.duplicate", { productId: pid, id: a.id }, { refresh: false }); if (r.ok) window.location.href = `/p/${pid}/analyses/${r.data.id}`; }}>Duplicate to explore another question</button>
      </div>
    </section>
  );
}

export function ScopePicker({ pid, a, sources, selected, initiativeCount }: { pid: string; a: any; sources: { id: string; title: string; content_kind: string }[]; selected: string[]; initiativeCount: number }) {
  const { run, pending, error } = useAction();
  const [scope, setScope] = useState<string>(a.scope);
  const [sel, setSel] = useState<string[]>(selected);
  const usable = sources.filter((s) => s.content_kind === "text");
  const save = () => run("analysis.update", { productId: pid, id: a.id, fields: { scope } }).then(() => run("analysis.setSources", { productId: pid, id: a.id, sourceIds: sel }));
  return (
    <section className="card p-4" aria-labelledby="sc-h"><h2 id="sc-h" className="text-[15px] font-semibold">Inputs: evidence scope</h2>
      <p className="mb-2 text-[12.5px] text-muted">Selected sources are the default. Broaden explicitly; earlier runs always keep the inputs they used.</p>
      <fieldset className="mb-2 space-y-1 text-[13.5px]"><legend className="sr-only">Scope</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={scope === "selected"} onChange={() => setScope("selected")} />Selected sources only</label>
        {a.initiative_id && <label className="flex items-center gap-2"><input type="radio" checked={scope === "initiative"} onChange={() => setScope("initiative")} />Everything in the current discovery ({initiativeCount} sources)</label>}
        <label className="flex items-center gap-2"><input type="radio" checked={scope === "product"} onChange={() => setScope("product")} />Broader: all relevant evidence in this product</label></fieldset>
      {scope === "selected" && (usable.length === 0 ? <p className="text-[13px] text-muted">No text evidence in this product yet.</p> : <div className="max-h-44 overflow-auto rounded border border-line p-2">{usable.map((s) => <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />{s.title}</label>)}</div>)}
      <ErrorText message={error} />
      <button className="btn btn-sm mt-2" disabled={pending} onClick={save}>Save scope</button></section>
  );
}

export function RunBar({ pid, a, disabledReason, label, extra }: { pid: string; a: any; disabledReason?: string; label: string; extra?: React.ReactNode }) {
  const { run, pending, error, router } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-primary" disabled={pending || !!disabledReason} title={disabledReason} onClick={async () => { const r = await run<{ seq: number }>("analysis.run", { productId: pid, id: a.id }, { refresh: false }); if (r.ok) { router.push(`/p/${pid}/analyses/${a.id}?run=${r.data.seq}`); router.refresh(); } }}>{pending ? "Running…" : label}</button>
      {extra}
      {disabledReason && <span className="text-[12.5px] text-muted">{disabledReason}</span>}
      <ErrorText message={error} />
    </div>
  );
}

export function RunHistory({ pid, a, runs, current }: { pid: string; a: any; runs: { seq: number; mode: string; created_at: string; summary: string; sourceCount: number }[]; current: number }) {
  const { run, error } = useAction();
  const [x, setX] = useState<number | "">(runs[1]?.seq ?? ""); const [y, setY] = useState<number | "">(runs[0]?.seq ?? "");
  const [cmp, setCmp] = useState<any>(null);
  return (
    <section className="card p-4" aria-labelledby="rh-h"><h2 id="rh-h" className="text-[15px] font-semibold">Run history</h2>
      <p className="mb-2 text-[12.5px] text-muted">Every run keeps its own inputs and results. Rerunning never replaces an earlier one.</p>
      {runs.length === 0 ? <p className="text-[13px] text-muted">Not run yet.</p> : <ul className="mb-3 space-y-1">{runs.map((r) => <li key={r.seq} className="text-[13px]"><Link href={`/p/${pid}/analyses/${a.id}?run=${r.seq}`} className={`hover:underline ${r.seq === current ? "font-semibold text-accent-strong" : ""}`}>Run {r.seq}</Link> <span className="badge">{r.mode}</span> <span className="text-muted">{r.created_at.slice(0, 16).replace("T", " ")} · {r.sourceCount} source(s)</span></li>)}</ul>}
      {runs.length >= 2 && (<div className="border-t border-line pt-3"><h3 className="h-section mb-1">Compare runs</h3>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]"><label className="sr-only" htmlFor="cx">Earlier run</label><select id="cx" className="input !w-auto !py-1" value={x} onChange={(e) => setX(Number(e.target.value))}>{runs.map((r) => <option key={r.seq} value={r.seq}>Run {r.seq}</option>)}</select><span>→</span><label className="sr-only" htmlFor="cy">Later run</label><select id="cy" className="input !w-auto !py-1" value={y} onChange={(e) => setY(Number(e.target.value))}>{runs.map((r) => <option key={r.seq} value={r.seq}>Run {r.seq}</option>)}</select>
          <button className="btn btn-sm" disabled={x === "" || y === "" || x === y} onClick={async () => { const r = await run("analysis.compare", { productId: pid, id: a.id, seqA: x, seqB: y }, { refresh: false }); if (r.ok) setCmp(r.data); }}>Compare</button></div>
        <ErrorText message={error} />
        {cmp && (
          <div className="mt-3 space-y-2 text-[13px]" aria-live="polite">
            <p className="font-medium">Run {cmp.a.seq} → Run {cmp.b.seq}</p>
            <div><p className="h-section">What changed in the inputs</p>
              {!cmp.inputs.added.length && !cmp.inputs.removed.length && !cmp.inputs.versionChanged.length && !cmp.inputs.questionChanged ? <p className="text-muted">Same evidence, same versions.</p> : <ul className="list-disc pl-5">{cmp.inputs.added.map((s: string) => <li key={s}>Added: {s}</li>)}{cmp.inputs.removed.map((s: string) => <li key={s}>Removed: {s}</li>)}{cmp.inputs.versionChanged.map((s: string) => <li key={s}>Changed: {s}</li>)}{cmp.inputs.questionChanged && <li>Question edited</li>}</ul>}</div>
            <table className="tbl"><thead><tr><th>Result</th><th>Run {cmp.a.seq}</th><th>Run {cmp.b.seq}</th></tr></thead><tbody>{cmp.metrics.map((m: any) => <tr key={m.label} className={m.changed ? "bg-warn-soft/50" : ""}><td>{m.label}</td><td>{m.a}</td><td>{m.b}{m.changed && <span className="badge badge-warn ml-1">changed</span>}</td></tr>)}</tbody></table>
            {(cmp.items.added.length > 0 || cmp.items.removed.length > 0) && <div><p className="h-section">Findings and patterns</p><ul className="list-disc pl-5">{cmp.items.added.map((s: string) => <li key={s}><span className="badge badge-accent mr-1">new</span>{s}</li>)}{cmp.items.removed.map((s: string) => <li key={s}><span className="badge badge-danger mr-1">gone</span>{s}</li>)}</ul></div>}
          </div>)}
      </div>)}
    </section>
  );
}

export function RevisionList({ pid, a, revisions }: { pid: string; a: any; revisions: { seq: number; note: string; created_at: string }[] }) {
  const { run, pending } = useAction();
  return (
    <section className="card p-4" aria-labelledby="rv-h"><h2 id="rv-h" className="text-[15px] font-semibold">Saved revisions</h2>
      <p className="mb-2 text-[12.5px] text-muted">Meaningful versions of your own work on this analysis — no AI run required.</p>
      <ul className="space-y-1">{revisions.map((r) => <li key={r.seq} className="flex items-center justify-between gap-2 text-[13px]"><span><span className="badge mr-1">#{r.seq}</span>{r.note || "Saved"} <span className="text-muted">· {r.created_at.slice(0, 16).replace("T", " ")}</span></span>
        {r.seq !== revisions[0].seq && <button className="btn btn-sm btn-quiet" disabled={pending} onClick={() => { if (confirm(`Restore revision ${r.seq}? Your current state is saved as a revision first.`)) run("analysis.restoreRevision", { productId: pid, id: a.id, seq: r.seq }); }}>Restore</button>}</li>)}</ul></section>
  );
}

export function ResultLinks({ pid, runId, links, candidates }: { pid: string; runId: string; links: { linkId: string; type: string; label: string; href: string }[]; candidates: { type: string; id: string; label: string }[] }) {
  return (
    <section className="card p-4" aria-labelledby="rl-h"><h2 id="rl-h" className="text-[15px] font-semibold">Link this run’s results to…</h2>
      <p className="mb-2 text-[12.5px] text-muted">Findings, opportunities, experiments and decisions can point at this exact run.</p>
      {links.length > 0 && <ul className="mb-2 space-y-1">{links.map((l) => <li key={l.linkId} className="text-[13px]"><span className="badge mr-1">{l.type}</span><Link className="hover:underline" href={l.href}>{l.label}</Link> <Unlink pid={pid} linkId={l.linkId} /></li>)}</ul>}
      <LinkAdder pid={pid} fromType="analysis_run" fromId={runId} candidates={candidates} relations={[{ value: "informs", label: "informs" }]} label="Choose a record…" />
    </section>
  );
}

// ---------- type-specific editors ----------
export function ProblemEditor({ pid, a }: { pid: string; a: any }) {
  const { run, pending, error } = useAction();
  const [d, setD] = useState<any>(a.data);
  const set = (k: string, v: unknown) => setD({ ...d, [k]: v });
  const causes: { text: string; status: string; evidence: string }[] = d.causes ?? [];
  return (
    <section className="card p-4" aria-labelledby="pe-h"><h2 id="pe-h" className="text-[15px] font-semibold">Problem analysis</h2>
      <p className="mb-3 text-[12.5px] text-muted">Separate what you observe (symptoms) from why you think it happens (causes). Causes stay hypotheses until validated.</p>
      <Field label="Problem statement" htmlFor="pa-p"><textarea id="pa-p" className="input" rows={2} value={d.problem ?? ""} onChange={(e) => set("problem", e.target.value)} /></Field>
      <div className="grid gap-x-3 md:grid-cols-2"><Field label="Context: when and where it occurs" htmlFor="pa-c"><textarea id="pa-c" className="input" rows={2} value={d.context ?? ""} onChange={(e) => set("context", e.target.value)} /></Field><Field label="Symptoms (what we can observe)" htmlFor="pa-s"><textarea id="pa-s" className="input" rows={2} value={d.symptoms ?? ""} onChange={(e) => set("symptoms", e.target.value)} /></Field></div>
      <h3 className="h-section mb-1">Possible contributing causes</h3>
      <ul className="mb-2 space-y-2">{causes.map((c, i) => (
        <li key={i} className="rounded border border-line p-2.5"><div className="flex gap-2"><input aria-label="Possible cause" className="input" value={c.text} onChange={(e) => set("causes", causes.map((x, k) => k === i ? { ...x, text: e.target.value } : x))} />
          <select aria-label="Status" className="input !w-40" value={c.status} onChange={(e) => set("causes", causes.map((x, k) => k === i ? { ...x, status: e.target.value } : x))}><option value="hypothesis">Hypothesis</option><option value="supported">Validated</option><option value="ruled_out">Ruled out</option></select>
          <button className="btn btn-quiet btn-sm" aria-label="Remove cause" onClick={() => set("causes", causes.filter((_, k) => k !== i))}>✕</button></div>
          <input aria-label="Evidence for or against" className="input mt-1.5 !py-1 text-[12.5px]" placeholder="What evidence supports or rules this out?" value={c.evidence} onChange={(e) => set("causes", causes.map((x, k) => k === i ? { ...x, evidence: e.target.value } : x))} />
          {c.status === "supported" && !c.evidence.trim() && <p className="mt-1 text-[12px] text-warn">Marked validated without evidence — say what validated it.</p>}</li>))}</ul>
      <button className="btn btn-sm mb-3" onClick={() => set("causes", [...causes, { text: "", status: "hypothesis", evidence: "" }])}>Add a possible cause</button>
      <Field label="Alternative explanations" htmlFor="pa-a"><textarea id="pa-a" className="input" rows={2} value={d.alternatives ?? ""} onChange={(e) => set("alternatives", e.target.value)} /></Field>
      <ErrorText message={error} /><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run("analysis.update", { productId: pid, id: a.id, fields: { data: d } })}>Save analysis</button></section>
  );
}

export function ComparisonEditor({ pid, a, concepts }: { pid: string; a: any; concepts: { id: string; title: string }[] }) {
  const { run, pending, error } = useAction();
  const [d, setD] = useState<any>(a.data);
  const chosen = concepts.filter((c) => (d.conceptIds ?? []).includes(c.id));
  const setRating = (cid: string, key: string, patch: any) => setD({ ...d, ratings: { ...d.ratings, [cid]: { ...(d.ratings?.[cid] ?? {}), [key]: { ...(d.ratings?.[cid]?.[key] ?? {}), ...patch } } } });
  return (
    <section className="card p-4" aria-labelledby="ce-h"><h2 id="ce-h" className="text-[15px] font-semibold">Inputs: concepts and criteria</h2>
      <fieldset className="my-2"><legend className="label">Concepts to compare (at least two)</legend>{concepts.length === 0 ? <p className="text-[13px] text-muted">Add solution concepts in a discovery’s Explore section first.</p> : concepts.map((c) => <label key={c.id} className="flex items-center gap-2 py-0.5 text-[13.5px]"><input type="checkbox" checked={(d.conceptIds ?? []).includes(c.id)} onChange={(e) => setD({ ...d, conceptIds: e.target.checked ? [...(d.conceptIds ?? []), c.id] : d.conceptIds.filter((x: string) => x !== c.id) })} />{c.title}</label>)}</fieldset>
      <h3 className="label mt-2">Criteria</h3><div className="mb-2 flex flex-wrap gap-2">{d.criteria.map((c: any, i: number) => <span key={c.key} className="flex items-center gap-1"><input aria-label="Criterion" className="input !w-44 !py-1" value={c.label} onChange={(e) => setD({ ...d, criteria: d.criteria.map((x: any, k: number) => k === i ? { ...x, label: e.target.value } : x) })} /><button className="btn btn-quiet btn-sm" aria-label="Remove criterion" onClick={() => setD({ ...d, criteria: d.criteria.filter((_: any, k: number) => k !== i) })}>✕</button></span>)}<button className="btn btn-sm" onClick={() => setD({ ...d, criteria: [...d.criteria, { key: `c${Date.now() % 100000}`, label: "New criterion" }] })}>Add criterion</button></div>
      {chosen.length > 0 && <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Concept</th>{d.criteria.map((c: any) => <th key={c.key}>{c.label} <span className="normal-case text-muted">(1 poor – 5 strong)</span></th>)}</tr></thead><tbody>{chosen.map((c) => <tr key={c.id}><td className="font-medium">{c.title}</td>{d.criteria.map((k: any) => <td key={k.key}><select aria-label={`${k.label} for ${c.title}`} className="input !w-24 !py-1" value={d.ratings?.[c.id]?.[k.key]?.value ?? ""} onChange={(e) => setRating(c.id, k.key, { value: e.target.value === "" ? null : Number(e.target.value) })}><option value="">unknown</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select><input aria-label="Note" className="input mt-1 !py-0.5 text-[12px]" placeholder="why?" value={d.ratings?.[c.id]?.[k.key]?.note ?? ""} onChange={(e) => setRating(c.id, k.key, { note: e.target.value })} /></td>)}</tr>)}</tbody></table></div>}
      <ErrorText message={error} /><button className="btn btn-sm mt-2" disabled={pending} onClick={() => run("analysis.update", { productId: pid, id: a.id, fields: { data: d } })}>Save inputs</button></section>
  );
}

export function SimplePick({ pid, a, field, label, options, allowAll }: { pid: string; a: any; field: string; label: string; options: { value: string; label: string }[]; allowAll?: boolean }) {
  const { run, pending } = useAction();
  return (
    <section className="card p-4"><Field label={label} htmlFor="sp"><select id="sp" className="input max-w-md" value={a.data[field] ?? ""} disabled={pending} onChange={(e) => run("analysis.update", { productId: pid, id: a.id, fields: { data: { ...a.data, [field]: e.target.value } } })}>{allowAll ? null : <option value="">Choose…</option>}{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field></section>
  );
}

export function AnalysisHeaderLite({ pid, a, icon, initiative }: { pid: string; a: { id: string; title: string; status: string; initiative_id: string | null }; icon: string; initiative: { id: string; title: string } | null }) {
  const { run, pending } = useAction();
  const [edit, setEdit] = useState(false); const [t, setT] = useState(a.title);
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {edit ? (
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run("analysis.update", { productId: pid, id: a.id, fields: { title: t } }); if (r.ok) setEdit(false); }}><input aria-label="Title" className="input !text-[20px] font-semibold" value={t} onChange={(e) => setT(e.target.value)} autoFocus /><button className="btn btn-primary" disabled={pending}>Save</button></form>
        ) : <h1 className="text-[24px] font-semibold leading-tight">{a.title} <button className="btn btn-quiet btn-sm align-middle" onClick={() => setEdit(true)} aria-label="Rename">✎</button></h1>}
        <p className="mt-1 text-[13px] text-muted">{initiative ? <>Part of <Link className="underline" href={`/p/${pid}/i/${initiative.id}`}>{initiative.title.slice(0, 60)}</Link></> : "Product-level work, not attached to a topic"}</p>
      </div>
      <div className="flex items-center gap-2"><label className="sr-only" htmlFor="st">Status</label>
        <select id="st" className="input !w-auto" value={a.status} onChange={(e) => run("analysis.update", { productId: pid, id: a.id, fields: { status: e.target.value } })}><option value="draft">Not started</option><option value="in_progress">In progress</option><option value="completed">Done</option></select></div>
      <span className="hidden" aria-hidden>{icon}</span>
    </header>
  );
}
