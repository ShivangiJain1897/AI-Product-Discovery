"use client";
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { Icon } from "./icon";
import { ErrorText } from "./ui";
import { TOPIC_TYPES, type TopicType } from "@/lib/catalog";

export function TopicText({ pid, iid, type, text }: { pid: string; iid: string; type: string; text: string }) {
  const { run, pending, error } = useAction();
  const [edit, setEdit] = useState(false); const [v, setV] = useState(text); const [t, setT] = useState(type);
  const T = TOPIC_TYPES[(type in TOPIC_TYPES ? type : "question") as TopicType];
  if (!edit) return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"><Icon name={T.icon} size={22} /></span>
      <div className="min-w-0 flex-1"><p className="h-section">{T.label}</p><p className="whitespace-pre-line text-[18px] font-medium leading-snug">{text}</p></div>
      <button className="btn btn-sm" onClick={() => setEdit(true)}>Edit</button>
    </div>
  );
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const r = await run("initiative.update", { productId: pid, id: iid, fields: { topic_text: v, topic_type: t, question: v.split("\n")[0].slice(0, 220) } }); if (r.ok) setEdit(false); }}>
      <div className="mb-2 flex flex-wrap gap-2">{(Object.keys(TOPIC_TYPES) as TopicType[]).map((k) => <button key={k} type="button" role="radio" aria-checked={t === k} onClick={() => setT(k)} className={`rounded-full border px-3 py-1 text-[13px] ${t === k ? "border-accent bg-accent text-white" : "border-line-strong bg-surface"}`}>{TOPIC_TYPES[k].label}</button>)}</div>
      <label className="sr-only" htmlFor="tt">Describe it</label><textarea id="tt" className="input" rows={3} value={v} onChange={(e) => setV(e.target.value)} required />
      <ErrorText message={error} />
      <div className="mt-2 flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button><button type="button" className="btn btn-sm" onClick={() => setEdit(false)}>Cancel</button></div>
    </form>
  );
}

type S = { id: string; label: string; why: string; kind: "open" | "add"; href?: string; key?: string };
export function WhatNow({ pid, iid, items }: { pid: string; iid: string; items: S[] }) {
  const { run, pending, error, router } = useAction();
  if (!items.length) return null;
  return (
    <section aria-labelledby="wn-h" className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-soft/80 to-surface p-4 shadow-[var(--shadow-card)]">
      <h2 id="wn-h" className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Icon name="spark" size={17} className="text-accent" />What now?</h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((s) => (
          <li key={s.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface/90 p-3">
            <div className="min-w-0 flex-1"><p className="text-[14px] font-medium leading-snug">{s.label}</p><p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.why}</p></div>
            {s.kind === "open" ? <Link href={s.href!} className="btn btn-sm shrink-0">Open<Icon name="arrow" size={13} /></Link>
              : <button className="btn btn-sm btn-primary shrink-0" disabled={pending} onClick={async () => { const r = await run<{ created: string[] }>("topic.addWork", { productId: pid, initiativeId: iid, items: [s.key] }, { refresh: false }); if (r.ok && r.data.created[0]) router.push(`/p/${pid}/analyses/${r.data.created[0]}`); else router.refresh(); }}>Add</button>}
          </li>
        ))}
      </ul>
      <ErrorText message={error} />
    </section>
  );
}
