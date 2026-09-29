"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { rpc } from "@/lib/client";
import { Icon } from "./icon";
import type { TableValue } from "@/lib/templates";

type Row = { label: string; cells: string[][] };
type Model = { stages: string[]; rows: Row[] };

const toModel = (t: TableValue): Model => ({
  stages: t.columns.slice(1),
  rows: t.rows.map((r) => ({ label: r[0] ?? "", cells: t.columns.slice(1).map((_, i) => (r[i + 1] ?? "").split("\n").map((x) => x.trim()).filter(Boolean)) })),
});
const toTable = (m: Model): TableValue => ({
  columns: ["", ...m.stages],
  rows: m.rows.map((r) => [r.label, ...m.stages.map((_, i) => (r.cells[i] ?? []).map((x) => x.trim()).filter(Boolean).join("\n"))]),
});

const TONE: Record<string, string> = {
  "pain points": "border-warn/40 bg-warn-soft",
  opportunities: "border-accent/40 bg-accent-soft",
};

/** The journey as boxes and arrows: stages are boxes joined by arrows, each stage holds sticky-note cards per dimension. Everything can be added, edited, moved and removed. */
export function JourneyDiagram({ pid, id, value, pains, refLabel, render }: { pid: string; id: string; value: TableValue; pains: string[]; refLabel: (text: string) => string; render: (text: string) => ReactNode }) {
  const [m, setM] = useState<Model>(() => toModel(value));
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [placing, setPlacing] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await rpc("doc.saveSection", { productId: pid, id, key: "map", value: toTable(m) });
      setSaved(r.ok ? "saved" : "idle");
    }, 600);
    return () => clearTimeout(timer.current);
  }, [m, pid, id]);

  const painRow = m.rows.findIndex((r) => /pain/i.test(r.label));
  const setStage = (i: number, v: string) => setM((s) => ({ ...s, stages: s.stages.map((x, j) => (j === i ? v : x)) }));
  const addStage = () => setM((s) => ({ stages: [...s.stages, `Stage ${s.stages.length + 1}`], rows: s.rows.map((r) => ({ ...r, cells: [...r.cells, []] })) }));
  const removeStage = (i: number) => setM((s) => ({ stages: s.stages.filter((_, j) => j !== i), rows: s.rows.map((r) => ({ ...r, cells: r.cells.filter((_, j) => j !== i) })) }));
  const moveStage = (i: number, d: -1 | 1) => setM((s) => {
    const j = i + d; if (j < 0 || j >= s.stages.length) return s;
    const sw = <T,>(a: T[]) => { const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; };
    return { stages: sw(s.stages), rows: s.rows.map((r) => ({ ...r, cells: sw(r.cells) })) };
  });
  const setLabel = (r: number, v: string) => setM((s) => ({ ...s, rows: s.rows.map((x, i) => (i === r ? { ...x, label: v } : x)) }));
  const addRow = () => setM((s) => ({ ...s, rows: [...s.rows, { label: "New row", cells: s.stages.map(() => []) }] }));
  const removeRow = (r: number) => setM((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== r) }));
  const editCells = (r: number, c: number, fn: (cards: string[]) => string[]) => setM((s) => ({ ...s, rows: s.rows.map((x, i) => (i === r ? { ...x, cells: x.cells.map((cell, j) => (j === c ? fn(cell) : cell)) } : x)) }));

  const cols = `152px repeat(${Math.max(m.stages.length, 1)}, minmax(210px, 1fr))`;
  return (
    <div data-testid="journey-diagram">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
        <span>Stages run left to right. Add or remove stages, rows and notes anywhere; changes save automatically.</span>
        <span className="ml-auto" aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved ✓" : ""}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-sunken/40 p-3">
        <div className="grid min-w-max items-start gap-x-3 gap-y-3" style={{ gridTemplateColumns: cols }}>
          <div />
          {m.stages.map((st, i) => (
            <div key={i} className="relative">
              <div className="rounded-xl border-2 border-accent bg-surface px-3 py-2 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{i + 1}</span>
                  <input aria-label={`Stage ${i + 1} name`} className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none focus:underline" value={st} onChange={(e) => setStage(i, e.target.value)} />
                </div>
                <div className="mt-1 flex items-center gap-0.5 text-muted">
                  <button className="rounded px-1 hover:bg-sunken disabled:opacity-30" aria-label={`Move ${st} left`} disabled={i === 0} onClick={() => moveStage(i, -1)}>←</button>
                  <button className="rounded px-1 hover:bg-sunken disabled:opacity-30" aria-label={`Move ${st} right`} disabled={i === m.stages.length - 1} onClick={() => moveStage(i, 1)}>→</button>
                  <button className="ml-auto rounded px-1.5 text-[12px] hover:bg-sunken hover:text-danger" aria-label={`Remove stage ${st}`} onClick={() => removeStage(i)}>Remove</button>
                </div>
              </div>
              {i < m.stages.length - 1 && <span aria-hidden className="absolute -right-[13px] top-4 z-10 text-[18px] leading-none text-accent">›</span>}
            </div>
          ))}
          {m.stages.length === 0 && <p className="text-[13px] text-muted">No stages yet.</p>}

          {m.rows.map((row, r) => (
            <div key={r} className="contents">
              <div className="sticky left-0 z-10 rounded-lg bg-sunken px-2 py-1.5">
                <input aria-label={`Row ${r + 1} name`} className="w-full bg-transparent text-[13px] font-semibold outline-none focus:underline" value={row.label} onChange={(e) => setLabel(r, e.target.value)} />
                <button className="text-[11.5px] text-muted hover:text-danger" aria-label={`Remove row ${row.label}`} onClick={() => removeRow(r)}>Remove row</button>
              </div>
              {m.stages.map((st, c) => {
                const tone = TONE[row.label.trim().toLowerCase()] ?? "border-line-strong bg-surface";
                return (
                  <div key={c} className="min-h-[52px] space-y-1.5" data-cell={`${row.label}|${st}`}>
                    {(row.cells[c] ?? []).map((card, k) => (
                      <div key={k} className={`group relative rounded-lg border px-2 py-1.5 text-[13px] shadow-sm ${tone}`}>
                        {card.includes("[[") && editing !== `${r}.${c}.${k}` ? (
                          <div role="button" tabIndex={0} aria-label={`${row.label}, ${st}, note ${k + 1}`} className="cursor-text whitespace-pre-line pr-4 leading-snug" onClick={() => setEditing(`${r}.${c}.${k}`)} onKeyDown={(e) => { if (e.key === "Enter") setEditing(`${r}.${c}.${k}`); }}>{render(card)}</div>
                        ) : (
                          <textarea aria-label={`${row.label}, ${st}, note ${k + 1}`} rows={Math.max(1, Math.ceil(card.length / 26))} className="block w-full resize-none bg-transparent pr-4 leading-snug outline-none" value={card} autoFocus={card === "" || editing === `${r}.${c}.${k}`} onBlur={() => setEditing(null)} onChange={(e) => editCells(r, c, (a) => a.map((x, j) => (j === k ? e.target.value.replace(/\n/g, " ") : x)))} />
                        )}
                        <button aria-label={`Remove note ${k + 1} from ${row.label}, ${st}`} className="absolute right-1 top-1 rounded px-1 text-[12px] text-muted opacity-60 hover:bg-sunken hover:text-danger group-hover:opacity-100" onClick={() => editCells(r, c, (a) => a.filter((_, j) => j !== k))}>✕</button>
                      </div>
                    ))}
                    <div className="flex items-center gap-1">
                      <button className="rounded-md border border-dashed border-line-strong px-2 py-0.5 text-[12px] text-muted hover:border-accent hover:text-accent-strong" aria-label={`Add note to ${row.label}, ${st}`} onClick={() => editCells(r, c, (a) => [...a, ""])}>+ Add</button>
                      {r === painRow && pains.length > 0 && (
                        <button className="rounded-md px-1.5 py-0.5 text-[12px] text-accent-strong hover:bg-accent-soft" aria-label={`Place a pain point in ${st}`} onClick={() => setPlacing(placing === c ? null : c)}>From findings ▾</button>
                      )}
                    </div>
                    {r === painRow && placing === c && (
                      <ul className="rounded-lg border border-line bg-surface p-1 shadow-md" role="menu">
                        {pains.map((p, k) => (
                          <li key={k}><button role="menuitem" className="w-full rounded px-2 py-1 text-left text-[12.5px] hover:bg-sunken" onClick={() => { editCells(r, c, (a) => (a.includes(p) ? a : [...a, p])); setPlacing(null); }}>{refLabel(p)}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={addStage}><Icon name="plus" size={13} />Add a stage</button>
        <button className="btn btn-sm" onClick={addRow}><Icon name="plus" size={13} />Add a row</button>
      </div>
    </div>
  );
}
