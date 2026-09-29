"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction } from "@/lib/client";
import { ErrorText, Modal, Field } from "./ui";

const EXAMPLES = [
  "Why does client onboarding take so long?",
  "Why do new users abandon product setup?",
  "Which parts of our service process create avoidable work?",
  "Is this customer problem important enough to address?",
  "Where would AI meaningfully improve an employee workflow?",
  "Which solution should we test before committing engineering capacity?",
];

type P = { id: string; name: string };

export function StartBox({ products }: { products: P[] }) {
  const { run, pending, error, setError, router } = useAction();
  const [q, setQ] = useState("");
  const [pid, setPid] = useState(products[0]?.id ?? "__new");
  const [newName, setNewName] = useState("");
  const [ex, setEx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setInterval(() => setEx((i) => (i + 1) % EXAMPLES.length), 4500); return () => clearInterval(t); }, []);

  async function start(mode: "question" | "evidence" | "process") {
    setError(null);
    if (mode === "question" && !q.trim()) { setError("Type the question you want to answer, or pick an example below."); ref.current?.focus(); return; }
    let productId = pid;
    if (pid === "__new") {
      if (!newName.trim()) { setError("Name the product this is about. A name is all you need."); return; }
      const r = await run<{ id: string }>("product.create", { name: newName }, { refresh: false });
      if (!r.ok) return;
      productId = r.data.id;
    }
    router.push(`/p/${productId}/new?mode=${mode}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
  }

  return (
    <section aria-labelledby="start-h" className="mx-auto max-w-3xl text-center">
      <h1 id="start-h" className="font-serif text-[34px] font-semibold leading-tight tracking-tight">What are you trying to understand?</h1>
      <p className="mx-auto mt-2 max-w-xl text-[15px] text-muted">Start with a question. Clarity keeps the evidence, the reasoning and the decision together, so you can explain <em>why</em>.</p>
      <div className="mt-6 text-left">
        <label htmlFor="start-q" className="sr-only">Discovery question</label>
        <textarea id="start-q" ref={ref} rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder={EXAMPLES[ex]}
          className="input !rounded-xl !px-4 !py-3 !text-[17px] shadow-sm" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start("question"); } }} />
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          <span>Try:</span>
          {EXAMPLES.slice(0, 3).map((e) => <button key={e} type="button" className="rounded-full border border-line px-2 py-0.5 hover:bg-sunken" onClick={() => { setQ(e); ref.current?.focus(); }}>{e}</button>)}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="label" htmlFor="start-p">In product</label>
            <select id="start-p" className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new">＋ A new product…</option>
            </select>
          </div>
          {pid === "__new" && (
            <div className="min-w-[200px] flex-1">
              <label className="label" htmlFor="start-n">Product name</label>
              <input id="start-n" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Client Portal" />
            </div>
          )}
        </div>
        <ErrorText message={error} />
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {([
            ["question", "Start with a question", "You know what you want to find out."],
            ["evidence", "Start with evidence", "You have notes, transcripts or data to make sense of."],
            ["process", "Start with a process", "You need to understand how work actually happens."],
          ] as const).map(([m, t, d]) => (
            <button key={m} type="button" disabled={pending} onClick={() => start(m)} className="card px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60">
              <span className="block text-[14.5px] font-semibold text-accent-strong">{t}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{d}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LoadDemoButton({ primary }: { primary?: boolean }) {
  const { run, pending, error } = useAction();
  return (
    <span>
      <button type="button" className={`btn ${primary ? "btn-primary" : ""}`} disabled={pending} onClick={() => run("demo.load", {})}>{pending ? "Loading examples…" : "Load the two demo examples"}</button>
      <ErrorText message={error} />
    </span>
  );
}

type Card = {
  id: string; name: string; description: string; lifecycle: string; is_demo: number; archived_at: string | null;
  activeInitiatives: { id: string; title: string }[]; lastActivity?: { summary: string; ago: string } | null;
  attentionCount: number; attentionLines: string[]; continueHref: string; continueLabel: string;
};

export function ProductGrid({ cards }: { cards: Card[] }) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const { run } = useAction();
  const sp = useSearchParams();
  const [adding, setAdding] = useState(sp.get("new") === "product");
  const shown = useMemo(() => cards.filter((c) => (showArchived ? true : !c.archived_at) && (c.name + c.description).toLowerCase().includes(q.toLowerCase())), [cards, q, showArchived]);
  return (
    <section aria-labelledby="products-h" className="mx-auto mt-12 max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="products-h" className="text-[19px] font-semibold">My Products</h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="pq">Search products</label>
          <input id="pq" type="search" className="input !w-52 !py-1" placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
          {cards.some((c) => c.archived_at) && <label className="flex items-center gap-1.5 text-[13px] text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived</label>}
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>Add a product</button>
        </div>
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        {shown.map((c) => (
          <article key={c.id} className={`card flex flex-col p-4 ${c.archived_at ? "opacity-70" : ""}`} aria-label={c.name}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[16px] font-semibold"><Link href={`/p/${c.id}`} className="hover:underline">{c.name}</Link></h3>
                {c.description && <p className="mt-0.5 line-clamp-2 text-[13.5px] text-muted">{c.description}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="badge capitalize">{c.lifecycle}</span>
                {c.is_demo ? <span className="badge badge-warn" title="Synthetic data for illustration">Demo</span> : null}
                {c.archived_at ? <span className="badge">Archived</span> : null}
              </div>
            </div>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-muted">Active discovery</dt><dd className="min-w-0">{c.activeInitiatives.length ? c.activeInitiatives.slice(0, 2).map((i) => i.title).join(" · ") + (c.activeInitiatives.length > 2 ? ` · +${c.activeInitiatives.length - 2}` : "") : <span className="text-muted">None active</span>}</dd></div>
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-muted">Latest activity</dt><dd className="min-w-0 truncate">{c.lastActivity ? `${c.lastActivity.summary} · ${c.lastActivity.ago}` : <span className="text-muted">Nothing yet</span>}</dd></div>
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-muted">Needs attention</dt><dd className="min-w-0">{c.attentionCount ? <span className="text-warn">{c.attentionLines.join(" · ")}</span> : <span className="text-muted">Nothing flagged</span>}</dd></div>
            </dl>
            <div className="mt-4 flex items-center gap-2">
              {c.archived_at ? <button className="btn btn-sm" onClick={() => run("product.restore", { id: c.id })}>Restore</button> : (
                <>
                  <Link href={c.continueHref} className="btn btn-primary btn-sm">Continue working</Link>
                  <span className="truncate text-[12px] text-muted">{c.continueLabel}</span>
                  <button className="btn btn-quiet btn-sm ml-auto" onClick={() => { if (confirm(`Archive “${c.name}”? Nothing is deleted; you can restore it later.`)) run("product.archive", { id: c.id }); }}>Archive</button>
                </>
              )}
            </div>
          </article>
        ))}
        {shown.length === 0 && <p className="col-span-full py-8 text-center text-muted">No products match “{q}”.</p>}
      </div>
      <AddProduct open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}

export function AddProduct({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, pending, error, router } = useAction();
  const [name, setName] = useState(""); const [desc, setDesc] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Add a product">
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("product.create", { name, description: desc }, { refresh: false }); if (r.ok) { onClose(); router.push(`/p/${r.data.id}`); } }}>
        <Field label="Product name" htmlFor="np-n" hint="Only the name is required. You can add context as you go."><input id="np-n" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Short description (optional)" htmlFor="np-d"><input id="np-d" className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <ErrorText message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>Add product</button></div>
      </form>
    </Modal>
  );
}
