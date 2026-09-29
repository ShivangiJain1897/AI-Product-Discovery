"use client";
import Link from "next/link";
import { useState } from "react";
import { AssistPanel, type AssistAction } from "./assist";
import { LinkedSourceToggle } from "./records";

type S = { id: string; title: string; source_type: string; participant: string; segment: string; source_date: string | null; excerptCount: number; version: number; synthetic: number; content_kind: string; length: number };
const TYPE: Record<string, string> = { interview: "Interview", observation: "Observation", survey: "Survey", support: "Support", meeting: "Meeting note", process_doc: "Process doc", event_log: "Event log", other: "Other" };

export function EvidenceBoard({ pid, iid, sources, unlinked, pending, question }: { pid: string; iid: string; sources: S[]; unlinked: S[]; pending: { id: string; kind: string; mode: string }[]; question: string }) {
  const [sel, setSel] = useState<string[]>([]);
  const [scope, setScope] = useState<"selected" | "initiative" | "product">("selected");
  const textSources = sources.filter((s) => s.content_kind === "text");
  const ids = scope === "selected" ? sel.filter((id) => textSources.some((s) => s.id === id)) : scope === "initiative" ? textSources.map((s) => s.id) : [...textSources, ...unlinked.filter((s) => s.content_kind === "text")].map((s) => s.id);
  const none = ids.length === 0 ? "Select at least one text source first." : undefined;
  const scopeText = scope === "selected" ? `${ids.length} selected source(s)` : scope === "initiative" ? `all ${ids.length} text sources in this discovery` : `all ${ids.length} text sources in this product`;
  const actions: AssistAction[] = [
    { kind: "synthesis", label: "Analyze for themes and candidate findings", hint: `Evidence scope: ${scopeText}.`, scope: { sourceIds: ids, initiativeId: iid, question, includeProductKnowledge: scope === "product" }, disabled: none },
    { kind: "process_draft", label: "Draft a process map from these sources", hint: `Evidence scope: ${scopeText}. Steps are labelled supported or inferred.`, scope: { sourceIds: ids, initiativeId: iid }, disabled: none },
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="min-w-0">
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th className="w-8"><span className="sr-only">Select</span></th><th>Evidence</th><th>Type</th><th>Who / segment</th><th>Date</th><th className="text-right">Excerpts</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td><input type="checkbox" aria-label={`Select ${s.title} for AI analysis`} disabled={s.content_kind === "csv"} checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} /></td>
                  <td><Link className="font-medium hover:underline" href={`/p/${pid}/sources/${s.id}?i=${iid}`}>{s.title}</Link>{s.synthetic ? <span className="badge badge-warn ml-1.5">Synthetic</span> : null}{s.version > 1 && <span className="badge ml-1.5">v{s.version}</span>}{s.content_kind === "csv" && <Link className="badge badge-accent ml-1.5" href={`/p/${pid}/eventlog/${s.id}?i=${iid}`}>Analyze as event log</Link>}</td>
                  <td>{TYPE[s.source_type] ?? s.source_type}</td>
                  <td>{[s.participant, s.segment].filter(Boolean).join(" · ") || <span className="text-muted">—</span>}</td>
                  <td className="whitespace-nowrap">{s.source_date ?? "—"}</td>
                  <td className="text-right">{s.excerptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unlinked.length > 0 && (
          <details className="mt-4"><summary className="cursor-pointer text-[13.5px] font-medium">Reuse evidence already in this product ({unlinked.length})</summary>
            <ul className="card mt-2 divide-y divide-line">{unlinked.map((s) => <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]"><span className="min-w-0 truncate">{s.title} <span className="text-muted">· {TYPE[s.source_type]}</span></span><LinkedSourceToggle pid={pid} iid={iid} sid={s.id} linked={false} /></li>)}</ul></details>
        )}
      </div>
      <div className="no-print space-y-3 xl:sticky xl:top-[57px] xl:self-start">
        <section className="card p-4">
          <h2 className="text-[15px] font-semibold">Evidence scope for AI</h2>
          <fieldset className="mt-1.5 space-y-1 text-[13.5px]"><legend className="sr-only">Evidence scope</legend>
            {([["selected", "Selected sources only (default)"], ["initiative", "This whole discovery"], ["product", "Broader: everything in this product"]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)} />{l}</label>)}
          </fieldset>
        </section>
        <AssistPanel pid={pid} actions={actions} pending={pending} />
      </div>
    </div>
  );
}
