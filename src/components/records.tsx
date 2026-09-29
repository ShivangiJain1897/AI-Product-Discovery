"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";

export const SOURCE_TYPES: [string, string][] = [["interview", "Interview"], ["observation", "Observation"], ["survey", "Survey response"], ["support", "Support feedback"], ["meeting", "Meeting note"], ["process_doc", "Process document"], ["event_log", "Operational event log"], ["other", "Other"]];

/** Opens when ?add=1 is present (top-bar action) or via the button. */
export function AddEvidence({ pid, iid, initiatives, label = "Add evidence", primary }: { pid: string; iid?: string; initiatives?: { id: string; title: string }[]; label?: string; primary?: boolean }) {
  const sp = useSearchParams(); const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(sp.get("add") === "1");
  const { run, pending, error, setError } = useAction();
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [f, setF] = useState({ title: "", sourceType: "interview", date: "", participant: "", segment: "", tags: "", content: "", filename: "" });
  const [link, setLink] = useState(iid ?? "");
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (sp.get("add") === "1") setOpen(true); }, [sp]);
  const close = () => { setOpen(false); if (sp.get("add")) router.replace(path); };
  const showIssue = f.sourceType === "event_log";

  function onFile(file: File | undefined) {
    setFileMsg(null); if (!file) return;
    if (!/\.(txt|md|markdown|csv)$/i.test(file.name)) {
      setFileMsg(`“${file.name}” isn’t supported yet. You can add pasted text, .txt, .md or .csv files. For PDFs and Word documents, copy the text and paste it here.`);
      if (fileRef.current) fileRef.current.value = ""; return;
    }
    const r = new FileReader();
    r.onload = () => { const isCsv = /\.csv$/i.test(file.name); setF((x) => ({ ...x, content: String(r.result), filename: file.name, title: x.title || file.name.replace(/\.[^.]+$/, ""), sourceType: isCsv && x.sourceType === "interview" ? "event_log" : x.sourceType })); };
    r.readAsText(file);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run<{ id: string }>("source.create", { productId: pid, initiativeId: link || undefined, title: f.title, sourceType: f.sourceType, date: f.date || null, participant: f.participant, segment: f.segment, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), content: f.content, filename: f.filename || null }, { refresh: false });
    if (r.ok) { close(); setF({ title: "", sourceType: "interview", date: "", participant: "", segment: "", tags: "", content: "", filename: "" });
      router.push(showIssue ? `/p/${pid}/eventlog/${r.data.id}${link ? `?i=${link}` : ""}` : `/p/${pid}/sources/${r.data.id}${link ? `?i=${link}` : ""}`); router.refresh(); }
  }
  return (<>
    <button type="button" className={`btn ${primary ? "btn-primary" : ""}`} onClick={() => setOpen(true)}>{label}</button>
    <Modal open={open} onClose={close} title="Add evidence" wide>
      <form onSubmit={submit}>
        <div role="tablist" aria-label="How to add" className="mb-3 flex gap-1">
          {(["paste", "file"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`btn btn-sm ${mode === m ? "btn-primary" : ""}`}>{m === "paste" ? "Paste text" : "Upload a file"}</button>)}
        </div>
        {mode === "file" && (
          <Field label="File" hint="Supported: .txt, .md and .csv. For anything else, paste the text instead.">
            <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
            {fileMsg && <p role="alert" className="mt-1 text-[13px] text-danger">{fileMsg}</p>}
            {f.filename && <p className="mt-1 text-[12.5px] text-muted">Loaded {f.filename} ({f.content.length.toLocaleString()} characters)</p>}
          </Field>
        )}
        <div className="grid gap-x-3 md:grid-cols-2">
          <Field label="Title" htmlFor="ae-t"><input id="ae-t" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Interview with an operations analyst" /></Field>
          <Field label="What kind of evidence is this?" htmlFor="ae-y"><select id="ae-y" className="input" value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value })}>{SOURCE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Date (if known)" htmlFor="ae-d"><input id="ae-d" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Participant or stakeholder label" htmlFor="ae-p" hint="A label such as P3 or “ops analyst”. No personal details needed."><input id="ae-p" className="input" value={f.participant} onChange={(e) => setF({ ...f, participant: e.target.value })} /></Field>
          <Field label="Segment" htmlFor="ae-s"><input id="ae-s" className="input" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} placeholder="e.g. new clients" /></Field>
          <Field label="Tags (comma-separated)" htmlFor="ae-g"><input id="ae-g" className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
        </div>
        {mode === "paste" && <Field label="Content" htmlFor="ae-c" hint="Pasted as-is. The original is always preserved."><textarea id="ae-c" className="input font-mono text-[13px]" rows={9} required value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></Field>}
        {initiatives && initiatives.length > 0 && !iid && (
          <Field label="Also link to a discovery (optional)" htmlFor="ae-l"><select id="ae-l" className="input" value={link} onChange={(e) => setLink(e.target.value)}><option value="">Keep at product level only</option>{initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field>
        )}
        {showIssue && <p className="mb-2 rounded bg-accent-soft px-3 py-2 text-[13px]">After saving you’ll map the case, activity and timestamp columns and review validation before anything is analysed.</p>}
        <ErrorText message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => { close(); setError(null); }}>Cancel</button><button className="btn btn-primary" disabled={pending || !f.content}>{pending ? "Saving…" : "Save evidence"}</button></div>
      </form>
    </Modal>
  </>);
}

/** Confirmation that explains what deleting affects. Deletion is recoverable. */
export function DeleteButton({ pid, type, id, label, onDone, redirect }: { pid: string; type: string; id: string; label: string; onDone?: () => void; redirect?: string }) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<any>(null);
  const { run, pending, error, router } = useAction();
  async function ask() { const r = await run("entity.impact", { productId: pid, type, id }, { refresh: false }); if (r.ok) { setImpact(r.data); setOpen(true); } }
  return (<>
    <button type="button" className="btn btn-sm btn-quiet text-danger" onClick={ask}>Delete</button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Delete this ${label}?`}>
      <p className="mb-2 text-[14px]">“{impact?.label}”</p>
      {impact?.items?.length ? (<><p className="mb-1 text-[13.5px]">It is connected to <strong>{impact.items.length}</strong> other record(s). They will keep existing, and dependent findings and decisions will be flagged for review:</p>
        <ul className="mb-3 max-h-48 list-disc overflow-auto pl-5 text-[13px]">{impact.items.map((x: any) => <li key={x.linkId}>{x.relation} — {x.type}: {x.label}</li>)}</ul></>) : <p className="mb-3 text-[13.5px]">Nothing else is linked to it.</p>}
      <p className="mb-3 text-[12.5px] text-muted">Deleting is recoverable from “Recently deleted” in Knowledge.</p>
      <ErrorText message={error} />
      <div className="flex justify-end gap-2"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-danger" disabled={pending} onClick={async () => { const r = await run("entity.delete", { productId: pid, type, id }); if (r.ok) { setOpen(false); onDone?.(); if (redirect) router.push(redirect); } }}>Delete</button></div>
    </Modal>
  </>);
}

/** Link the record to others in the same product. Candidates are supplied by the server (already product-scoped). */
export function LinkAdder({ pid, fromType, fromId, candidates, relations, label = "Link to…" }: { pid: string; fromType: string; fromId: string; candidates: { type: string; id: string; label: string }[]; relations: { value: string; label: string; direction?: "out" | "in" }[]; label?: string }) {
  const { run, pending, error } = useAction();
  const [c, setC] = useState(""); const [rel, setRel] = useState(relations[0].value);
  if (!candidates.length) return null;
  const chosen = candidates.find((x) => `${x.type}:${x.id}` === c);
  const relDef = relations.find((r) => r.value === rel) ?? relations[0];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor={`la-${fromId}`}>{label}</label>
      <select id={`la-${fromId}`} className="input !w-auto max-w-[220px] !py-1 text-[12.5px]" value={c} onChange={(e) => setC(e.target.value)}><option value="">{label}</option>{candidates.map((x) => <option key={`${x.type}:${x.id}`} value={`${x.type}:${x.id}`}>{x.type}: {x.label.slice(0, 60)}</option>)}</select>
      {relations.length > 1 && <select aria-label="Relationship" className="input !w-auto !py-1 text-[12.5px]" value={rel} onChange={(e) => setRel(e.target.value)}>{relations.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>}
      <button className="btn btn-sm" disabled={!chosen || pending} onClick={async () => { if (!chosen) return; const inbound = relDef.direction === "in"; const r = await run("link.add", { productId: pid, fromType: inbound ? chosen.type : fromType, fromId: inbound ? chosen.id : fromId, toType: inbound ? fromType : chosen.type, toId: inbound ? fromId : chosen.id, relation: rel }); if (r.ok) setC(""); }}>Link</button>
      <ErrorText message={error} />
    </div>
  );
}

export function Unlink({ pid, linkId }: { pid: string; linkId: string }) {
  const { run, pending } = useAction();
  return <button className="btn btn-quiet btn-sm !px-1" aria-label="Remove link" disabled={pending} onClick={() => run("link.remove", { productId: pid, linkId })}>✕</button>;
}

export function LinkedSourceToggle({ pid, iid, sid, linked }: { pid: string; iid: string; sid: string; linked: boolean }) {
  const { run, pending } = useAction();
  return <button className="btn btn-sm" disabled={pending} onClick={() => run("source.linkInitiative", { productId: pid, initiativeId: iid, sourceId: sid, linked: !linked })}>{linked ? "Unlink from this discovery" : "Link to this discovery"}</button>;
}

export function InlineForm({ children }: { children: React.ReactNode }) { return <div className="card p-4">{children}</div>; }
export { Link };
