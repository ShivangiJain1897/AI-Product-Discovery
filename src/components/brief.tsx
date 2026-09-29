"use client";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText } from "./ui";

export function NarrativeEditor({ pid, iid, k, initial, needsRefresh, changes, hasItems }: { pid: string; iid: string; k: string; initial: string; needsRefresh: boolean; changes: string[]; hasItems: boolean }) {
  const { run, pending, error } = useAction();
  const [v, setV] = useState(initial); const [edit, setEdit] = useState(false);
  const dirty = v !== initial;
  return (
    <div className="mb-3">
      {needsRefresh && (
        <div role="status" className="mb-2 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]">
          <p className="font-medium text-warn">Needs refresh — the records below changed after you last reviewed this section.</p>
          {changes.length > 0 && <ul className="list-disc pl-5">{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
          <p className="mt-1 text-[12.5px]">Your narrative has not been touched. Read it against the records, edit if needed, then confirm.</p>
          <button className="btn btn-sm mt-1.5" disabled={pending} onClick={() => run("brief.markReviewed", { productId: pid, initiativeId: iid, key: k })}>My narrative still holds — mark reviewed</button>
        </div>
      )}
      {!edit ? (
        <div className="flex items-start justify-between gap-3">
          {initial.trim() ? <p className="whitespace-pre-line text-[14.5px]">{initial}</p> : <p className="text-[13.5px] text-muted">No narrative yet. The records below are always current; add your own words if the story needs them.</p>}
          <button className="btn btn-sm no-print shrink-0" onClick={() => setEdit(true)}>{initial.trim() ? "Edit narrative" : "Write narrative"}</button>
        </div>
      ) : (
        <div>
          <label className="sr-only" htmlFor={`nar-${k}`}>Narrative</label>
          <textarea id={`nar-${k}`} className="input" rows={4} value={v} onChange={(e) => setV(e.target.value)} />
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" disabled={pending || !dirty} onClick={async () => { const r = await run("brief.saveNarrative", { productId: pid, initiativeId: iid, key: k, narrative: v }); if (r.ok) setEdit(false); }}>Save narrative</button>
            <button className="btn btn-sm" disabled={pending} onClick={async () => { const r = await run<{ text: string }>("brief.draft", { productId: pid, initiativeId: iid, key: k }, { refresh: false }); if (r.ok) setV(v.trim() ? v + "\n\n" + r.data.text : r.data.text); }}>Draft from records</button>
            <button className="btn btn-sm btn-quiet" onClick={() => { setV(initial); setEdit(false); }}>Cancel</button>
          </div>
          <p className="mt-1 text-[12px] text-muted">“Draft from records” appends a plain factual sentence. Nothing is saved until you save, and generated text never replaces yours.</p>
          <ErrorText message={error} />
        </div>
      )}
    </div>
  );
}
