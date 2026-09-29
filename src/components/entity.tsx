"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAction } from "@/lib/client";
import { ErrorText, Field, Modal } from "./ui";
import type { FieldSpec } from "./specs";

function Input({ f, v, set, id }: { f: FieldSpec; v: string; set: (v: string) => void; id: string }) {
  if (f.kind === "area") return <textarea id={id} className="input" rows={f.rows ?? 2} required={f.required} value={v} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
  if (f.kind === "select") return <select id={id} className="input" value={v} onChange={(e) => set(e.target.value)}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  return <input id={id} type={f.kind === "date" ? "date" : "text"} className="input" required={f.required} value={v} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
}

export function EntityView({ fields, values }: { fields: FieldSpec[]; values: Record<string, any> }) {
  return (
    <dl className="space-y-2 text-[13.5px]">
      {fields.map((f) => {
        const raw = values[f.key]; const label = f.kind === "select" ? f.options!.find(([k]) => k === raw)?.[1] ?? raw : raw;
        return <div key={f.key}><dt className="h-section">{f.label.replace(/ —.*$/, "")}</dt><dd className="whitespace-pre-line">{label || <span className="text-muted">Not recorded</span>}</dd></div>;
      })}
    </dl>
  );
}

export function EntityEditor({ pid, type, id, fields, values, extra }: { pid: string; type: string; id: string; fields: FieldSpec[]; values: Record<string, any>; extra?: Record<string, unknown> }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""])));
  const { run, pending, error, setError } = useAction();
  useEffect(() => setV(Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""]))), [values, fields]);
  if (!edit) return (<><EntityView fields={fields} values={values} /><button className="btn btn-sm mt-2" onClick={() => setEdit(true)}>Edit</button></>);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const r = await run("entity.update", { productId: pid, type, id, data: { ...v, ...extra } }); if (r.ok) setEdit(false); }}>
      {fields.map((f) => <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`ee-${id}-${f.key}`}><Input f={f} v={v[f.key]} set={(x) => setV({ ...v, [f.key]: x })} id={`ee-${id}-${f.key}`} /></Field>)}
      <ErrorText message={error} />
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending}>Save</button><button type="button" className="btn btn-sm" onClick={() => { setEdit(false); setError(null); }}>Cancel</button></div>
    </form>
  );
}

/** Dialog that opens from a button or from ?new=<type>. */
export function NewEntity({ pid, iid, type, fields, defaults, links, title, label, openOn, primary, gotoTemplate }: {
  pid: string; iid?: string; type: string; fields: FieldSpec[]; defaults?: Record<string, string>; links?: { type: string; id: string; relation: string; direction: "in" | "out" }[];
  title: string; label: string; openOn?: string; primary?: boolean; gotoTemplate?: string;
}) {
  const sp = useSearchParams(); const path = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(!!openOn && sp.get("new") === openOn);
  useEffect(() => { if (openOn && sp.get("new") === openOn) setOpen(true); }, [sp, openOn]);
  const init = () => Object.fromEntries(fields.map((f) => [f.key, defaults?.[f.key] ?? (f.kind === "select" ? f.options![0][0] : f.kind === "date" ? new Date().toISOString().slice(0, 10) : "")]));
  const [v, setV] = useState<Record<string, string>>(init);
  const { run, pending, error, setError } = useAction();
  const close = () => { setOpen(false); setError(null); if (sp.get("new")) router.replace(path); };
  return (<>
    <button type="button" className={`btn ${primary ? "btn-primary" : "btn-sm"}`} onClick={() => setOpen(true)}>{label}</button>
    <Modal open={open} onClose={close} title={title}>
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("entity.create", { productId: pid, initiativeId: iid, type, data: v, links }, { refresh: false }); if (r.ok) { close(); setV(init()); if (gotoTemplate) router.push(gotoTemplate.replace("{id}", r.data.id)); router.refresh(); } }}>
        {fields.map((f) => <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`ne-${type}-${f.key}`}><Input f={f} v={v[f.key]} set={(x) => setV({ ...v, [f.key]: x })} id={`ne-${type}-${f.key}`} /></Field>)}
        <ErrorText message={error} />
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={pending}>Save</button></div>
      </form>
    </Modal>
  </>);
}
