"use client";
import Link from "next/link";
import { useState } from "react";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";

export function DeriveButton({ pid, runId, metric, keyName, label, value, statement, title, iid }: { pid: string; runId: string; metric: string; keyName: string; label: string; value: string; statement: string; title: string; iid?: string | null }) {
  const [open, setOpen] = useState(false);
  const [as, setAs] = useState<"finding" | "opportunity">("finding");
  const [text, setText] = useState(statement); const [t, setT] = useState(title); const [interp, setInterp] = useState("");
  const [made, setMade] = useState<{ id: string; as: string } | null>(null);
  const { run, pending, error } = useAction();
  return (<>
    <button className="btn btn-sm" onClick={() => setOpen(true)}>Keep this…</button>
    <Modal open={open} onClose={() => setOpen(false)} title="Keep this pattern">
      {made ? (
        <div><p className="mb-3 text-[14px]">Saved as a {made.as}. It keeps a reference to this dataset and metric: <em>{label} = {value}</em>.</p>
          <div className="flex justify-end gap-2"><button className="btn" onClick={() => { setOpen(false); setMade(null); }}>Close</button><Link className="btn btn-primary" href={made.as === "finding" ? (iid ? `/p/${pid}/i/${iid}/evidence?tab=findings&item=finding:${made.id}` : `/p/${pid}/knowledge?tab=findings&item=finding:${made.id}`) : (iid ? `/p/${pid}/i/${iid}/explore?item=opportunity:${made.id}` : `/p/${pid}/knowledge?tab=opportunities&item=opportunity:${made.id}`)}>Open it</Link></div></div>
      ) : (
        <form onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("eventlog.derive", { productId: pid, runId, as, metric, key: keyName, label, value, statement: text, title: t, interpretation: interp, initiativeId: iid ?? undefined }); if (r.ok) setMade({ id: r.data.id, as }); }}>
          <p className="mb-3 rounded bg-paper px-3 py-2 text-[13px]"><span className="h-section">Metric </span>{label} = <strong>{value}</strong></p>
          <fieldset className="mb-3 flex gap-4 text-[13.5px]"><legend className="label">Save it as</legend>{(["finding", "opportunity"] as const).map((k) => <label key={k} className="flex items-center gap-1.5"><input type="radio" checked={as === k} onChange={() => setAs(k)} />{k === "finding" ? "A finding (what the data shows)" : "An opportunity (a problem worth solving)"}</label>)}</fieldset>
          {as === "opportunity" && <Field label="Opportunity name" htmlFor="dv-t"><input id="dv-t" className="input" value={t} onChange={(e) => setT(e.target.value)} required /></Field>}
          <Field label={as === "finding" ? "Finding" : "Problem statement"} htmlFor="dv-s" hint="Keep it to what the data shows. Causes are hypotheses until tested."><textarea id="dv-s" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} required /></Field>
          {as === "finding" && <Field label="Your interpretation (optional)" htmlFor="dv-i"><textarea id="dv-i" className="input" rows={2} value={interp} onChange={(e) => setInterp(e.target.value)} /></Field>}
          <ErrorText message={error} /><div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div>
        </form>)}
    </Modal>
  </>);
}
