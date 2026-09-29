import Link from "next/link";
import type { ReactNode } from "react";
import { ago } from "@/lib/format";
import type { StrengthInfo } from "@/lib/strength";
import { entityHref, TYPE_LABEL } from "@/lib/routes";

export function Workspace({ main, panel }: { main: ReactNode; panel?: ReactNode }) {
  return (
    <div className={`grid gap-5 px-6 py-5 ${panel ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""}`}>
      <div className="min-w-0 space-y-5">{main}</div>
      {panel && <aside aria-label="Details and assistance" className="no-print min-w-0 xl:sticky xl:top-[57px] xl:max-h-[calc(100vh-70px)] xl:self-start xl:overflow-y-auto">{panel}</aside>}
    </div>
  );
}

export function Section({ title, hint, action, children, id }: { title: string; hint?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ?? undefined} className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div><h2 id={id} className="text-[16px] font-semibold">{title}</h2>{hint && <p className="text-[13px] text-muted">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StrengthBadge({ s, withWhy }: { s: StrengthInfo; withWhy?: boolean }) {
  const cls = s.level === "strong" ? "badge-accent" : s.level === "moderate" ? "" : s.level === "weak" ? "badge-warn" : "badge-danger";
  const dataOnly = s.excerpts === 0 && s.level !== "unknown";
  const label = s.level === "unknown" ? "No support yet" : `${s.level[0].toUpperCase()}${s.level.slice(1)} evidence`;
  return (
    <span>
      <span className={`badge ${cls}`} title={s.explanation}>{label}{dataOnly ? " · operational data, cause unknown" : s.level !== "unknown" ? ` · ${s.excerpts} excerpt${s.excerpts === 1 ? "" : "s"} / ${s.independent} independent` : ""}</span>
      {withWhy && <span className="mt-1 block text-[12.5px] text-muted">{s.explanation}</span>}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: string }) {
  if (origin === "ai-demo") return <span className="badge badge-warn" title="Created from a demo-mode sample proposal">Demo AI sample</span>;
  if (origin === "ai-live") return <span className="badge badge-accent" title="Created from a live model proposal that you accepted">AI proposal, accepted</span>;
  if (origin === "analysis") return <span className="badge" title="Derived from an analysis metric">From data</span>;
  return null;
}

export function ActivityFeed({ items, pid, limit = 8 }: { items: { id: string; summary: string; created_at: string; entity_type?: string | null; entity_id?: string | null; initiative_id?: string | null }[]; pid: string; limit?: number }) {
  if (!items.length) return <p className="text-[13.5px] text-muted">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-1.5">
      {items.slice(0, limit).map((a) => (
        <li key={a.id} className="flex gap-3 text-[13.5px]">
          <span className="w-20 shrink-0 text-[12px] text-muted">{ago(a.created_at)}</span>
          {a.entity_type && a.entity_id && a.entity_type !== "product" ? <Link className="min-w-0 hover:underline" href={entityHref(pid, a.entity_type, a.entity_id, a.initiative_id)}>{a.summary}</Link> : <span className="min-w-0">{a.summary}</span>}
        </li>
      ))}
    </ol>
  );
}

export function TypeChip({ type }: { type: string }) { return <span className="badge">{TYPE_LABEL[type] ?? type}</span>; }

export function Related({ pid, iid, items }: { pid: string; iid?: string | null; items: { linkId: string; relation: string; direction: string; type: string; id: string; label: string }[] }) {
  if (!items.length) return <p className="text-[13px] text-muted">Nothing linked yet.</p>;
  return (
    <ul className="space-y-1">
      {items.map((r) => (
        <li key={r.linkId} className="text-[13px]">
          <span className="text-muted">{r.direction === "in" ? `${r.relation} ←` : `→ ${r.relation}`} </span>
          <TypeChip type={r.type} /> <Link className="hover:underline" href={entityHref(pid, r.type, r.id, iid)}>{r.label}</Link>
        </li>
      ))}
    </ul>
  );
}
