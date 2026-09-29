"use client";
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { AssistPanel } from "./assist";
import { Empty, ErrorText, Field, Modal } from "./ui";

type M = { id: string; name: string; kind: string; nodes: number; baseline_map_id: string | null; updated_at: string };

export function ProcessTab({ pid, iid, maps, enabled, sources }: { pid: string; iid: string; maps: M[]; enabled: boolean; sources: { id: string; title: string }[] }) {
  const { run, pending, error, router } = useAction();
  const [name, setName] = useState(""); const [open, setOpen] = useState(false);
  const [future, setFuture] = useState<{ id: string; name: string } | null>(null); const [fname, setFname] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  if (!enabled) return (
    <Empty title="Process mapping is optional" action={<button className="btn btn-primary" disabled={pending} onClick={() => run("initiative.processEnabled", { productId: pid, id: iid, enabled: true })}>Add a process lens to this discovery</button>}>
      Use it when understanding how work actually happens is part of the question: activities, owners, decisions and handoffs. Interview-based discovery doesn’t need it.
    </Empty>
  );
  const current = maps.filter((m) => m.kind === "current"), futures = maps.filter((m) => m.kind === "future");
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[15px] font-semibold">How work happens today</h3><button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Sketch a current-state map</button></div>
          {current.length === 0 ? <Empty title="No current-state map yet">Sketch one by hand, or draft one from a process document or interview notes on the right. Drafted steps are labelled supported or inferred.</Empty> : (
            <ul className="space-y-2">{current.map((m) => (
              <li key={m.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div><Link className="font-medium hover:underline" href={`/p/${pid}/maps/${m.id}`}>{m.name}</Link><p className="text-[12.5px] text-muted">{m.nodes} steps</p></div>
                <div className="flex gap-1.5"><Link className="btn btn-sm" href={`/p/${pid}/maps/${m.id}`}>Open map</Link><button className="btn btn-sm" onClick={() => { setFuture({ id: m.id, name: m.name }); setFname(""); }}>Propose a future state</button></div></li>))}</ul>)}
        </section>
        {futures.length > 0 && <section><h3 className="mb-2 text-[15px] font-semibold">Proposed future states</h3>
          <ul className="space-y-2">{futures.map((m) => <li key={m.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div><Link className="font-medium hover:underline" href={`/p/${pid}/maps/${m.id}`}>{m.name}</Link><p className="text-[12.5px] text-muted">{m.nodes} steps · compared against its frozen baseline</p></div><Link className="btn btn-sm" href={`/p/${pid}/maps/${m.id}?view=compare`}>Compare with current</Link></li>)}</ul></section>}
      </div>
      <div className="space-y-3">
        <section className="card p-4"><h3 className="text-[15px] font-semibold">Draft from evidence</h3><p className="mb-2 text-[12.5px] text-muted">Choose the sources to read. Only these are used.</p>
          {sources.length === 0 ? <p className="text-[13px] text-muted">Add a process document or interview notes in Evidence first.</p> : <ul className="mb-2 space-y-1 text-[13px]">{sources.map((s) => <li key={s.id}><label className="flex items-center gap-2"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />{s.title}</label></li>)}</ul>}
          <AssistPanel pid={pid} title="Draft a process map" actions={[{ kind: "process_draft", label: "Draft a process from these sources", hint: `Evidence scope: ${sel.length} selected source(s).`, scope: { sourceIds: sel, initiativeId: iid }, disabled: sel.length ? undefined : "Select at least one source." }]} />
        </section>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Sketch a current-state map">
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("map.create", { productId: pid, initiativeId: iid, name }, { refresh: false }); if (r.ok) router.push(`/p/${pid}/maps/${r.data.id}`); }}>
          <Field label="Name" htmlFor="mn"><input id="mn" autoFocus className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Current onboarding process" /></Field>
          <ErrorText message={error} /><div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Create map</button></div>
        </form>
      </Modal>
      <Modal open={!!future} onClose={() => setFuture(null)} title="Propose a future state">
        <p className="mb-3 text-[13.5px] text-muted">This clones “{future?.name}” into a new proposal. The original map stays untouched, and the baseline is frozen for comparison.</p>
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("map.cloneFuture", { productId: pid, mapId: future!.id, name: fname }, { refresh: false }); if (r.ok) router.push(`/p/${pid}/maps/${r.data.id}`); }}>
          <Field label="Name the proposal" htmlFor="fn"><input id="fn" autoFocus className="input" required value={fname} onChange={(e) => setFname(e.target.value)} placeholder="e.g. Checklist and pre-check" /></Field>
          <ErrorText message={error} /><div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setFuture(null)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Create proposal</button></div>
        </form>
      </Modal>
    </div>
  );
}
