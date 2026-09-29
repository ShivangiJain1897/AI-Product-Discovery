import Link from "next/link";
import { all } from "@/lib/db";
import { listSources, listFindings, listOpportunities, listDecisions, listInitiatives, listTrash, getFinding, listOpportunities as lo } from "@/lib/queries";
import { AddEvidence } from "@/components/records";
import { FindingPanel, NewFinding, TabLinks } from "@/components/findings";
import { RestoreButton } from "@/components/product";
import { Empty } from "@/components/ui";
import { OriginBadge, StrengthBadge, Workspace } from "@/components/bits";
import { entityHref } from "@/lib/routes";
import { DECISION_TYPES, SOURCE_TYPES } from "@/lib/types";
import { AssistPanel } from "@/components/assist";

export const dynamic = "force-dynamic";

export default async function Knowledge({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { pid } = await params; const sp = await searchParams;
  const tab = sp.item?.startsWith("finding:") ? "findings" : sp.tab ?? "sources";
  const base = `/p/${pid}/knowledge`;
  const inis = listInitiatives(pid);
  const trash = listTrash(pid);
  const tabs = <TabLinks base={base} current={tab} tabs={[["sources", "Evidence"], ["findings", "Findings"], ["opportunities", "Opportunities"], ["decisions", "Decisions"], ["deleted", `Recently deleted${trash.length ? ` (${trash.length})` : ""}`]]} />;
  const filter = (
    <form className="card mb-3 flex flex-wrap items-end gap-3 p-3" role="search"><input type="hidden" name="tab" value={tab} />
      <div><label className="label" htmlFor="kq">Search</label><input id="kq" name="q" defaultValue={sp.q} className="input" /></div>
      <div><label className="label" htmlFor="ki">Discovery</label><select id="ki" name="i" defaultValue={sp.i ?? ""} className="input"><option value="">All</option>{inis.map((i) => <option key={i.id} value={i.id}>{i.title.slice(0, 45)}</option>)}</select></div>
      {tab === "sources" && <div><label className="label" htmlFor="kt">Kind</label><select id="kt" name="type" defaultValue={sp.type ?? ""} className="input"><option value="">All</option>{Object.entries(SOURCE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
      {tab === "findings" && <div><label className="label" htmlFor="ks">Status</label><select id="ks" name="status" defaultValue={sp.status ?? ""} className="input"><option value="">All</option><option value="accepted">Accepted</option><option value="dismissed">Dismissed</option><option value="superseded">Superseded</option></select></div>}
      <button className="btn">Apply</button><Link className="btn btn-quiet" href={`${base}?tab=${tab}`}>Clear</Link></form>
  );
  const header = (t: string, d: string, extra?: React.ReactNode) => <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[20px] font-semibold">Knowledge · {t}</h1><p className="text-[13.5px] text-muted">{d}</p></div>{extra}</div>;
  const iniName = (id?: string | null) => inis.find((i) => i.id === id)?.title;

  if (tab === "sources") {
    const s = listSources(pid, { q: sp.q, type: sp.type, initiativeId: sp.i || undefined });
    return <div className="mx-auto max-w-6xl space-y-4 px-6 py-5">{header("Evidence", "Every source in this product, stored once and reused across discoveries and analyses.", <AddEvidence pid={pid} initiatives={inis.map((i) => ({ id: i.id, title: i.title }))} primary />)}{tabs}{filter}
      {s.length === 0 ? <Empty title="No evidence matches" action={<Link className="btn btn-primary" href={`${base}?add=1`}>Add evidence</Link>}>Paste text or upload .txt, .md or .csv files. Originals are preserved exactly.</Empty> :
        <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Title</th><th>Kind</th><th>Who / segment</th><th>Date</th><th>Used in</th><th className="text-right">Excerpts</th></tr></thead><tbody>{s.map((x) => <tr key={x.id}><td><Link className="font-medium hover:underline" href={`/p/${pid}/sources/${x.id}`}>{x.title}</Link>{x.synthetic ? <span className="badge badge-warn ml-1.5">Synthetic</span> : null}{x.version > 1 && <span className="badge ml-1.5">v{x.version}</span>}</td><td>{SOURCE_TYPES[x.source_type]}</td><td>{[x.participant, x.segment].filter(Boolean).join(" · ") || "—"}</td><td className="whitespace-nowrap">{x.source_date ?? "—"}</td><td>{x.initiatives.length ? x.initiatives.map((i: any) => i.title.slice(0, 26)).join(", ") : <span className="text-muted">product only</span>}</td><td className="text-right">{x.excerptCount}</td></tr>)}</tbody></table></div>}</div>;
  }
  if (tab === "findings") {
    const f = listFindings(pid, { q: sp.q, initiativeId: sp.i || undefined, status: sp.status || undefined });
    const selId = sp.item?.startsWith("finding:") ? sp.item.slice(8) : null;
    let panel: React.ReactNode = null;
    if (selId) { try { const fv = getFinding(pid, selId); const opps = lo(pid).map((o) => ({ type: "opportunity", id: o.id, label: o.title })); const linked = new Set([...fv.supporting, ...fv.contradicting].map((e: any) => e.id)); const ex = all<any>("SELECT e.id, e.text FROM excerpts e JOIN sources s ON s.id=e.source_id WHERE e.product_id=? AND s.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 80", pid).filter((e) => !linked.has(e.id)).map((e) => ({ type: "excerpt", id: e.id, label: e.text })); panel = <FindingPanel pid={pid} iid={fv.initiative_id ?? undefined} f={fv} opportunityCandidates={opps} excerptCandidates={ex} mergeTargets={f.filter((x) => x.id !== selId && x.status === "accepted").map((x) => ({ id: x.id, statement: x.statement }))} closeHref={`${base}?tab=findings`} />; } catch { /* ignore */ } }
    return <Workspace panel={panel} main={<>{header("Findings", "Accepted findings, proposed interpretations and superseded conclusions stay distinct. Each keeps its segment and date — don’t treat one as true for everyone.", <NewFinding pid={pid} />)}<div>{tabs}{filter}
      {f.length === 0 ? <Empty title="No findings match">Findings are created from evidence in a discovery.</Empty> : <ul className="space-y-2">{f.map((x) => <li key={x.id}><Link href={`${base}?tab=findings&item=finding:${x.id}`} className="card block px-4 py-3 hover:border-accent"><p className="text-[14.5px] font-medium">{x.statement}</p><div className="mt-1.5 flex flex-wrap items-center gap-1.5"><StrengthBadge s={x.strength} /><span className={`badge ${x.status === "accepted" ? "badge-accent" : ""} capitalize`}>{x.status === "accepted" ? "Accepted" : x.status}</span>{x.segment && <span className="badge">Segment: {x.segment}</span>}<span className="badge">{x.created_at.slice(0, 10)}</span>{iniName(x.initiative_id) && <span className="badge">{iniName(x.initiative_id)!.slice(0, 32)}</span>}{x.needs_review ? <span className="badge badge-warn">Needs review</span> : null}<OriginBadge origin={x.origin} /></div></Link></li>)}</ul>}</div></>} />;
  }
  if (tab === "opportunities") {
    const o = listOpportunities(pid, sp.i || undefined).filter((x) => !sp.q || (x.title + x.problem).toLowerCase().includes(sp.q.toLowerCase()));
    return <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">{header("Opportunities", "Problems worth addressing, across all discoveries. Open one in its discovery to edit.")}{tabs}{filter}
      {o.length === 0 ? <Empty title="No opportunities match" /> : <ul className="space-y-2">{o.map((x) => <li key={x.id} className="card px-4 py-3"><Link className="text-[14.5px] font-medium hover:underline" href={entityHref(pid, "opportunity", x.id, x.initiative_id)}>{x.title}</Link><p className="text-[13px] text-muted">{x.segment && `For ${x.segment} · `}{iniName(x.initiative_id) ?? "product-level"} · {x.concepts.length} concept(s) · {x.findings.length} finding(s)</p></li>)}</ul>}</div>;
  }
  if (tab === "decisions") {
    const d = listDecisions(pid, sp.i || undefined).filter((x) => !sp.q || (x.statement + x.rationale).toLowerCase().includes(sp.q.toLowerCase()));
    return <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">{header("Decisions", "Every decision with the evidence trail behind it.")}{tabs}{filter}
      {d.length === 0 ? <Empty title="No decisions match" /> : <ul className="space-y-2">{d.map((x) => <li key={x.id} className="card px-4 py-3"><span className="badge badge-accent mr-1.5">{DECISION_TYPES[x.decision_type]}</span><span className="text-[12.5px] text-muted">{x.decided_on}</span>{x.status === "superseded" && <span className="badge ml-1.5">Superseded</span>}{x.needs_review ? <span className="badge badge-warn ml-1.5">Ready for review</span> : null}<p><Link className="text-[14.5px] font-medium hover:underline" href={entityHref(pid, "decision", x.id, x.initiative_id)}>{x.statement}</Link></p><p className="text-[12.5px] text-muted">{iniName(x.initiative_id)} · rests on {x.trace.findings.length} finding(s), {x.trace.experiments.length} experiment(s), {x.trace.runs.length} analysis run(s)</p></li>)}</ul>}</div>;
  }
  return <div className="mx-auto max-w-4xl space-y-4 px-6 py-5">{header("Recently deleted", "Deleted records are kept so nothing is lost by accident. Restoring brings back their relationships.")}{tabs}
    {trash.length === 0 ? <Empty title="Nothing deleted" /> : <ul className="card divide-y divide-line">{trash.map((t) => <li key={t.type + t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]"><span><span className="badge mr-2">{t.type.replace("_", " ")}</span>{t.label} <span className="text-muted">· deleted {t.deleted_at.slice(0, 10)}</span></span><RestoreButton pid={pid} type={t.type} id={t.id} /></li>)}</ul>}</div>;
  void AssistPanel;
}
