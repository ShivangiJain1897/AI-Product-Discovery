import Link from "next/link";
import { searchProduct } from "@/lib/queries";
import { entityHref, TYPE_LABEL } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function Search({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<{ q?: string; type?: string }> }) {
  const { pid } = await params; const sp = await searchParams;
  const q = sp.q ?? "";
  const all = searchProduct(pid, q);
  const hits = sp.type ? all.filter((h) => h.type === sp.type) : all;
  const types = [...new Set(all.map((h) => h.type))];
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <h1 className="text-[20px] font-semibold">Search this product</h1><p className="mb-3 text-[13.5px] text-muted">Only this product’s evidence, findings, opportunities, decisions and analyses are searched. Other products are never included.</p>
      <form role="search" className="mb-4 flex gap-2"><label className="sr-only" htmlFor="sq">Search</label><input id="sq" name="q" defaultValue={q} className="input" placeholder="Search knowledge…" autoFocus /><button className="btn btn-primary">Search</button></form>
      {q.length >= 2 && types.length > 1 && <div className="mb-3 flex flex-wrap gap-1.5"><Link className={`badge ${!sp.type ? "badge-accent" : ""}`} href={`?q=${encodeURIComponent(q)}`}>All ({all.length})</Link>{types.map((t) => <Link key={t} className={`badge ${sp.type === t ? "badge-accent" : ""}`} href={`?q=${encodeURIComponent(q)}&type=${t}`}>{TYPE_LABEL[t]} ({all.filter((h) => h.type === t).length})</Link>)}</div>}
      {q.length >= 2 && hits.length === 0 && <p className="text-[14px] text-muted">Nothing in this product matches “{q}”.</p>}
      <ul className="space-y-2">{hits.map((h) => <li key={h.type + h.id} className="card px-4 py-2.5"><span className="badge mr-2">{TYPE_LABEL[h.type]}</span><Link className="text-[14px] font-medium hover:underline" href={entityHref(pid, h.type, h.id, h.initiativeId)}>{h.title.slice(0, 120)}</Link><p className="mt-0.5 text-[13px] text-muted">{h.snippet}</p></li>)}</ul>
    </div>
  );
}
