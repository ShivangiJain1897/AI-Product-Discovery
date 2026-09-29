"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/lib/client";
import { CATALOG_BY_KEY, TOPIC_TYPES, type Knowledge, type TopicType } from "@/lib/catalog";
import { CatalogPicker } from "./catalog-picker";
import { Icon } from "./icon";
import { ErrorText, Modal } from "./ui";

export function TypeCards({ value, onChange }: { value: TopicType; onChange: (t: TopicType) => void }) {
  return (
    <div role="radiogroup" aria-label="What are you working on?" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {(Object.keys(TOPIC_TYPES) as TopicType[]).map((t) => {
        const on = value === t;
        return (
          <button key={t} type="button" role="radio" aria-checked={on} data-on={on} className="tile !p-3" onClick={() => onChange(t)}>
            <span className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${on ? "bg-accent text-white" : "bg-sunken text-accent-strong"}`}><Icon name={TOPIC_TYPES[t].icon} size={17} /></span>
            <span className="block text-[14px] font-semibold">{TOPIC_TYPES[t].label}</span>
            <span className="block text-[12px] leading-snug text-muted">{TOPIC_TYPES[t].blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  const items = ["Describe", "Choose what to do", "Your plan"];
  return (
    <ol className="mb-6 flex items-center gap-2 text-[13px]" aria-label="Progress">
      {items.map((l, i) => {
        const n = i + 1, done = n < step, cur = n === step;
        return (
          <li key={l} className="flex items-center gap-2" aria-current={cur ? "step" : undefined}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold ${done ? "bg-accent text-white" : cur ? "border-2 border-accent text-accent-strong" : "border border-line-strong text-muted"}`}>{done ? "✓" : n}</span>
            <span className={cur ? "font-medium" : "text-muted"}>{l}</span>{i < items.length - 1 && <span aria-hidden className="mx-1 h-px w-8 bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}

export function NewTopic({ pid, initialType, initialText, knowledge }: { pid: string; initialType: TopicType; initialText: string; knowledge: Knowledge }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [type, setType] = useState<TopicType>(initialType);
  const [text, setText] = useState(initialText);
  const [bg, setBg] = useState(""); const [showBg, setShowBg] = useState(false);
  const [step, setStep] = useState<1 | 2>(initialText.trim() ? 2 : 1);
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function create(items: string[]) {
    const r = await run<{ id: string }>("topic.create", { productId: pid, type, text, background: bg, items }, { refresh: false });
    if (r.ok) router.push(`/p/${pid}/i/${r.data.id}?welcome=1`);
  }
  if (step === 1) return (
    <div className="mx-auto max-w-3xl fade-in">
      <Steps step={1} />
      <h1 className="font-serif text-[30px] font-semibold leading-tight">What are you working on?</h1>
      <p className="mb-5 mt-1 text-[14.5px] text-muted">A sentence is enough. You’ll choose what to do with it next, and you can add more later.</p>
      <TypeCards value={type} onChange={setType} />
      <label htmlFor="nt-text" className="label mt-5">Describe it</label>
      <textarea id="nt-text" autoFocus rows={4} className="input !text-[16px]" placeholder={TOPIC_TYPES[type].placeholder} value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} />
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[12.5px] text-muted"><span>Try:</span>{TOPIC_TYPES[type].examples.map((x) => <button key={x} type="button" className="rounded-full border border-line px-2 py-0.5 hover:bg-sunken" onClick={() => setText(x)}>{x}</button>)}</div>
      {!showBg ? <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setShowBg(true)}><Icon name="plus" size={14} />Paste background material (optional)</button> : (
        <div className="mt-3"><label htmlFor="nt-bg" className="label">Background — a brief, request, notes… (kept as evidence, exactly as pasted)</label><textarea id="nt-bg" rows={5} className="input font-mono text-[13px]" value={bg} onChange={(e) => setBg(e.target.value)} /></div>
      )}
      <ErrorText message={err} />
      <div className="mt-6 flex justify-end"><button className="btn btn-primary !px-5 !py-2.5" onClick={() => (text.trim() ? setStep(2) : setErr("Say a little about what you’re working on — one sentence is fine."))}>Continue<Icon name="arrow" size={15} /></button></div>
    </div>
  );
  return (
    <div className="mx-auto max-w-5xl fade-in pb-28">
      <Steps step={2} />
      <div className="card mb-6 flex items-start gap-3 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong"><Icon name={TOPIC_TYPES[type].icon} size={18} /></span>
        <div className="min-w-0 flex-1"><p className="h-section">{TOPIC_TYPES[type].label}</p><p className="line-clamp-3 text-[15px] font-medium">{text}</p></div>
        <button className="btn btn-sm" onClick={() => setStep(1)}>Edit</button>
      </div>
      <h1 className="font-serif text-[28px] font-semibold leading-tight">What do you want to do?</h1>
      <p className="mb-5 mt-1 max-w-2xl text-[14.5px] text-muted">Pick as many as you like. Nothing is locked: you can start any of them now, skip around, and come back to add more when you know more.</p>
      <CatalogPicker knowledge={knowledge} topicType={type} selected={sel} onChange={setSel} />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-[13.5px]">
            {sel.length === 0 ? <span className="text-muted">Nothing selected yet</span> : <span className="flex flex-wrap items-center gap-1.5"><strong>{sel.length} selected:</strong>{sel.map((k) => <span key={k} className="badge badge-accent">{CATALOG_BY_KEY[k].label}</span>)}</span>}
          </div>
          <ErrorText message={error} />
          <button className="btn" disabled={pending} onClick={() => create([])}>Decide later</button>
          <button className="btn btn-primary !px-5 !py-2.5" disabled={pending || sel.length === 0} onClick={() => create(sel)}>{pending ? "Setting up…" : `Plan my work${sel.length ? ` (${sel.length})` : ""}`}<Icon name="arrow" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

/** "Add more work" on an existing topic. */
export function AddWork({ pid, iid, topicType, knowledge, label = "Add more work", primary }: { pid: string; iid: string; topicType: TopicType; knowledge: Knowledge; label?: string; primary?: boolean }) {
  const [open, setOpen] = useState(false); const [sel, setSel] = useState<string[]>([]);
  const { run, pending, error, router } = useAction();
  return (<>
    <button className={`btn ${primary ? "btn-primary" : ""}`} onClick={() => setOpen(true)}><Icon name="plus" size={15} />{label}</button>
    <Modal open={open} onClose={() => setOpen(false)} title="What do you want to do next?" wide>
      <CatalogPicker knowledge={knowledge} topicType={topicType} selected={sel} onChange={setSel} />
      <ErrorText message={error} />
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-2 flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary" disabled={pending || !sel.length} onClick={async () => { const r = await run("topic.addWork", { productId: pid, initiativeId: iid, items: sel }, { refresh: false }); if (r.ok) { setOpen(false); setSel([]); router.refresh(); } }}>Add to plan{sel.length ? ` (${sel.length})` : ""}</button>
      </div>
    </Modal>
  </>);
}
