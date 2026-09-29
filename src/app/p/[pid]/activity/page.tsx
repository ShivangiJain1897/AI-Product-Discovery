import Link from "next/link";
import { activityList, listInitiatives } from "@/lib/queries";
import { entityHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<{ i?: string; kind?: string }> }) {
  const { pid } = await params; const sp = await searchParams;
  const items = activityList(pid, { initiativeId: sp.i || undefined, kind: sp.kind || undefined, limit: 300 });
  const inis = listInitiatives(pid);
  const days = new Map<string, typeof items>();
  for (const a of items) { const d = a.created_at.slice(0, 10); days.set(d, [...(days.get(d) ?? []), a]); }
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <h1 className="text-[20px] font-semibold">Activity history</h1><p className="mb-3 text-[13.5px] text-muted">A chronological record of what changed in this product, newest first.</p>
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3"><div><label className="label" htmlFor="ai">Discovery</label><select id="ai" name="i" defaultValue={sp.i ?? ""} className="input"><option value="">All</option>{inis.map((i) => <option key={i.id} value={i.id}>{i.title.slice(0, 50)}</option>)}</select></div>
        <div><label className="label" htmlFor="ak">Kind</label><select id="ak" name="kind" defaultValue={sp.kind ?? ""} className="input"><option value="">All</option>{["created", "updated", "evidence_added", "evidence_changed", "run", "accepted", "status", "deleted", "restored", "merged"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select></div><button className="btn">Filter</button></form>
      {[...days].map(([d, list]) => (
        <section key={d} className="mb-4"><h2 className="h-section mb-1">{d}</h2><ul className="card divide-y divide-line">{list.map((a) => (
          <li key={a.id} className="flex gap-3 px-4 py-2 text-[13.5px]"><span className="w-12 shrink-0 text-[12px] text-muted">{a.created_at.slice(11, 16)}</span><span className="badge shrink-0">{a.kind.replace("_", " ")}</span>{a.entity_type && a.entity_id && a.entity_type !== "product" ? <Link className="hover:underline" href={entityHref(pid, a.entity_type, a.entity_id, a.initiative_id)}>{a.summary}</Link> : <span>{a.summary}</span>}</li>))}</ul></section>))}
      {items.length === 0 && <p className="text-[13.5px] text-muted">No activity matches.</p>}
    </div>
  );
}
