import Link from "next/link";
import { all } from "@/lib/db";
import { getInitiative, listFindings, listOpportunities, listSources, getFinding } from "@/lib/queries";
import { AddEvidence } from "@/components/records";
import { EvidenceBoard } from "@/components/evidence-board";
import { FindingPanel, NewFinding, TabLinks } from "@/components/findings";
import { AssistPanel } from "@/components/assist";
import { Empty } from "@/components/ui";
import { OriginBadge, StrengthBadge, Workspace, Section } from "@/components/bits";

export const dynamic = "force-dynamic";

export default async function Evidence({ params, searchParams }: { params: Promise<{ pid: string; iid: string }>; searchParams: Promise<{ tab?: string; item?: string }> }) {
  const { pid, iid } = await params; const sp = await searchParams;
  const tab = sp.tab === "findings" || sp.item?.startsWith("finding:") ? "findings" : "sources";
  const ini = getInitiative(pid, iid);
  const base = `/p/${pid}/i/${iid}/evidence`;
  const tabs = <TabLinks base={base} current={tab} tabs={[["sources", "Sources"], ["findings", "What we learned"]]} />;
  const pending = all<any>("SELECT id, kind, mode FROM ai_proposals WHERE product_id=? AND initiative_id=? AND status='pending' ORDER BY created_at DESC", pid, iid);

  if (tab === "sources") {
    const sources = listSources(pid, { initiativeId: iid });
    const inInitiative = new Set(sources.map((s) => s.id));
    const unlinked = listSources(pid).filter((s) => !inInitiative.has(s.id));
    return (
      <div className="px-6 py-5">
        <div className="mb-1 flex items-end justify-between gap-3"><div><h2 className="text-[17px] font-semibold">Evidence</h2><p className="text-[13.5px] text-muted">What do I have? Originals are kept exactly as imported. Supported: pasted text, .txt, .md, .csv.</p></div><AddEvidence pid={pid} iid={iid} primary /></div>
        {tabs}
        {sources.length === 0 ? (
          <Empty title="No evidence yet" action={<Link className="btn btn-primary" href={`${base}?add=1`}>Paste or upload your first source</Link>}>Interview notes, support tickets, a process document or an event-log CSV all work. Rough is fine. What is missing is usually more informative than what is polished.</Empty>
        ) : <EvidenceBoard pid={pid} iid={iid} sources={sources as any} unlinked={unlinked as any} pending={pending.filter((p) => ["synthesis", "process_draft"].includes(p.kind))} question={ini.question} />}
      </div>
    );
  }

  const findings = listFindings(pid, { initiativeId: iid }).filter((f) => f.status !== "dismissed" || sp.item === `finding:${f.id}`);
  const selId = sp.item?.startsWith("finding:") ? sp.item.slice(8) : null;
  let panel: React.ReactNode = null;
  if (selId) {
    try {
      const f = getFinding(pid, selId);
      const opps = listOpportunities(pid, iid).map((o) => ({ type: "opportunity", id: o.id, label: o.title }));
      const linked = new Set([...f.supporting, ...f.contradicting].map((e: any) => e.id));
      const excerpts = all<any>("SELECT e.id, e.text FROM excerpts e JOIN sources s ON s.id=e.source_id WHERE e.product_id=? AND s.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 80", pid).filter((e) => !linked.has(e.id)).map((e) => ({ type: "excerpt", id: e.id, label: e.text }));
      const merge = findings.filter((x) => x.id !== selId && x.status === "accepted").map((x) => ({ id: x.id, statement: x.statement }));
      panel = (
        <div className="space-y-3">
          <FindingPanel pid={pid} iid={iid} f={f} opportunityCandidates={opps} excerptCandidates={excerpts} mergeTargets={merge} closeHref={`${base}?tab=findings`} />
          <AssistPanel pid={pid} title="Challenge this finding" pending={pending.filter((p) => p.kind === "challenge")} actions={[{ kind: "challenge", label: "Challenge this finding", hint: "Alternative explanations, missing evidence, and what would change our view.", scope: { sourceIds: [], initiativeId: iid, targetType: "finding", targetId: selId } }]} />
        </div>
      );
    } catch { panel = null; }
  }
  return (
    <Workspace panel={panel} main={<>
      <div className="flex items-end justify-between gap-3"><div><h2 className="text-[17px] font-semibold">What we learned</h2><p className="text-[13.5px] text-muted">Findings are interpretations. Each one shows the evidence under it and how independent that evidence is.</p></div><NewFinding pid={pid} iid={iid} /></div>
      <div>{tabs}
        {findings.length === 0 ? <Empty title="No findings yet" action={<Link className="btn btn-primary" href={`${base}`}>Go to sources</Link>}>Open a source, highlight what matters, and state what it tells you. Or select sources and ask for candidate findings.</Empty> : (
          <ul className="space-y-2">{findings.map((f) => (
            <li key={f.id}><Link href={`${base}?tab=findings&item=finding:${f.id}`} className={`card block px-4 py-3 hover:border-accent ${selId === f.id ? "border-accent bg-accent-soft/40" : ""}`}>
              <p className="text-[14.5px] font-medium">{f.statement}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><StrengthBadge s={f.strength} />{f.segment && <span className="badge">{f.segment}</span>}{f.status !== "accepted" && <span className="badge capitalize">{f.status}</span>}{f.needs_review ? <span className="badge badge-warn">Needs review</span> : null}<OriginBadge origin={f.origin} /></div>
            </Link></li>))}</ul>)}
      </div>
    </>} />
  );
}
void Section;
