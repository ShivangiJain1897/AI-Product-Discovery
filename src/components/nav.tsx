"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { SaveIndicator } from "./ui";

export function NavLink({ href, children, exact, className = "" }: { href: string; children: ReactNode; exact?: boolean; className?: string }) {
  const path = usePathname();
  const base = href.split("?")[0];
  const active = exact ? path === base : path === base || path.startsWith(base + "/");
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`block rounded-md px-2.5 py-1.5 text-[13.5px] ${active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink hover:bg-sunken"} ${className}`}>
      {children}
    </Link>
  );
}

type Ini = { id: string; title: string; status: string };
export function InitiativeNav({ pid, initiatives }: { pid: string; initiatives: Ini[] }) {
  const path = usePathname();
  const cur = path.match(/\/i\/([^/]+)/)?.[1];
  const open = initiatives.filter((i) => i.status === "active");
  const rest = initiatives.filter((i) => i.status !== "active");
  const item = (i: Ini) => {
    const base = `/p/${pid}/i/${i.id}`;
    const expanded = cur === i.id;
    return (
      <li key={i.id}>
        <NavLink href={base} exact={!expanded} className="!py-1">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${i.status === "active" ? "bg-accent" : i.status === "paused" ? "bg-warn" : "bg-line-strong"}`} />
            <span className="line-clamp-2">{i.title}</span>
          </span>
        </NavLink>
        {expanded && (
          <ul className="ml-3.5 mt-0.5 border-l border-line pl-2">
            {[["Work", ""], ["Evidence", "/evidence"], ["Explore", "/explore"], ["Validate", "/validate"], ["Decide", "/decide"], ["Brief", "/brief"]].map(([l, s]) => (
              <li key={l}><NavLink href={base + s} exact={s === ""} className="!py-1 !text-[13px]">{l}</NavLink></li>
            ))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <div>
      <ul className="space-y-0.5">{open.map(item)}</ul>
      {rest.length > 0 && (
        <details className="mt-2" open={!!rest.find((r) => r.id === cur)}>
          <summary className="cursor-pointer px-2.5 py-1 text-[12px] text-muted">Paused & completed ({rest.length})</summary>
          <ul className="mt-0.5 space-y-0.5">{rest.map(item)}</ul>
        </details>
      )}
    </div>
  );
}

export function ProductSwitcher({ current, products }: { current: { id: string; name: string }; products: { id: string; name: string }[] }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 py-2 text-[13.5px] font-medium hover:bg-sunken" aria-label={`Switch product. Current: ${current.name}`}>
        <span className="truncate">{current.name}</span><span aria-hidden className="text-muted">⌄</span>
      </summary>
      <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-line-strong bg-surface p-1 shadow-lg">
        <p className="px-2 py-1 text-[11.5px] uppercase tracking-wide text-muted">Switch product</p>
        {products.map((p) => (
          <Link key={p.id} href={`/p/${p.id}`} className={`block truncate rounded px-2 py-1.5 text-[13.5px] hover:bg-sunken ${p.id === current.id ? "font-medium text-accent-strong" : ""}`}>{p.name}</Link>
        ))}
        <div className="mt-1 border-t border-line pt-1">
          <Link href="/" className="block rounded px-2 py-1.5 text-[13.5px] hover:bg-sunken">All products…</Link>
          <Link href="/?new=product" className="block rounded px-2 py-1.5 text-[13.5px] hover:bg-sunken">+ Add a product</Link>
        </div>
      </div>
    </details>
  );
}

type TopProps = { product: { id: string; name: string; is_demo: number }; initiatives: Ini[]; aiMode: "live" | "demo" };
const SECTION_LABEL: Record<string, string> = { evidence: "Evidence", explore: "Explore", validate: "Validate", decide: "Decide", brief: "Brief", discovery: "Topics", analyses: "Outputs", knowledge: "Knowledge", experiments: "Experiments", activity: "Activity", search: "Search", sources: "Evidence", maps: "Process map", new: "New topic", eventlog: "Event-log import" };

export function TopBar({ product, initiatives, aiMode }: TopProps) {
  const path = usePathname();
  const sp = useSearchParams();
  const parts = path.split("/").filter(Boolean); // p, pid, ...
  const rest = parts.slice(2);
  const iid = rest[0] === "i" ? rest[1] : undefined;
  const ini = iid ? initiatives.find((i) => i.id === iid) : undefined;
  const section = iid ? rest[2] : rest[0];
  const crumbs: { label: string; href?: string }[] = [{ label: "My Products", href: "/" }, { label: product.name, href: `/p/${product.id}` }];
  if (ini) crumbs.push({ label: ini.title, href: `/p/${product.id}/i/${ini.id}` });
  if (section && SECTION_LABEL[section] && !(iid && !rest[2])) crumbs.push({ label: SECTION_LABEL[section] });
  const base = `/p/${product.id}`;
  let action: { label: string; href: string } | null = null;
  if (iid) {
    const b = `${base}/i/${iid}`;
    if (!section) action = { label: "Add evidence", href: `${b}/evidence?add=1` };
    else if (section === "evidence") action = { label: "Add evidence", href: `${b}/evidence?add=1` };
    else if (section === "explore") action = { label: "Add opportunity", href: `${b}/explore?new=opportunity` };
    else if (section === "validate") action = { label: "Design an experiment", href: `${b}/validate?new=experiment` };
    else if (section === "decide") action = { label: "Record a decision", href: `${b}/decide?new=decision` };
    else if (section === "brief") action = { label: "Print view", href: `${b}/brief/print` };
  } else if (!section) action = { label: "New topic", href: `${base}/new` };
  else if (section === "discovery") action = { label: "New topic", href: `${base}/new` };
  else if (section === "analyses" && rest.length === 1) action = { label: "New output", href: `${base}/analyses?new=1` };
  else if (section === "knowledge") action = { label: "Add evidence", href: `${base}/knowledge?add=1` };
  void sp;
  return (
    <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/95 px-5 py-2.5 backdrop-blur">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-[13.5px] text-muted">
          {crumbs.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {c.href && i < crumbs.length - 1 ? <a href={c.href} className="truncate hover:text-ink hover:underline">{c.label}</a> : <span className="truncate font-medium text-ink" aria-current="page">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <form action={`${base}/search`} role="search" className="hidden md:block">
        <label className="sr-only" htmlFor="q">Search this product</label>
        <input id="q" name="q" type="search" placeholder="Search this product…" className="input !w-56 !py-1" />
      </form>
      <span className={`badge hidden lg:inline-flex ${aiMode === "live" ? "badge-accent" : "badge-warn"}`} title={aiMode === "live" ? "Proposals come from a live model" : "No API key: proposals are keyword/template samples, not model output"}>
        AI: {aiMode === "live" ? "live model" : "demo mode"}
      </span>
      <SaveIndicator />
      {action && <a href={action.href} className="btn btn-primary whitespace-nowrap">{action.label}</a>}
    </header>
  );
}
