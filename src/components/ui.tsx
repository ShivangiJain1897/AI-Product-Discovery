"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useSaveState } from "@/lib/client";

export function SaveIndicator() {
  const s = useSaveState();
  return (
    <div role="status" aria-live="polite" className="min-w-[110px] text-right text-[12.5px]">
      {s.status === "saving" && <span className="text-muted">Saving…</span>}
      {s.status === "saved" && <span className="text-accent-strong">✓ Saved</span>}
      {s.status === "failed" && <span className="text-danger" title={s.message}>⚠ Not saved</span>}
      {s.status === "failed" && <span className="sr-only">{s.message}</span>}
    </div>
  );
}

export function SaveErrorBanner() {
  const s = useSaveState();
  if (s.status !== "failed") return null;
  return <div role="alert" className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">{s.message}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-xl"} rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30`}>
      {open && (
        <div className="max-h-[85vh] overflow-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={id} className="text-[17px] font-semibold">{title}</h2>
            <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close dialog">✕</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-3">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <p role="alert" className="mb-2 text-[13px] text-danger">{message}</p> : null;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-5 py-7 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[13.5px] text-muted">{children}</p>}
      {action && <div className="mt-3 flex justify-center gap-2">{action}</div>}
    </div>
  );
}
