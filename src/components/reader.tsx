"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";
import { AssistPanel } from "./assist";
import { SOURCE_TYPES } from "./records";

type Ex = { id: string; text: string; start_offset: number | null; end_offset: number | null; status: string; source_version: number; row_ref: any; findingLinks: { findingId: string; relation: string; statement: string }[] };
type Obs = { id: string; text: string; kind: string; excerpt_id: string | null };
type Src = { id: string; title: string; content: string; content_kind: string; version: number; source_type: string; source_date: string | null; participant: string; segment: string; tags: string[]; synthetic: number; imported_at: string; filename: string | null };

function segments(content: string, ex: Ex[], active?: string | null) {
  const cuts = new Set<number>([0, content.length]);
  const live = ex.filter((e) => e.start_offset != null && e.end_offset != null && e.status !== "broken");
  live.forEach((e) => { cuts.add(e.start_offset!); cuts.add(e.end_offset!); });
  const pts = [...cuts].sort((a, b) => a - b);
  const out: { start: number; text: string; ids: string[] }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    if (e <= s) continue;
    out.push({ start: s, text: content.slice(s, e), ids: live.filter((x) => x.start_offset! <= s && x.end_offset! >= e).map((x) => x.id) });
  }
  void active;
  return out;
}

export function Reader({ pid, iid, src, excerpts, observations, findings, versions, dependents, activeExcerpt, siblings, csv }: {
  pid: string; iid?: string; src: Src; excerpts: Ex[]; observations: Obs[]; findings: { id: string; statement: string }[]; versions: any[]; dependents: { findings: number; decisions: number }; activeExcerpt?: string; siblings: { id: string; title: string }[];
  csv?: { headers: string[]; rows: Record<string, string>[]; total: number };
}) {
  const { run, pending, error, setError, router } = useAction();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number; text: string } | null>(null);
  const [rows, setRows] = useState<number[]>([]);
  const [mode, setMode] = useState<null | "obs" | "link" | "new">(null);
  const [obsText, setObsText] = useState(""); const [obsKind, setObsKind] = useState("pain");
  const [findingId, setFindingId] = useState(""); const [rel, setRel] = useState("supports");
  const [nf, setNf] = useState("");
  const [editing, setEditing] = useState<null | "meta" | "content">(null);
  const [meta, setMeta] = useState({ title: src.title, sourceType: src.source_type, date: src.source_date ?? "", participant: src.participant, segment: src.segment, tags: src.tags.join(", ") });
  const [content, setContent] = useState(src.content); const [note, setNote] = useState("");
  const segs = useMemo(() => (src.content_kind === "text" ? segments(src.content, excerpts) : []), [src, excerpts]);

  useEffect(() => { if (activeExcerpt) document.getElementById(`ex-${activeExcerpt}`)?.scrollIntoView({ block: "center" }); }, [activeExcerpt]);

  const capture = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !bodyRef.current) return;
    const r = s.getRangeAt(0);
    const nodeStart = (n: Node, off: number) => { const el = (n.nodeType === 3 ? n.parentElement : (n as Element))?.closest("[data-start]") as HTMLElement | null; return el ? +el.dataset.start! + off : null; };
    if (!bodyRef.current.contains(r.startContainer) || !bodyRef.current.contains(r.endContainer)) return;
    let a = nodeStart(r.startContainer, r.startOffset), b = nodeStart(r.endContainer, r.endOffset);
    if (a == null || b == null) return;
    if (a > b) [a, b] = [b, a];
    const raw = src.content.slice(a, b);
    // trim whitespace from the selection edges
    const lead = raw.length - raw.trimStart().length, trail = raw.length - raw.trimEnd().length;
    a += lead; b -= trail;
    if (b > a) setSel({ start: a, end: b, text: src.content.slice(a, b) });
  }, [src.content]);

  async function makeExcerpt() {
    if (csv) { const r = await run<{ id: string }>("excerpt.createRow", { productId: pid, sourceId: src.id, row: rows[0] }); return r.ok ? r.data.id : null; }
    if (!sel) return null;
    const r = await run<{ id: string }>("excerpt.create", { productId: pid, sourceId: src.id, start: sel.start, end: sel.end }, { refresh: false });
    return r.ok ? r.data.id : null;
  }
  const done = () => { setSel(null); setMode(null); setObsText(""); setNf(""); setRows([]); window.getSelection()?.removeAllRanges(); router.refresh(); };
  const have = csv ? rows.length > 0 : !!sel;

  const sourceNav = siblings.length > 1 && (
    <nav aria-label="Other evidence" className="card hidden max-h-[70vh] overflow-y-auto p-2 xl:block">
      <p className="h-section px-2 py-1">Evidence</p>
      {siblings.map((s) => <Link key={s.id} href={`/p/${pid}/sources/${s.id}${iid ? `?i=${iid}` : ""}`} aria-current={s.id === src.id ? "page" : undefined} className={`block rounded px-2 py-1.5 text-[13px] ${s.id === src.id ? "bg-accent-soft font-medium text-accent-strong" : "hover:bg-sunken"}`}>{s.title}</Link>)}
    </nav>
  );

  return (
    <div className="grid gap-5 px-6 py-5 xl:grid-cols-[210px_minmax(0,1fr)_380px]">
      <div className="no-print">{sourceNav}</div>
      <div className="min-w-0">
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[19px] font-semibold">{src.title}</h1><span className="badge">v{src.version}</span>{src.synthetic ? <span className="badge badge-warn">Synthetic demo data</span> : null}</div>
          <p className="text-[13px] text-muted">{[SOURCE_TYPES.find(([k]) => k === src.source_type)?.[1], src.source_date, src.participant, src.segment && `segment: ${src.segment}`, src.tags.length ? `tags: ${src.tags.join(", ")}` : ""].filter(Boolean).join(" · ")} · imported {src.imported_at.slice(0, 10)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button className="btn btn-sm" onClick={() => setEditing("meta")}>Edit details</button>
            <button className="btn btn-sm" onClick={() => setEditing("content")}>Update content (new version)</button>
            {src.content_kind === "csv" && <Link className="btn btn-sm btn-primary" href={`/p/${pid}/eventlog/${src.id}${iid ? `?i=${iid}` : ""}`}>Analyze as event log</Link>}
            {iid && <Link className="btn btn-sm btn-quiet" href={`/p/${pid}/i/${iid}/evidence`}>← Back to evidence</Link>}
          </div>
        </div>

        {src.content_kind === "text" ? (
          <div className="card">
            <div ref={bodyRef} onMouseUp={capture} onKeyUp={capture} tabIndex={0} aria-label="Source text. Select text to highlight it." className="max-h-[68vh] overflow-y-auto whitespace-pre-wrap p-5 text-[15px] leading-7">
              {segs.map((s) => s.ids.length ? <mark key={s.start} data-start={s.start} id={s.ids.includes(activeExcerpt ?? "") ? `ex-${activeExcerpt}` : `ex-${s.ids[0]}`} className={`hl ${s.ids.includes(activeExcerpt ?? "") ? "hl-active" : ""}`} title={`${s.ids.length} excerpt(s)`}>{s.text}</mark> : <span key={s.start} data-start={s.start}>{s.text}</span>)}
            </div>
            {sel && (
              <div className="sticky bottom-0 rounded-b-lg border-t border-line-strong bg-surface p-3" role="region" aria-label="Actions for the selected text">
                <p className="mb-2 line-clamp-2 text-[13px]"><span className="text-muted">Selected:</span> “{sel.text}”</p>
                {Actions()}
              </div>
            )}
          </div>
        ) : csv && (
          <div className="card overflow-x-auto">
            <table className="tbl"><thead><tr><th className="w-8"><span className="sr-only">Select row</span></th><th>#</th>{csv.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{csv.rows.map((r, i) => { const n = i + 1; const exRow = excerpts.find((e) => e.row_ref?.row === n); return (
                <tr key={n} id={exRow ? `ex-${exRow.id}` : undefined} className={exRow ? "bg-[#fbf1cc]" : ""}><td><input type="checkbox" aria-label={`Select row ${n}`} checked={rows.includes(n)} onChange={(e) => setRows(e.target.checked ? [n] : [])} /></td><td className="text-muted">{n}</td>{csv.headers.map((h) => <td key={h} className="whitespace-nowrap">{r[h]}</td>)}</tr>); })}</tbody></table>
            {csv.total > csv.rows.length && <p className="p-3 text-[12.5px] text-muted">Showing the first {csv.rows.length} of {csv.total.toLocaleString()} rows. All rows are stored and analysable.</p>}
            {rows.length > 0 && <div className="sticky bottom-0 border-t border-line-strong bg-surface p-3"><p className="mb-2 text-[13px]">Row {rows[0]} selected. Its row number and field values are preserved.</p>{Actions()}</div>}
          </div>
        )}
        <ErrorText message={error} />
      </div>

      <aside className="no-print min-w-0 space-y-4" aria-label="Derived items and assistance">
        <section className="card p-4">
          <h2 className="text-[15px] font-semibold">Derived from this source</h2>
          {excerpts.length === 0 && observations.length === 0 ? <p className="mt-1 text-[13.5px] text-muted">Nothing yet. {csv ? "Select a row" : "Select a passage"} to highlight it, note an observation, or link it to a finding.</p> : (
            <ul className="mt-2 space-y-2">
              {excerpts.map((e) => (
                <li key={e.id} className="rounded border border-line bg-paper p-2 text-[13px]">
                  <q className={e.status === "broken" ? "line-through decoration-danger/50" : ""}>{e.text.length > 200 ? e.text.slice(0, 200) + "…" : e.text}</q>
                  {e.status === "broken" && <p className="mt-1 text-[12px] text-danger">This passage is not in the current version (original text preserved from v{e.source_version}).</p>}
                  {e.status === "moved" && <p className="mt-1 text-[12px] text-warn">Found at a new position after the last update.</p>}
                  <div className="mt-1 flex flex-wrap gap-1">{e.findingLinks.map((l) => <Link key={l.findingId} className={`badge ${l.relation === "contradicts" ? "badge-danger" : "badge-accent"}`} href={`${iid ? `/p/${pid}/i/${iid}/evidence` : `/p/${pid}/knowledge`}?tab=findings&item=finding:${l.findingId}`} title={l.statement}>{l.relation}: {l.statement.slice(0, 34)}…</Link>)}</div>
                  {observations.filter((o) => o.excerpt_id === e.id).map((o) => <p key={o.id} className="mt-1 text-[12.5px]"><span className="badge mr-1">{o.kind}</span>{o.text}</p>)}
                </li>
              ))}
              {observations.filter((o) => !o.excerpt_id).map((o) => <li key={o.id} className="text-[13px]"><span className="badge mr-1">{o.kind}</span>{o.text}</li>)}
            </ul>
          )}
        </section>
        <AssistPanel pid={pid} title="Ask AI about this source" actions={[
          ...(sel && !csv ? [{ kind: "synthesis", label: "Analyze the selected passage", hint: "Evidence scope: your selection only.", scope: { sourceIds: [src.id], initiativeId: iid, extra: { focus: { sourceId: src.id, start: sel.start, end: sel.end } } } }] : []),
          ...(!csv ? [{ kind: "synthesis", label: "Analyze this whole source", hint: "Evidence scope: this source only.", scope: { sourceIds: [src.id], initiativeId: iid } }] : []),
          ...(!csv ? [{ kind: "process_draft", label: "Draft a process from this source", hint: "Steps will be labelled supported or inferred.", scope: { sourceIds: [src.id], initiativeId: iid } }] : []),
        ]} />
        {csv && <p className="text-[13px] text-muted">CSV sources are analysed with deterministic code, not AI. Use “Analyze as event log”.</p>}
        <section className="card p-4">
          <h2 className="text-[15px] font-semibold">Version history</h2>
          <ul className="mt-1 space-y-1 text-[13px]">{versions.map((v) => <li key={v.version}><span className="badge mr-1">v{v.version}</span>{v.created_at.slice(0, 10)} — {v.change_note || "no note"}</li>)}</ul>
        </section>
      </aside>

      <Modal open={editing === "meta"} onClose={() => setEditing(null)} title="Edit source details">
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run("source.update", { productId: pid, id: src.id, fields: { title: meta.title, sourceType: meta.sourceType, date: meta.date || null, participant: meta.participant, segment: meta.segment, tags: meta.tags.split(",").map((t) => t.trim()).filter(Boolean) } }); if (r.ok) setEditing(null); }}>
          <Field label="Title"><input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="Kind of evidence"><select className="input" value={meta.sourceType} onChange={(e) => setMeta({ ...meta, sourceType: e.target.value })}>{SOURCE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Date"><input type="date" className="input" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></Field>
          <Field label="Participant label"><input className="input" value={meta.participant} onChange={(e) => setMeta({ ...meta, participant: e.target.value })} /></Field>
          <Field label="Segment"><input className="input" value={meta.segment} onChange={(e) => setMeta({ ...meta, segment: e.target.value })} /></Field>
          <Field label="Tags (comma-separated)"><input className="input" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} /></Field>
          <ErrorText message={error} /><div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div>
        </form>
      </Modal>
      <Modal open={editing === "content"} onClose={() => setEditing(null)} title="Update this source’s content" wide>
        <div className="mb-3 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]">
          <p className="font-medium text-warn">This creates version {src.version + 1}. The original stays in the version history.</p>
          <p>Excerpts are re-located in the new text. {dependents.findings} finding(s){dependents.decisions ? ` and ${dependents.decisions} decision(s)` : ""} rely on this source; they will be flagged for review, and analyses that used it will be marked as possibly outdated.</p>
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run("source.update", { productId: pid, id: src.id, fields: { content, changeNote: note } }); if (r.ok) setEditing(null); }}>
          <Field label="What changed?" hint="Optional, shown in the version history."><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field label="Content"><textarea className="input font-mono text-[13px]" rows={14} value={content} onChange={(e) => setContent(e.target.value)} /></Field>
          <ErrorText message={error} /><div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => { setEditing(null); setError(null); }}>Cancel</button><button className="btn btn-primary" disabled={pending || content === src.content}>Save as v{src.version + 1}</button></div>
        </form>
      </Modal>
    </div>
  );

  function Actions() {
    return (
      <div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn btn-sm" disabled={pending} onClick={async () => { if (await makeExcerpt()) done(); }}>Highlight</button>
          <button className="btn btn-sm" onClick={() => setMode(mode === "obs" ? null : "obs")} aria-expanded={mode === "obs"}>Add observation</button>
          <button className="btn btn-sm" onClick={() => setMode(mode === "link" ? null : "link")} aria-expanded={mode === "link"}>Link to a finding</button>
          <button className="btn btn-sm" onClick={() => setMode(mode === "new" ? null : "new")} aria-expanded={mode === "new"}>New finding from this</button>
        </div>
        {mode === "obs" && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const ex = await makeExcerpt(); if (!ex) return; const r = await run("observation.create", { productId: pid, sourceId: src.id, excerptId: ex, initiativeId: iid, text: obsText, kind: obsKind }, { refresh: false }); if (r.ok) done(); }}>
            <div className="min-w-[220px] flex-1"><label className="label" htmlFor="ob-t">What was directly reported or observed?</label><input id="ob-t" className="input" required value={obsText} onChange={(e) => setObsText(e.target.value)} /></div>
            <div><label className="label" htmlFor="ob-k">Type</label><select id="ob-k" className="input" value={obsKind} onChange={(e) => setObsKind(e.target.value)}>{["need", "pain", "behavior", "other"].map((k) => <option key={k}>{k}</option>)}</select></div>
            <button className="btn btn-primary btn-sm" disabled={pending}>Save observation</button>
          </form>
        )}
        {mode === "link" && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const ex = await makeExcerpt(); if (!ex) return; const r = await run("finding.linkExcerpt", { productId: pid, findingId, excerptId: ex, relation: rel }, { refresh: false }); if (r.ok) done(); }}>
            <div className="min-w-[220px] flex-1"><label className="label" htmlFor="lf-f">Finding</label><select id="lf-f" required className="input" value={findingId} onChange={(e) => setFindingId(e.target.value)}><option value="">Choose…</option>{findings.map((f) => <option key={f.id} value={f.id}>{f.statement.slice(0, 80)}</option>)}</select></div>
            <div><label className="label" htmlFor="lf-r">This excerpt…</label><select id="lf-r" className="input" value={rel} onChange={(e) => setRel(e.target.value)}><option value="supports">supports it</option><option value="contradicts">contradicts it</option></select></div>
            <button className="btn btn-primary btn-sm" disabled={pending || !findingId}>Link</button>
          </form>
        )}
        {mode === "new" && (
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const ex = await makeExcerpt(); if (!ex) return; const r = await run("finding.create", { productId: pid, initiativeId: iid, statement: nf, segment: src.segment, excerpts: [{ id: ex, relation: "supports" }] }, { refresh: false }); if (r.ok) done(); }}>
            <div className="min-w-[260px] flex-1"><label className="label" htmlFor="nf-t">What does this tell us? (one voice = weak evidence until corroborated)</label><input id="nf-t" className="input" required value={nf} onChange={(e) => setNf(e.target.value)} /></div>
            <button className="btn btn-primary btn-sm" disabled={pending}>Create finding</button>
          </form>
        )}
      </div>
    );
  }
}
