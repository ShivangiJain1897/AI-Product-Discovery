"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";

import { CATALOG } from "@/lib/catalog";
const LEGACY: [string, string, string][] = [
  ["research_synthesis", "Research synthesis", "Find themes, needs and contradictions across research."],
  ["problem_analysis", "Problem analysis", "Clarify a problem, its context and possible contributing causes."],
  ["event_log", "Event-log analysis", "Examine observed variants, durations and repeated activities in a CSV."],
  ["process_mapping", "Process mapping", "Describe activities, actors, decisions and handoffs."],
  ["opportunity_analysis", "Opportunity analysis", "Compare problems worth addressing."],
  ["solution_comparison", "Solution comparison", "Evaluate alternative approaches and their trade-offs."],
  ["assumption_analysis", "Assumption analysis", "Find consequential, weakly supported assumptions."],
  ["future_state", "Future-state comparison", "Compare a proposed process with its baseline."],
  ["experiment_analysis", "Experiment analysis", "Interpret results against a hypothesis and criterion."],
  ["custom", "Custom analysis", "Define your own question and desired output."],
];
const TYPES: [string, string, string][] = [...CATALOG.map((c) => [c.key, c.label, c.produces] as [string, string, string]), ...LEGACY.filter(([k]) => !CATALOG.some((c) => c.key === k))];

export function NewAnalysis({ pid, initiatives, sources, csvSources, defaultInitiative, from, label = "New output" }: { pid: string; initiatives: { id: string; title: string }[]; sources: { id: string; title: string }[]; csvSources: { id: string; title: string }[]; defaultInitiative?: string; from?: { type: string; id: string; label: string } | null; label?: string }) {
  const sp = useSearchParams(); const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(sp.get("new") === "1");
  useEffect(() => { if (sp.get("new") === "1") setOpen(true); }, [sp]);
  const { run, pending, error, setError } = useAction();
  const [type, setType] = useState("research_synthesis");
  const [title, setTitle] = useState(""); const [question, setQuestion] = useState("");
  const [ini, setIni] = useState(defaultInitiative ?? "");
  const [sel, setSel] = useState<string[]>([]);
  const [csv, setCsv] = useState(csvSources[0]?.id ?? "");
  const needs = ["research_synthesis", "voc", "process_mapping", "custom", "market_analysis", "competitor_scan", "rca", "journey_map"].includes(type);
  const close = () => { setOpen(false); setError(null); if (sp.get("new")) router.replace(path); };
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (type === "event_log") { if (!csv) { setError("Add a CSV event log to this product’s evidence first (Knowledge → Add evidence, kind “Operational event log”)."); return; } router.push(`/p/${pid}/eventlog/${csv}${ini ? `?i=${ini}` : ""}`); return; }
    const r = await run<{ id: string }>("analysis.create", { productId: pid, type, title: title || TYPES.find((t) => t[0] === type)![1], question, initiativeId: ini || undefined, sourceIds: sel, scope: needs && sel.length === 0 && ini ? "initiative" : "selected", from: from ? { type: from.type, id: from.id } : undefined }, { refresh: false });
    if (r.ok) { close(); router.push(`/p/${pid}/analyses/${r.data.id}`); }
  }
  return (<>
    <button className="btn btn-primary" onClick={() => setOpen(true)}>{label}</button>
    <Modal open={open} onClose={close} title="Start something new" wide>
      <form onSubmit={go}>
        {from && <p className="mb-3 rounded bg-accent-soft px-3 py-2 text-[13px]">Starting from {from.type}: “{from.label}”. The link is kept.</p>}
        <fieldset className="mb-3"><legend className="label">What kind of analysis?</legend>
          <div className="grid gap-2 sm:grid-cols-2">{TYPES.map(([k, l, d]) => <label key={k} className={`card cursor-pointer px-3 py-2 ${type === k ? "border-accent bg-accent-soft/50" : ""}`}><input type="radio" name="atype" className="sr-only" checked={type === k} onChange={() => setType(k)} /><span className="block text-[13.5px] font-medium">{l}</span><span className="block text-[12px] text-muted">{d}</span></label>)}</div></fieldset>
        <div className="grid gap-x-3 md:grid-cols-2">
          <Field label="Title" htmlFor="na-t"><input id="na-t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TYPES.find((t) => t[0] === type)![1]} /></Field>
          <Field label="Belongs to discovery (optional)" htmlFor="na-i" hint="You can start without one and attach it later."><select id="na-i" className="input" value={ini} onChange={(e) => setIni(e.target.value)}><option value="">None — a product-level analysis</option>{initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field>
        </div>
        <Field label="Question being investigated" htmlFor="na-q"><textarea id="na-q" className="input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
        {type === "event_log" && <Field label="Event-log CSV" htmlFor="na-c">{csvSources.length ? <select id="na-c" className="input" value={csv} onChange={(e) => setCsv(e.target.value)}>{csvSources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select> : <p className="text-[13px] text-warn">No CSV evidence in this product yet. Add one from Knowledge → Add evidence.</p>}</Field>}
        {needs && sources.length > 0 && <fieldset className="mb-3"><legend className="label">Evidence to analyse — selected sources only, by default</legend><div className="max-h-40 overflow-auto rounded border border-line p-2">{sources.map((s) => <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />{s.title}</label>)}</div><p className="mt-1 text-[12px] text-muted">You can broaden the scope later. Evidence is reused, never copied.</p></fieldset>}
        <ErrorText message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={pending}>{type === "event_log" ? "Continue to import" : "Create analysis"}</button></div>
      </form>
    </Modal>
  </>);
}
