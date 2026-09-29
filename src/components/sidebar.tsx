"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icon";
import type { SidebarData } from "@/lib/sidebar";

/** Responsive frame: a fixed left rail on desktop, a slide-in drawer on small screens. */
export function SidebarFrame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" className="btn fixed left-3 top-2.5 z-30 !px-2.5 md:hidden no-print" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="list" size={17} />Menu</button>
      {open && <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside aria-label="Main navigation" className={`no-print shrink-0 flex-col gap-0 overflow-y-auto border-r border-line bg-[#f4f0e9] px-3 py-4 ${open ? "fixed inset-y-0 left-0 z-50 flex w-72 shadow-2xl" : "hidden"} md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shadow-none`}>
        {open && <button type="button" className="btn btn-quiet btn-sm mb-2 self-end md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>}
        {children}
      </aside>
    </>
  );
}

export function Item({ href, icon, children, exact, dot, small }: { href: string; icon?: string; children: ReactNode; exact?: boolean; dot?: "on" | "off"; small?: boolean }) {
  const path = usePathname();
  const base = href.split("?")[0];
  const active = exact ? path === base : path === base || path.startsWith(base + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 ${small ? "py-1 text-[13px]" : "py-1.5 text-[13.5px]"} transition-colors ${active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink hover:bg-sunken"}`}>
      {icon && <Icon name={icon} size={small ? 15 : 17} className={active ? "text-accent" : "text-muted group-hover:text-ink"} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {dot && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot === "on" ? "bg-accent" : "bg-line-strong"}`} title={dot === "on" ? "Started" : "Not started"} />}
    </Link>
  );
}

export function Group({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-1 flex items-center justify-between px-2.5"><p className="h-section">{label}</p>{action}</div>
      {children}
    </div>
  );
}

const TYPE_ICON: Record<string, string> = { idea: "bulb", problem: "alert", requirement: "check", question: "help" };

/** The topic list. The topic you are in expands to show its work and its knowledge views. */
export function TopicNav({ pid, topics }: { pid: string; topics: SidebarData["topics"] }) {
  const path = usePathname();
  const inTopic = path.match(/\/i\/([^/]+)/)?.[1];
  const aid = path.match(/\/analyses\/([^/]+)/)?.[1];
  const current = inTopic ?? topics.find((t) => t.work.some((w) => w.id === aid))?.id;
  const open = topics.filter((t) => t.status === "active");
  const rest = topics.filter((t) => t.status !== "active");
  const row = (t: SidebarData["topics"][number]) => {
    const b = `/p/${pid}/i/${t.id}`;
    const expanded = current === t.id;
    return (
      <li key={t.id}>
        <Item href={b} icon={TYPE_ICON[t.topic_type] ?? "help"} exact={!expanded} dot={undefined}>{t.title}</Item>
        {expanded && (
          <div className="ml-[18px] mt-0.5 border-l border-line pb-1 pl-2">
            <Item href={b} exact small icon="home">Work</Item>
            {t.work.length > 0 && <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">Your work</p>}
            {t.work.map((w) => <Item key={w.id} href={`/p/${pid}/analyses/${w.id}`} small icon={w.icon} dot={w.started ? "on" : "off"}>{w.title}</Item>)}
            <p className="px-2.5 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">Evidence & decisions</p>
            <Item href={`${b}/evidence`} small icon="book">Evidence</Item>
            <Item href={`${b}/explore`} small icon="compass">Explore</Item>
            <Item href={`${b}/validate`} small icon="flask">Validate</Item>
            <Item href={`${b}/decide`} small icon="check">Decide</Item>
            <Item href={`${b}/brief`} small icon="file">Brief</Item>
          </div>
        )}
      </li>
    );
  };
  return (
    <div>
      <ul className="space-y-0.5">{open.map(row)}</ul>
      {rest.length > 0 && (
        <details className="mt-2" open={rest.some((r) => r.id === current)}>
          <summary className="cursor-pointer px-2.5 py-1 text-[12px] text-muted">Paused & completed ({rest.length})</summary>
          <ul className="mt-0.5 space-y-0.5">{rest.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

export function ProductSwitch({ current, products }: { current: { id: string; name: string }; products: SidebarData["products"] }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13.5px] font-medium shadow-[var(--shadow-card)] hover:bg-sunken" aria-label={`Switch product. Current: ${current.name}`}>
        <span className="flex min-w-0 items-center gap-2"><Icon name="folder" size={16} className="text-accent" /><span className="truncate">{current.name}</span></span><Icon name="down" size={15} className="text-muted" />
      </summary>
      <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-lift)]">
        <p className="px-2 py-1 text-[11.5px] uppercase tracking-wide text-muted">Switch product</p>
        {products.map((p) => <Link key={p.id} href={`/p/${p.id}`} className={`block truncate rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-sunken ${p.id === current.id ? "font-medium text-accent-strong" : ""}`}>{p.name}</Link>)}
        <div className="mt-1 border-t border-line pt-1">
          <Link href="/" className="block rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-sunken">All products…</Link>
          <Link href="/?new=product" className="block rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-sunken">+ Add a product</Link>
        </div>
      </div>
    </details>
  );
}
