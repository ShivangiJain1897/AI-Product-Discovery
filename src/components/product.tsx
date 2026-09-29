"use client";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText, Field } from "./ui";

export function ProductContext({ pid, p }: { pid: string; p: Record<string, string> }) {
  const { run, pending, error } = useAction();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState({ name: p.name, description: p.description, lifecycle: p.lifecycle, target_users: p.target_users, objectives: p.objectives, context: p.context });
  const blank = !p.description && !p.target_users && !p.objectives && !p.context;
  const rows: [string, string, string][] = [["description", "What it is", "One or two sentences"], ["target_users", "Target users", "Who is it for?"], ["objectives", "Business objectives", "What is it meant to achieve?"], ["context", "Relevant context", "Constraints, history, regulation, anything future-you will want to know"]];
  return (
    <section className="card p-4" aria-labelledby="pc-h">
      <div className="mb-2 flex items-center justify-between gap-2"><h2 id="pc-h" className="text-[15px] font-semibold">Product context</h2>{!edit && <button className="btn btn-sm" onClick={() => setEdit(true)}>{blank ? "Add context" : "Edit"}</button>}</div>
      {!edit ? (blank ? <p className="text-[13.5px] text-muted">Only the name is required. Add context whenever it helps — it is reused every time you return, so you never re-enter it.</p> :
        <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">{rows.map(([k, l]) => <div key={k}><dt className="h-section">{l}</dt><dd className="text-[13.5px]">{p[k] || <span className="text-muted">Not added yet</span>}</dd></div>)}<div><dt className="h-section">Lifecycle stage</dt><dd className="text-[13.5px] capitalize">{p.lifecycle}</dd></div></dl>) : (
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run("product.update", { id: pid, ...v }); if (r.ok) setEdit(false); }}>
          <div className="grid gap-x-3 md:grid-cols-2"><Field label="Name" htmlFor="pn"><input id="pn" className="input" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Lifecycle stage" htmlFor="pl"><select id="pl" className="input" value={v.lifecycle} onChange={(e) => setV({ ...v, lifecycle: e.target.value })}>{["exploring", "building", "live", "retiring"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></Field></div>
          {rows.map(([k, l, ph]) => <Field key={k} label={l} htmlFor={`p-${k}`}><textarea id={`p-${k}`} rows={2} className="input" placeholder={ph} value={(v as any)[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}
          <ErrorText message={error} /><div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button><button type="button" className="btn btn-sm" onClick={() => setEdit(false)}>Cancel</button></div>
        </form>)}
    </section>
  );
}

export function RestoreButton({ pid, type, id }: { pid: string; type: string; id: string }) {
  const { run, pending } = useAction();
  return <button className="btn btn-sm" disabled={pending} onClick={() => run("trash.restore", { productId: pid, type, id })}>Restore</button>;
}

/** Click-to-rename product title. Auto-named products get a gentle nudge. */
export function ProductTitle({ pid, name, badges }: { pid: string; name: string; badges?: React.ReactNode }) {
  const { run, pending, error } = useAction();
  const [edit, setEdit] = useState(false); const [v, setV] = useState(name);
  const auto = /^Untitled product( \d+)?$/.test(name);
  return (
    <div>
      {edit ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await run("product.update", { id: pid, name: v }); if (r.ok) setEdit(false); }}>
          <label className="sr-only" htmlFor="pt">Product name</label>
          <input id="pt" autoFocus className="input !w-72 !text-[20px] font-semibold" value={v} onChange={(e) => setV(e.target.value)} required />
          <button className="btn btn-primary" disabled={pending}>Save</button><button type="button" className="btn" onClick={() => { setEdit(false); setV(name); }}>Cancel</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold leading-tight">{name}</h1>
          <button className="btn btn-quiet btn-sm" onClick={() => setEdit(true)} aria-label="Rename product">✎ Rename</button>
          {badges}
        </div>
      )}
      {auto && !edit && <p className="mt-1 text-[12.5px] text-muted">This product was named automatically. <button className="underline" onClick={() => setEdit(true)}>Give it a real name</button> whenever you like.</p>}
      <ErrorText message={error} />
    </div>
  );
}
