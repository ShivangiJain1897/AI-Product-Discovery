"use client";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText, Modal } from "./ui";

type Dim = { key: string; label: string; scale: string; weight: number; lowerIsBetter: boolean };
type Opp = { id: string; title: string; scores: Record<string, number | null>; override_score: number | null; override_rationale: string; calc: { score: number | null; note: string; known: { key: string; label: string; value: number; used: number; weight: number }[] }; suggestedEvidence: { value: number | null; basis: string } };

export function PriorityTable({ pid, dims, opps }: { pid: string; dims: Dim[]; opps: Opp[] }) {
  const { run, pending, error } = useAction();
  const [editDims, setEditDims] = useState(false);
  const [d, setD] = useState<Dim[]>(dims);
  const [ov, setOv] = useState<Record<string, { score: string; why: string }>>({});
  const save = (o: Opp, key: string, val: string) => run("opportunity.scores", { productId: pid, id: o.id, scores: { ...o.scores, [key]: val === "" ? null : Number(val) }, override: o.override_score != null ? { score: o.override_score, rationale: o.override_rationale } : undefined });
  const ranked = [...opps].sort((a, b) => (b.override_score ?? b.calc.score ?? -1) - (a.override_score ?? a.calc.score ?? -1));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[13px] text-muted">A comparison aid, not a verdict. Leave a cell on “unknown” when you don’t know: unknowns are left out of the score, never treated as zero.</p>
        <button className="btn btn-sm" onClick={() => setEditDims(true)}>Edit dimensions</button>
      </div>
      <details className="mb-3 rounded border border-line bg-surface px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium">How the score works</summary>
        <p className="mt-1">score = Σ(weight × value) ÷ Σ(weight), over the dimensions you have rated. Lower-is-better dimensions count as (6 − value). A score appears only when at least 3 dimensions are rated. You can override it, but must say why.</p>
        <ul className="mt-1 list-disc pl-5">{dims.map((x) => <li key={x.key}><strong>{x.label}</strong> (weight {x.weight}{x.lowerIsBetter ? ", lower is better" : ""}): {x.scale}</li>)}</ul></details>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Opportunity</th>{dims.map((x) => <th key={x.key} title={x.scale}>{x.label}</th>)}<th>Score</th></tr></thead>
          <tbody>{ranked.map((o) => (
            <tr key={o.id}>
              <td className="min-w-[200px] font-medium">{o.title}</td>
              {dims.map((x) => (
                <td key={x.key}>
                  <select aria-label={`${x.label} for ${o.title}`} className="input !w-[88px] !py-1" disabled={pending} value={o.scores[x.key] ?? ""} onChange={(e) => save(o, x.key, e.target.value)}>
                    <option value="">unknown</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {x.key === "evidence" && o.scores.evidence == null && o.suggestedEvidence.value != null && <button className="mt-1 block text-[11.5px] text-accent-strong underline" onClick={() => save(o, "evidence", String(o.suggestedEvidence.value))} title={o.suggestedEvidence.basis}>suggest {o.suggestedEvidence.value}</button>}
                </td>
              ))}
              <td className="min-w-[210px]">
                {o.override_score != null ? <><span className="text-[15px] font-semibold">{o.override_score}</span> <span className="badge badge-warn">manual override</span><p className="text-[12px] text-muted">“{o.override_rationale}”</p><p className="text-[12px] text-muted">Computed: {o.calc.score == null ? "not scored" : o.calc.score.toFixed(2)}</p></>
                  : o.calc.score != null ? <span className="text-[15px] font-semibold">{o.calc.score.toFixed(2)}<span className="text-[12px] font-normal text-muted"> / 5</span></span> : <span className="badge badge-warn">Not scored</span>}
                <p className="text-[12px] text-muted">{o.calc.note}</p>
                {o.calc.known.length > 0 && <details className="text-[12px]"><summary className="cursor-pointer text-muted">Inputs</summary>{o.calc.known.map((k) => <div key={k.key}>{k.label}: {k.value}{k.used !== k.value ? ` → ${k.used}` : ""} × {k.weight}</div>)}</details>}
                <details className="text-[12px]"><summary className="cursor-pointer text-muted">{o.override_score != null ? "Change override" : "Override"}</summary>
                  <div className="mt-1 space-y-1"><input aria-label="Override score" className="input !py-1" placeholder="Score 1–5" value={ov[o.id]?.score ?? ""} onChange={(e) => setOv({ ...ov, [o.id]: { score: e.target.value, why: ov[o.id]?.why ?? "" } })} /><input aria-label="Rationale" className="input !py-1" placeholder="Why override? (required)" value={ov[o.id]?.why ?? ""} onChange={(e) => setOv({ ...ov, [o.id]: { score: ov[o.id]?.score ?? "", why: e.target.value } })} />
                    <div className="flex gap-1"><button className="btn btn-sm" onClick={() => run("opportunity.scores", { productId: pid, id: o.id, scores: o.scores, override: { score: ov[o.id]?.score ? Number(ov[o.id].score) : null, rationale: ov[o.id]?.why ?? "" } })}>Apply</button>{o.override_score != null && <button className="btn btn-sm" onClick={() => run("opportunity.scores", { productId: pid, id: o.id, scores: o.scores })}>Remove</button>}</div></div></details>
              </td>
            </tr>))}</tbody>
        </table>
      </div>
      <ErrorText message={error} />
      <Modal open={editDims} onClose={() => setEditDims(false)} title="Prioritization dimensions" wide>
        <p className="mb-3 text-[13px] text-muted">Rename, reweight or explain the scale. These apply to every opportunity in this product.</p>
        {d.map((x, i) => (
          <div key={x.key} className="mb-3 grid gap-2 rounded border border-line p-2.5 md:grid-cols-[1fr_80px_auto]">
            <input aria-label="Dimension name" className="input" value={x.label} onChange={(e) => setD(d.map((y, k) => k === i ? { ...y, label: e.target.value } : y))} />
            <input aria-label="Weight" type="number" min={0} max={10} className="input" value={x.weight} onChange={(e) => setD(d.map((y, k) => k === i ? { ...y, weight: Number(e.target.value) } : y))} />
            <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={x.lowerIsBetter} onChange={(e) => setD(d.map((y, k) => k === i ? { ...y, lowerIsBetter: e.target.checked } : y))} />lower is better</label>
            <textarea aria-label="Scale explanation" className="input md:col-span-3" rows={2} value={x.scale} onChange={(e) => setD(d.map((y, k) => k === i ? { ...y, scale: e.target.value } : y))} />
          </div>
        ))}
        <div className="flex justify-between"><button className="btn btn-sm" onClick={() => setD([...d, { key: `dim${d.length + 1}_${Date.now() % 1000}`, label: "New dimension", scale: "1 = low · 5 = high", weight: 1, lowerIsBetter: false }])}>Add a dimension</button>
          <div className="flex gap-2"><button className="btn" onClick={() => setEditDims(false)}>Cancel</button><button className="btn btn-primary" onClick={async () => { const r = await run("prioritization.save", { productId: pid, dims: d }); if (r.ok) setEditDims(false); }}>Save</button></div></div>
        <ErrorText message={error} />
      </Modal>
    </div>
  );
}
