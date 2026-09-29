import { notFound } from "next/navigation";
import { getInitiative } from "@/lib/queries";
import { NavLink } from "@/components/nav";
import { StatusActions } from "@/components/initiative";

export const dynamic = "force-dynamic";

export default async function InitiativeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pid: string; iid: string }> }) {
  const { pid, iid } = await params;
  let i;
  try { i = getInitiative(pid, iid); } catch { notFound(); }
  const b = `/p/${pid}/i/${iid}`;
  return (
    <div>
      <div className="border-b border-line bg-surface px-6 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold leading-tight">{i.title}</h1>
              <span className={`badge ${i.status === "active" ? "badge-accent" : i.status === "paused" ? "badge-warn" : ""}`}>{i.status === "completed" ? "Completed" : i.status === "paused" ? "Paused" : i.status === "archived" ? "Archived" : "Active"}</span>
              {i.is_demo ? <span className="badge badge-warn" title="Synthetic data for illustration">Demo · synthetic data</span> : null}
            </div>
            {i.status === "completed" && <p className="mt-1 text-[12.5px] text-muted">Completed work stays part of the product’s knowledge. Reopen it if the question is alive again.</p>}
          </div>
          <StatusActions pid={pid} iid={iid} status={i.status} />
        </div>
        <nav aria-label="Discovery sections" className="-mb-px mt-3 flex gap-1 overflow-x-auto">
          {[["Work", ""], ["Evidence", "/evidence"], ["Explore", "/explore"], ["Validate", "/validate"], ["Decide", "/decide"], ["Brief", "/brief"]].map(([l, s]) => (
            <NavLink key={l} href={b + s} exact={s === ""} className="!rounded-b-none !rounded-t-md border-b-2 !px-3.5 !py-2 [&[aria-current=page]]:border-accent [&:not([aria-current=page])]:border-transparent">{l}</NavLink>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
