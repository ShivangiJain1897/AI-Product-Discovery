"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { rpc, useAction } from "@/lib/client";
import { Icon } from "./icon";
import { ErrorText } from "./ui";
import { docToMarkdown, isEmptyValue, type SectionDef, type SectionValue, type TableValue, type TemplateLite } from "@/lib/templates";

type Ref = Record<string, { label: string; href: string }>;
const TOKEN = /\[\[([a-z_]+:[A-Za-z0-9_]+)\]\]/g;

function Rich({ text, refs }: { text: string; refs: Ref }) {
  const out: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null; TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const r = refs[m[1]];
    out.push(r ? <Link key={m.index} href={r.href} title={r.label} className="mx-0.5 inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-px align-baseline text-[11px] font-medium text-accent-strong hover:underline"><Icon name="file" size={10} />{m[1].split(":")[0]}</Link> : null);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

const PROV: Record<string, { label: string; cls: string }> = {
  scaffold: { label: "Starter draft from your records", cls: "bg-warn-soft text-warn" },
  live: { label: "AI draft — review it", cls: "bg-accent-soft text-accent-strong" },
  you: { label: "Edited by you", cls: "bg-sunken text-ink" },
};

function SectionCard({ pid, id, def, value, prov, pending, refs }: { pid: string; id: string; def: SectionDef; value: SectionValue; prov?: string; pending?: number; refs: Ref }) {
  const { run, pending: busy, error } = useAction();
  const empty = isEmptyValue(value);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<SectionValue>(value);
  const start = () => { setDraft(value); setEdit(true); };
  const save = async () => { const r = await run("doc.saveSection", { productId: pid, id, key: def.key, value: draft }); if (r.ok) setEdit(false); };
  const editing = edit;
  const p = prov ? PROV[prov] : null;

  const editor = () => {
    if (def.kind === "text") return <textarea aria-label={def.title} className="input" rows={Math.max(3, String(draft).split("\n").length + 1)} value={String(draft)} onChange={(e) => setDraft(e.target.value)} autoFocus />;
    if (def.kind === "list") return <><textarea aria-label={def.title} className="input" rows={Math.max(4, (draft as string[]).length + 2)} value={(draft as string[]).join("\n")} onChange={(e) => setDraft(e.target.value.split("\n"))} autoFocus /><p className="mt-1 text-[12px] text-muted">One item per line.</p></>;
    const t = draft as TableValue;
    const upd = (r: number, c: number, v: string) => setDraft({ columns: t.columns, rows: t.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
    return (
      <div className="overflow-x-auto">
        <table className="tbl"><thead><tr>{t.columns.map((c, i) => <th key={i}>{c}</th>)}<th /></tr></thead><tbody>
          {t.rows.map((row, r) => <tr key={r}>{t.columns.map((_, c) => <td key={c} className="min-w-[130px]"><textarea aria-label={`${t.columns[c] || "Row"} ${r + 1}`} rows={2} className="input !py-1 text-[13px]" value={row[c] ?? ""} onChange={(e) => upd(r, c, e.target.value)} /></td>)}<td><button className="btn btn-quiet btn-sm" aria-label={`Remove row ${r + 1}`} onClick={() => setDraft({ columns: t.columns, rows: t.rows.filter((_, i) => i !== r) })}>✕</button></td></tr>)}
        </tbody></table>
        <button className="btn btn-sm mt-2" onClick={() => setDraft({ columns: t.columns, rows: [...t.rows, t.columns.map((_, i) => (def.rowLabels && i === 0 ? "" : ""))] })}><Icon name="plus" size={13} />Add a row</button>
      </div>
    );
  };
  const view = () => {
    if (empty) return <p className="text-[13.5px] text-muted">{def.help || "Nothing here yet."}</p>;
    if (typeof value === "string") return <p className="whitespace-pre-line text-[14.5px] leading-relaxed"><Rich text={value} refs={refs} /></p>;
    if (Array.isArray(value)) return <ul className="list-disc space-y-1 pl-5 text-[14.5px] leading-relaxed">{value.map((x, i) => <li key={i}><Rich text={x} refs={refs} /></li>)}</ul>;
    return <div className="overflow-x-auto"><table className="tbl"><thead><tr>{value.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{value.rows.map((r, i) => <tr key={i}>{value.columns.map((_, c) => <td key={c} className="min-w-[110px] whitespace-pre-line"><Rich text={r[c] ?? ""} refs={refs} /></td>)}</tr>)}</tbody></table></div>;
  };
  return (
    <section className="card p-4 fade-in" aria-labelledby={`sec-${def.key}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 id={`sec-${def.key}`} className="text-[15px] font-semibold">{def.title}</h3>
        {p && !empty && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${p.cls}`}>{p.label}</span>}
        <div className="ml-auto flex gap-1.5">{!editing && <button className="btn btn-sm" onClick={start}>{empty ? "Write" : "Edit"}</button>}</div>
      </div>
      {pending && !editing && (
        <div role="status" className="mb-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]">
          <p className="font-medium text-warn">A newer draft (run {pending}) is available. Your edits were kept.</p>
          <div className="mt-1.5 flex gap-2"><button className="btn btn-sm" disabled={busy} onClick={() => run("doc.apply", { productId: pid, id, seq: pending, keys: [def.key] })}>Use the new draft</button><button className="btn btn-sm" disabled={busy} onClick={() => run("doc.keepMine", { productId: pid, id, keys: [def.key] })}>Keep mine</button></div>
        </div>
      )}
      {editing ? (<>{editor()}<ErrorText message={error} /><div className="mt-2 flex gap-2"><button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Save</button><button className="btn btn-sm" onClick={() => setEdit(false)}>Cancel</button></div></>) : view()}
    </section>
  );
}

type IntakeRow = { q: { key: string; label: string; kind: "text" | "choice"; options?: string[]; placeholder?: string; why: string }; answer: string; prefilled: string; needsAsking: boolean };

export function DocWorkbench({ pid, a, tpl, sections, prov, pending, intake, refs, sources, selectedSources, useRecords, counts, last, next, hasInitiative, mode, icon }: {
  pid: string; a: { id: string; title: string; type: string; initiative_id: string | null }; tpl: TemplateLite; sections: Record<string, SectionValue>; prov: Record<string, string>; pending: Record<string, number>;
  intake: IntakeRow[]; refs: Ref; sources: { id: string; title: string }[]; selectedSources: string[]; useRecords: boolean; counts: Record<string, number>;
  last: { seq: number; uncertainties: string[]; notes: string[]; mode: string } | null; next: { key: string; label: string; produces: string }[]; hasInitiative: boolean; mode: "live" | "demo"; icon: string;
}) {
  const { run, pending: busy, error, router } = useAction();
  const [answers, setAnswers] = useState<Record<string, string>>(Object.fromEntries(intake.map((i) => [i.q.key, i.answer])));
  const [changing, setChanging] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const generated = Object.values(sections).some((v) => !isEmptyValue(v));
  const missing = intake.filter((i) => i.needsAsking && !(answers[i.q.key] ?? "").trim());
  const md = () => docToMarkdown(tpl, a.title, sections, (tok) => refs[tok]?.label ?? tok.split(":")[0]);

  async function generate() {
    const send = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim()));
    const r = await run("analysis.run", { productId: pid, id: a.id, answers: send });
    if (r.ok) router.refresh();
  }
  const setAns = (k: string, v: string) => setAnswers((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden">
        <div className="flex items-start gap-3 border-b border-line bg-gradient-to-r from-accent-soft/60 to-surface p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white"><Icon name={icon} size={20} /></span>
          <div><h2 className="text-[16px] font-semibold">{tpl.label}</h2><p className="text-[13.5px] text-muted">{tpl.intro}</p></div>
        </div>
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <div>
            <h3 className="h-section mb-2">1 · What it will use</h3>
            {tpl.usesRecords && (
              <label className="mb-2 flex items-start gap-2 text-[13.5px]"><input type="checkbox" className="mt-1" checked={useRecords} onChange={(e) => run("doc.setRecords", { productId: pid, id: a.id, useRecords: e.target.checked })} />
                <span>Use this topic’s records<span className="block text-[12.5px] text-muted">{counts.findings} findings · {counts.opportunities} opportunities · {counts.concepts} concepts · {counts.assumptions} assumptions · {counts.decisions} decisions</span></span></label>
            )}
            {tpl.usesSources !== "none" && (sources.length === 0 ? <p className="text-[13px] text-muted">No text evidence yet. Add some from the topic page — {tpl.usesSources === "optional" ? "it’s optional." : "it’s needed."}</p> : (
              <fieldset><legend className="text-[13px] font-medium">Sources to draw on {tpl.usesSources === "optional" && <span className="font-normal text-muted">(optional)</span>}</legend>
                <div className="mt-1 max-h-36 overflow-auto rounded-lg border border-line p-2">{sources.map((s) => <label key={s.id} className="flex items-center gap-2 py-0.5 text-[13px]"><input type="checkbox" checked={selectedSources.includes(s.id)} onChange={(e) => run("analysis.setSources", { productId: pid, id: a.id, sourceIds: e.target.checked ? [...selectedSources, s.id] : selectedSources.filter((x) => x !== s.id) })} />{s.title}</label>)}</div></fieldset>
            ))}
            {!tpl.usesRecords && tpl.usesSources === "none" && <p className="text-[13px] text-muted">Built from what you tell it below.</p>}
          </div>
          <div>
            <h3 className="h-section mb-2">2 · A few questions</h3>
            {intake.length === 0 ? <p className="text-[13px] text-muted">Nothing to ask. This is assembled from your records.</p> : (
              <div className="space-y-3">
                {intake.map((i) => {
                  const known = i.prefilled && !changing[i.q.key] && !(answers[i.q.key] ?? "").trim();
                  return (
                    <div key={i.q.key}>
                      <label className="text-[13.5px] font-medium" htmlFor={`q-${i.q.key}`}>{i.q.label}</label>
                      {known ? (
                        <p className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px]"><Icon name="check" size={14} className="text-accent" /><span className="min-w-0 flex-1">Using: <strong>{i.prefilled.length > 110 ? i.prefilled.slice(0, 110) + "…" : i.prefilled}</strong></span><button className="text-[12px] underline" onClick={() => setChanging({ ...changing, [i.q.key]: true })}>Change</button></p>
                      ) : i.q.kind === "choice" ? (
                        <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={i.q.label}>{i.q.options!.map((o) => <button key={o} type="button" role="radio" aria-checked={answers[i.q.key] === o} onClick={() => setAns(i.q.key, answers[i.q.key] === o ? "" : o)} className={`rounded-full border px-3 py-1 text-[13px] ${answers[i.q.key] === o ? "border-accent bg-accent text-white" : "border-line-strong bg-surface hover:bg-sunken"}`}>{o}</button>)}</div>
                      ) : (
                        <div className="mt-1 flex gap-2"><input id={`q-${i.q.key}`} className="input" placeholder={i.q.placeholder ?? ""} value={answers[i.q.key] === "unknown" ? "" : answers[i.q.key] ?? ""} disabled={answers[i.q.key] === "unknown"} onChange={(e) => setAns(i.q.key, e.target.value)} onBlur={() => { if (answers[i.q.key]) void rpc("doc.saveAnswers", { productId: pid, id: a.id, answers: { [i.q.key]: answers[i.q.key] } }); }} />
                          <button type="button" className={`btn btn-sm ${answers[i.q.key] === "unknown" ? "btn-primary" : ""}`} onClick={() => setAns(i.q.key, answers[i.q.key] === "unknown" ? "" : "unknown")}>I don’t know</button></div>
                      )}
                      {i.q.why && <p className="mt-0.5 text-[12px] text-muted">{i.q.why}</p>}
                    </div>
                  );
                })}
                {missing.length > 0 && <p className="text-[12.5px] text-muted">Skip any of these: the draft will just leave that part more open.</p>}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-sunken/50 px-4 py-3">
          <button className="btn btn-primary !px-5 !py-2.5" disabled={busy} onClick={generate}><Icon name="spark" size={15} />{busy ? "Drafting…" : generated ? "Regenerate draft" : "Generate draft"}</button>
          <p className="min-w-0 flex-1 text-[12.5px] text-muted">{mode === "live" ? "A live model drafts this; every reference is checked against your records." : "Demo mode: builds a starter draft from your words and records. It adds no outside facts."}{generated && " Sections you edited are never overwritten."}</p>
          <ErrorText message={error} />
        </div>
      </section>

      {generated || Object.keys(pending).length ? (
        <div className="space-y-4" aria-label="Document">
          {tpl.sections.map((s) => <SectionCard key={s.key + JSON.stringify(sections[s.key]).length + (pending[s.key] ?? "")} pid={pid} id={a.id} def={s} value={sections[s.key]} prov={prov[s.key]} pending={pending[s.key]} refs={refs} />)}
        </div>
      ) : <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center"><p className="text-[15px] font-semibold">No draft yet</p><p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">Answer what you like above, then generate a first draft. Every section stays editable, and you can regenerate at any time.</p></div>}

      {generated && (
        <aside className="grid gap-4 md:grid-cols-2 no-print">
          <section className="card p-4"><h3 className="mb-2 text-[15px] font-semibold">Export</h3><div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={async () => { await navigator.clipboard.writeText(md()); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? "Copied ✓" : "Copy as Markdown"}</button>
            <button className="btn btn-sm" onClick={() => { const b = new Blob([md()], { type: "text/markdown" }); const u = URL.createObjectURL(b); const l = document.createElement("a"); l.href = u; l.download = `${a.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`; l.click(); URL.revokeObjectURL(u); }}>Download .md</button>
            <button className="btn btn-sm" onClick={() => window.print()}>Print / PDF</button></div></section>
          {last && (last.uncertainties.length > 0 || last.notes.length > 0) && <section className="card p-4"><h3 className="mb-2 text-[15px] font-semibold">Limitations of this draft</h3><ul className="list-disc space-y-1 pl-5 text-[13px]">{[...last.uncertainties, ...last.notes].map((u) => <li key={u}>{u}</li>)}</ul></section>}
        </aside>
      )}
      {generated && hasInitiative && next.length > 0 && (
        <section className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent-soft/70 to-surface p-4 no-print" aria-labelledby="nx-h">
          <h3 id="nx-h" className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Icon name="arrow" size={16} className="text-accent" />What could come next</h3>
          <ul className="grid gap-2 md:grid-cols-3">{next.map((n) => <li key={n.key}><button className="tile w-full !p-3" disabled={busy} onClick={async () => { const r = await run<{ created: string[] }>("topic.addWork", { productId: pid, initiativeId: a.initiative_id, items: [n.key] }, { refresh: false }); if (r.ok && r.data.created[0]) router.push(`/p/${pid}/analyses/${r.data.created[0]}`); else if (r.ok) router.push(`/p/${pid}/i/${a.initiative_id}`); }}><span className="block text-[13.5px] font-semibold">{n.label}</span><span className="block text-[12px] text-muted">{n.produces}</span></button></li>)}</ul>
        </section>
      )}
    </div>
  );
}
