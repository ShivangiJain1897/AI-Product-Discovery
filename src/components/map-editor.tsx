"use client";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, applyNodeChanges, type Node, type Edge, type NodeChange, type Connection, type NodeProps } from "@xyflow/react";
import { useAction } from "@/lib/client";
import { ErrorText, Field } from "./ui";
import { evalFormula } from "@/lib/formula";

type PNode = { id: string; stable_id: string; type: "start" | "activity" | "decision" | "end"; name: string; description: string; actor: string; system: string; inputs: string; outputs: string; timing: string; pain_points: string; controls: string; provenance: "evidence" | "inferred" | "manual"; x: number; y: number; evidence: { linkId: string; excerptId: string; text: string; sourceId: string; sourceTitle: string }[]; opportunities: { linkId: string; id: string; title: string }[] };
type PEdge = { id: string; source_stable_id: string; target_stable_id: string; label: string };
type Change = { stable_id: string; what: string; why: string; addresses: string; expected_outcome: string; dependencies: string; risks: string; assumptions: string };
type Diff = { stableId: string; status: string; changed: string[]; before?: PNode; after?: PNode };
type Scenario = { label: string; unit: string; formula: string; inputs: { name: string; value: number | null; unit: string; note: string }[] };
type Cand = { id: string; label: string };

function StepNode({ data, selected }: NodeProps<Node<{ n: PNode; status?: string }>>) {
  const n = data.n;
  const shape = n.type === "start" || n.type === "end" ? "rounded-full px-4" : n.type === "decision" ? "rounded-md border-2 !border-accent" : "rounded-md";
  const ring = selected ? "ring-2 ring-accent" : "";
  const st = data.status === "added" ? "!border-accent !bg-accent-soft" : data.status === "modified" ? "!border-warn !bg-warn-soft" : "";
  return (
    <div className={`min-w-[150px] max-w-[190px] border bg-surface px-3 py-2 text-[12.5px] shadow-sm ${shape} ${ring} ${st} ${n.provenance === "inferred" ? "border-dashed border-warn" : "border-line-strong"}`}>
      <Handle type="target" position={Position.Left} />
      <p className="font-medium leading-snug">{n.type === "decision" ? "◇ " : ""}{n.name}</p>
      {n.actor && <p className="text-[11.5px] text-muted">{n.actor}</p>}
      <div className="mt-0.5 flex flex-wrap gap-1">
        {n.provenance === "inferred" && <span className="badge badge-warn !text-[10.5px]">inferred</span>}
        {n.pain_points && <span className="badge badge-danger !text-[10.5px]" title={n.pain_points}>pain</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { step: StepNode };

export function MapEditor({ pid, map, nodes: initNodes, edges: initEdges, changes, diff, baseline, warnings, evidenceCands, oppCands, selected: initSel, view: initView, baselineStale, siblings }: {
  pid: string; map: { id: string; name: string; kind: string; description: string; scenario: Scenario | null; initiative_id: string | null; updated_at: string };
  nodes: PNode[]; edges: PEdge[]; changes: Change[]; diff: Diff[] | null; baseline: { name: string; takenAt: string; nodes: PNode[]; edges: PEdge[]; activities: number; handoffs: number } | null; warnings: string[];
  evidenceCands: Cand[]; oppCands: Cand[]; selected?: string; view?: string; baselineStale: boolean; siblings: { id: string; name: string; kind: string }[];
}) {
  const { run, pending, error, setError, router } = useAction();
  const [view, setView] = useState<"map" | "table" | "compare">((initView as any) ?? "map");
  useEffect(() => { if (!initView && window.matchMedia("(max-width: 767px)").matches) setView("table"); }, [initView]);
  const [sel, setSel] = useState<string | null>(initSel ?? null);
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const statusOf = useMemo(() => new Map((diff ?? []).map((d) => [d.stableId, d.status])), [diff]);
  useEffect(() => { setRfNodes(initNodes.map((n) => ({ id: n.stable_id, type: "step", position: { x: n.x, y: n.y }, data: { n, status: statusOf.get(n.stable_id) }, selected: n.stable_id === sel }))); }, [initNodes, statusOf, sel]);
  const rfEdges: Edge[] = useMemo(() => initEdges.map((e) => ({ id: e.id, source: e.source_stable_id, target: e.target_stable_id, label: e.label || undefined, markerEnd: { type: MarkerType.ArrowClosed }, type: "smoothstep", labelStyle: { fontSize: 11 }, labelBgPadding: [4, 2] as [number, number] })), [initEdges]);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const node = initNodes.find((n) => n.stable_id === sel) ?? null;
  const edge = initEdges.find((e) => e.id === selEdge) ?? null;
  const nameOf = (s: string) => initNodes.find((n) => n.stable_id === s)?.name ?? "?";
  const actors = [...new Set(initNodes.map((n) => n.actor).filter(Boolean))];

  const onNodesChange = useCallback((ch: NodeChange[]) => setRfNodes((cur) => applyNodeChanges(ch, cur)), []);
  const onConnect = useCallback(async (c: Connection) => { if (c.source && c.target) await run("edge.add", { productId: pid, mapId: map.id, source: c.source, target: c.target, label: "" }); }, [run, pid, map.id]);
  const [newType, setNewType] = useState("activity");
  async function addStep() {
    const maxX = Math.max(0, ...initNodes.map((n) => n.x));
    const r = await run<{ stable_id: string }>("node.add", { productId: pid, mapId: map.id, node: { name: newType === "decision" ? "New decision?" : "New step", type: newType, x: maxX + 40, y: 220 } });
    if (r.ok) setSel(r.data.stable_id);
  }
  const isFuture = map.kind === "future";
  const tabs: [typeof view, string][] = [["map", "Map"], ["table", "Table"], ...(isFuture ? [["compare", "Compare with current"] as [typeof view, string]] : [])];

  return (
    <div className="px-6 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><MapTitle pid={pid} map={map} /><span className={`badge ${isFuture ? "badge-accent" : ""}`}>{isFuture ? "Future-state proposal" : "Current state"}</span></div>
          <p className="text-[12.5px] text-muted">Every change saves immediately. {map.description}</p></div>
        <div className="flex flex-wrap gap-1.5">{siblings.filter((s) => s.id !== map.id).map((s) => <Link key={s.id} className="btn btn-sm btn-quiet" href={`/p/${pid}/maps/${s.id}`}>{s.kind === "future" ? "Proposal: " : "Current: "}{s.name}</Link>)}
          {!isFuture && <CloneButton pid={pid} mapId={map.id} name={map.name} />}
          {map.initiative_id && <Link className="btn btn-sm" href={`/p/${pid}/i/${map.initiative_id}/explore?tab=process`}>All maps</Link>}</div>
      </div>
      <div role="tablist" className="mb-3 flex gap-1 border-b border-line">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-[13.5px] ${view === k ? "border-accent font-medium text-accent-strong" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>)}</div>
      {warnings.length > 0 && view !== "compare" && <details className="mb-3 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium text-warn">{warnings.length} thing(s) to check in this map</summary><ul className="list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></details>}
      <ErrorText message={error} />

      {view !== "compare" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="nt">Step type</label>
              <select id="nt" className="input !w-auto !py-1" value={newType} onChange={(e) => setNewType(e.target.value)}><option value="activity">Activity</option><option value="decision">Decision</option><option value="start">Start</option><option value="end">End</option></select>
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={addStep}>Add a step</button>
              <span className="text-[12px] text-muted">{view === "map" ? "Drag to arrange. Drag from a step’s right dot to another step to connect. Select a step or connection to edit." : "Select a row to edit it."}</span>
            </div>
            {view === "map" ? (
              <div className="hidden h-[64vh] rounded-lg border border-line bg-surface md:block" aria-label="Process map canvas">
                <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect} fitView fitViewOptions={{ padding: 0.08, maxZoom: 1 }} minZoom={0.2}
                  onNodeClick={(_, n) => { setSel(n.id); setSelEdge(null); }} onEdgeClick={(_, e) => { setSelEdge(e.id); setSel(null); }} onPaneClick={() => { setSel(null); setSelEdge(null); }}
                  onNodeDragStop={(_, n) => run("map.positions", { productId: pid, mapId: map.id, positions: [{ stableId: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }] }, { refresh: false })}
                  onNodesDelete={(ns) => ns.forEach((n) => run("node.delete", { productId: pid, mapId: map.id, stableId: n.id }))}
                  onEdgesDelete={(es) => es.forEach((e) => run("edge.delete", { productId: pid, mapId: map.id, edgeId: e.id }))}
                  deleteKeyCode={["Backspace", "Delete"]}>
                  <Background /><Controls showInteractive={false} />
                </ReactFlow>
              </div>
            ) : null}
            {view === "map" && <p className="mt-2 text-[12.5px] text-muted md:hidden">The map canvas needs a wider screen. Use the Table view here — it edits the same steps.</p>}
            {(view === "table" || view === "map") && <StepTable nodes={initNodes} edges={initEdges} sel={sel} onSel={(s) => { setSel(s); setSelEdge(null); }} nameOf={nameOf} hidden={view === "map"} />}
          </div>
          <aside className="min-w-0" aria-label="Step details">
            {node ? <Inspector key={node.id} pid={pid} mapId={map.id} n={node} actors={actors} edges={initEdges} nameOf={nameOf} nodes={initNodes} evidenceCands={evidenceCands} oppCands={oppCands} onDeleted={() => setSel(null)} />
              : edge ? <EdgeInspector key={edge.id} pid={pid} mapId={map.id} e={edge} nameOf={nameOf} onDeleted={() => setSelEdge(null)} />
              : <div className="card p-4 text-[13.5px] text-muted"><p className="font-medium text-ink">Nothing selected</p><p>Select a step to see its details, evidence and related opportunities, or a connection to label a branch.</p>
                <div className="mt-2 flex gap-2 text-[12.5px]"><span className="badge">solid border = evidence-backed or confirmed</span><span className="badge badge-warn">dashed = inferred, needs confirmation</span></div></div>}
          </aside>
        </div>
      ) : baseline && diff && (
        <Compare pid={pid} mapId={map.id} map={map} baseline={baseline} nodes={initNodes} edges={initEdges} diff={diff} changes={changes} stale={baselineStale} />
      )}
    </div>
  );
  void setError; void router;
}

function MapTitle({ pid, map }: { pid: string; map: { id: string; name: string } }) {
  const { run } = useAction(); const [e, setE] = useState(false); const [v, setV] = useState(map.name);
  if (!e) return <h1 className="text-[19px] font-semibold">{map.name} <button className="btn btn-quiet btn-sm" onClick={() => setE(true)} aria-label="Rename map">✎</button></h1>;
  return <form className="flex gap-1" onSubmit={async (ev) => { ev.preventDefault(); const r = await run("map.update", { productId: pid, id: map.id, name: v }); if (r.ok) setE(false); }}><input aria-label="Map name" className="input" value={v} onChange={(x) => setV(x.target.value)} /><button className="btn btn-sm btn-primary">Save</button></form>;
}

function CloneButton({ pid, mapId, name }: { pid: string; mapId: string; name: string }) {
  const { run, pending, router } = useAction(); const [o, setO] = useState(false); const [n, setN] = useState("");
  return (<>
    <button className="btn btn-sm btn-primary" onClick={() => setO(true)}>Propose a future state</button>
    {o && <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Propose a future state"><form className="card w-full max-w-md p-5" onSubmit={async (e) => { e.preventDefault(); const r = await run<{ id: string }>("map.cloneFuture", { productId: pid, mapId, name: n }, { refresh: false }); if (r.ok) router.push(`/p/${pid}/maps/${r.data.id}`); }}>
      <h2 className="mb-1 text-[16px] font-semibold">Propose a future state</h2><p className="mb-3 text-[13px] text-muted">Clones “{name}”. The original stays untouched and its current shape is frozen as the baseline.</p>
      <input autoFocus className="input mb-3" required placeholder="Name this proposal" value={n} onChange={(e) => setN(e.target.value)} aria-label="Proposal name" />
      <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setO(false)}>Cancel</button><button className="btn btn-primary" disabled={pending}>Create proposal</button></div></form></div>}
  </>);
}

function StepTable({ nodes, edges, sel, onSel, nameOf, hidden }: { nodes: PNode[]; edges: PEdge[]; sel: string | null; onSel: (s: string) => void; nameOf: (s: string) => string; hidden?: boolean }) {
  const ordered = useMemo(() => {
    const seen = new Set<string>(); const out: PNode[] = [];
    const starts = nodes.filter((n) => n.type === "start"); const q = [...starts];
    while (q.length) { const n = q.shift()!; if (seen.has(n.stable_id)) continue; seen.add(n.stable_id); out.push(n); edges.filter((e) => e.source_stable_id === n.stable_id).forEach((e) => { const t = nodes.find((x) => x.stable_id === e.target_stable_id); if (t) q.push(t); }); }
    return [...out, ...nodes.filter((n) => !seen.has(n.stable_id))];
  }, [nodes, edges]);
  return (
    <div className={`card mt-3 overflow-x-auto ${hidden ? "hidden md:block" : ""}`}>
      <table className="tbl"><caption className="sr-only">Process steps in flow order</caption><thead><tr><th>#</th><th>Step</th><th>Owner</th><th>System</th><th>Timing</th><th>Goes to</th><th>Basis</th></tr></thead><tbody>
        {ordered.map((n, i) => (
          <tr key={n.stable_id} className={`cursor-pointer ${sel === n.stable_id ? "!bg-accent-soft/50" : ""}`} onClick={() => onSel(n.stable_id)}>
            <td className="text-muted">{i + 1}</td>
            <td><button className="text-left font-medium hover:underline" onClick={() => onSel(n.stable_id)}>{n.type !== "activity" && <span className="badge mr-1">{n.type}</span>}{n.name}</button>{n.pain_points && <p className="text-[12px] text-danger">Pain: {n.pain_points.slice(0, 80)}</p>}</td>
            <td>{n.actor || "—"}</td><td>{n.system || "—"}</td><td>{n.timing || "—"}</td>
            <td>{edges.filter((e) => e.source_stable_id === n.stable_id).map((e) => <div key={e.id} className="text-[12.5px]">→ {nameOf(e.target_stable_id)}{e.label && <em className="text-muted"> ({e.label})</em>}</div>)}</td>
            <td>{n.provenance === "inferred" ? <span className="badge badge-warn">Inferred</span> : n.provenance === "evidence" ? <span className="badge badge-accent">Evidence ({n.evidence.length})</span> : <span className="badge">Manual</span>}</td>
          </tr>))}
      </tbody></table>
    </div>
  );
}

function Inspector({ pid, mapId, n, actors, edges, nodes, nameOf, evidenceCands, oppCands, onDeleted }: { pid: string; mapId: string; n: PNode; actors: string[]; edges: PEdge[]; nodes: PNode[]; nameOf: (s: string) => string; evidenceCands: Cand[]; oppCands: Cand[]; onDeleted: () => void }) {
  const { run, pending, error } = useAction();
  const [v, setV] = useState({ name: n.name, type: n.type, description: n.description, actor: n.actor, system: n.system, inputs: n.inputs, outputs: n.outputs, timing: n.timing, pain_points: n.pain_points, controls: n.controls });
  const [ec, setEc] = useState(""); const [oc, setOc] = useState(""); const [to, setTo] = useState(""); const [lab, setLab] = useState("");
  const out = edges.filter((e) => e.source_stable_id === n.stable_id), inn = edges.filter((e) => e.target_stable_id === n.stable_id);
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== (n as any)[k]);
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between"><span className="h-section">Step</span>{n.provenance === "inferred" && <span className="badge badge-warn">Inferred — needs confirmation</span>}{n.provenance === "evidence" && <span className="badge badge-accent">Supported by evidence</span>}</div>
      <form onSubmit={async (e) => { e.preventDefault(); await run("node.update", { productId: pid, mapId, stableId: n.stable_id, fields: v }); }}>
        <Field label="Name" htmlFor="in-n"><input id="in-n" className="input" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-x-2">
          <Field label="Type" htmlFor="in-t"><select id="in-t" className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as any })}><option value="activity">Activity</option><option value="decision">Decision</option><option value="start">Start</option><option value="end">End</option></select></Field>
          <Field label="Owner (actor or team)" htmlFor="in-a"><input id="in-a" list="actors" className="input" value={v.actor} onChange={(e) => setV({ ...v, actor: e.target.value })} /><datalist id="actors">{actors.map((a) => <option key={a} value={a} />)}</datalist></Field>
        </div>
        <Field label="Description" htmlFor="in-d"><textarea id="in-d" className="input" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-x-2">
          <Field label="System used" htmlFor="in-s"><input id="in-s" className="input" value={v.system} onChange={(e) => setV({ ...v, system: e.target.value })} /></Field>
          <Field label="Known timing" htmlFor="in-ti"><input id="in-ti" className="input" value={v.timing} onChange={(e) => setV({ ...v, timing: e.target.value })} placeholder="only if known" /></Field>
          <Field label="Inputs" htmlFor="in-i"><input id="in-i" className="input" value={v.inputs} onChange={(e) => setV({ ...v, inputs: e.target.value })} /></Field>
          <Field label="Outputs" htmlFor="in-o"><input id="in-o" className="input" value={v.outputs} onChange={(e) => setV({ ...v, outputs: e.target.value })} /></Field>
        </div>
        <Field label="Pain points" htmlFor="in-p"><textarea id="in-p" className="input" rows={2} value={v.pain_points} onChange={(e) => setV({ ...v, pain_points: e.target.value })} /></Field>
        <Field label="Controls or constraints" htmlFor="in-c"><textarea id="in-c" className="input" rows={2} value={v.controls} onChange={(e) => setV({ ...v, controls: e.target.value })} /></Field>
        <ErrorText message={error} />
        <div className="flex flex-wrap gap-2"><button className="btn btn-primary btn-sm" disabled={pending || !dirty}>Save step</button>
          {n.provenance === "inferred" && <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run("node.update", { productId: pid, mapId, stableId: n.stable_id, fields: { provenance: "manual" } })}>Confirm this step</button>}
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={async () => { if (confirm(`Delete “${n.name}”? Its connections and links are removed.`)) { const r = await run("node.delete", { productId: pid, mapId, stableId: n.stable_id }); if (r.ok) onDeleted(); } }}>Delete step</button></div>
      </form>

      <div className="mt-4 border-t border-line pt-3"><h3 className="h-section mb-1">Connections</h3>
        {inn.map((e) => <p key={e.id} className="text-[12.5px] text-muted">← from {nameOf(e.source_stable_id)}{e.label && ` (${e.label})`}</p>)}
        {out.map((e) => <div key={e.id} className="mb-1 flex items-center gap-1.5 text-[13px]"><span className="min-w-0 flex-1 truncate">→ {nameOf(e.target_stable_id)}</span>
          <input aria-label={`Branch label to ${nameOf(e.target_stable_id)}`} className="input !w-28 !py-0.5 text-[12px]" placeholder={n.type === "decision" ? "branch label" : "label"} defaultValue={e.label} onBlur={(x) => { if (x.target.value !== e.label) run("edge.update", { productId: pid, mapId, edgeId: e.id, label: x.target.value }); }} />
          <button className="btn btn-quiet btn-sm" aria-label={`Disconnect from ${nameOf(e.target_stable_id)}`} onClick={() => run("edge.delete", { productId: pid, mapId, edgeId: e.id })}>✕</button></div>)}
        <div className="mt-1.5 flex gap-1.5"><select aria-label="Connect to" className="input !py-1 text-[12.5px]" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Connect to…</option>{nodes.filter((x) => x.stable_id !== n.stable_id && !out.some((o) => o.target_stable_id === x.stable_id)).map((x) => <option key={x.stable_id} value={x.stable_id}>{x.name}</option>)}</select>
          <input aria-label="New connection label" className="input !w-24 !py-1 text-[12.5px]" placeholder="label" value={lab} onChange={(e) => setLab(e.target.value)} />
          <button className="btn btn-sm" disabled={!to || pending} onClick={async () => { const r = await run("edge.add", { productId: pid, mapId, source: n.stable_id, target: to, label: lab }); if (r.ok) { setTo(""); setLab(""); } }}>Connect</button></div>
        {n.type === "decision" && out.some((e) => !e.label.trim()) && <p className="mt-1 text-[12px] text-warn">Label every branch of a decision (e.g. Yes / No).</p>}
      </div>

      <div className="mt-4 border-t border-line pt-3"><h3 className="h-section mb-1">Supporting evidence</h3>
        {n.evidence.length === 0 ? <p className="text-[13px] text-muted">{n.provenance === "inferred" ? "No evidence yet. Link an excerpt, or confirm it with the people who do the work." : "None linked."}</p> : <ul className="space-y-1">{n.evidence.map((x) => <li key={x.linkId} className="rounded border border-line bg-paper px-2 py-1 text-[12.5px]">“{x.text.slice(0, 140)}{x.text.length > 140 ? "…" : ""}” <Link className="underline" href={`/p/${pid}/sources/${x.sourceId}?excerpt=${x.excerptId}`}>{x.sourceTitle}</Link> <button className="text-danger underline" onClick={() => run("link.remove", { productId: pid, linkId: x.linkId })}>unlink</button></li>)}</ul>}
        {evidenceCands.length > 0 && <div className="mt-1.5 flex gap-1.5"><select aria-label="Link an excerpt" className="input !py-1 text-[12.5px]" value={ec} onChange={(e) => setEc(e.target.value)}><option value="">Link an excerpt…</option>{evidenceCands.map((c) => <option key={c.id} value={c.id}>{c.label.slice(0, 70)}</option>)}</select><button className="btn btn-sm" disabled={!ec || pending} onClick={async () => { const r = await run("link.add", { productId: pid, fromType: "excerpt", fromId: ec, toType: "process_node", toId: n.id, relation: "supports" }); if (r.ok) setEc(""); }}>Link</button></div>}
        <p className="mt-1 text-[12px] text-muted">Create new excerpts by highlighting text in a source.</p>
      </div>

      <div className="mt-4 border-t border-line pt-3"><h3 className="h-section mb-1">Related opportunities</h3>
        {n.opportunities.length === 0 ? <p className="text-[13px] text-muted">None linked.</p> : <ul className="text-[13px]">{n.opportunities.map((o) => <li key={o.linkId}>{o.title} <button className="text-danger underline" onClick={() => run("link.remove", { productId: pid, linkId: o.linkId })}>unlink</button></li>)}</ul>}
        {oppCands.length > 0 && <div className="mt-1.5 flex gap-1.5"><select aria-label="Relate an opportunity" className="input !py-1 text-[12.5px]" value={oc} onChange={(e) => setOc(e.target.value)}><option value="">Relate an opportunity…</option>{oppCands.filter((c) => !n.opportunities.some((o) => o.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.label.slice(0, 70)}</option>)}</select><button className="btn btn-sm" disabled={!oc || pending} onClick={async () => { const r = await run("link.add", { productId: pid, fromType: "opportunity", fromId: oc, toType: "process_node", toId: n.id, relation: "relates_to" }); if (r.ok) setOc(""); }}>Relate</button></div>}
      </div>
    </section>
  );
}

function EdgeInspector({ pid, mapId, e, nameOf, onDeleted }: { pid: string; mapId: string; e: PEdge; nameOf: (s: string) => string; onDeleted: () => void }) {
  const { run, pending, error } = useAction(); const [l, setL] = useState(e.label);
  return (
    <section className="card p-4"><span className="h-section">Connection</span><p className="my-1 text-[13.5px]">{nameOf(e.source_stable_id)} → {nameOf(e.target_stable_id)}</p>
      <Field label="Branch label" htmlFor="el"><input id="el" className="input" value={l} onChange={(x) => setL(x.target.value)} placeholder="e.g. Yes, No, Needs information" /></Field><ErrorText message={error} />
      <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending || l === e.label} onClick={() => run("edge.update", { productId: pid, mapId, edgeId: e.id, label: l })}>Save label</button><button className="btn btn-sm btn-danger" disabled={pending} onClick={async () => { const r = await run("edge.delete", { productId: pid, mapId, edgeId: e.id }); if (r.ok) onDeleted(); }}>Disconnect</button></div></section>
  );
}

function Compare({ pid, mapId, map, baseline, nodes, edges, diff, changes, stale }: { pid: string; mapId: string; map: { name: string; scenario: Scenario | null }; baseline: NonNullable<Parameters<typeof MapEditor>[0]["baseline"]>; nodes: PNode[]; edges: PEdge[]; diff: Diff[]; changes: Change[]; stale: boolean }) {
  const activities = nodes.filter((n) => n.type === "activity").length;
  const actors = new Map(nodes.map((n) => [n.stable_id, n.actor]));
  const handoffs = edges.filter((e) => { const a = actors.get(e.source_stable_id), b = actors.get(e.target_stable_id); return a && b && a !== b; }).length;
  const changed = diff.filter((d) => d.status !== "unchanged");
  const c = (s: string) => diff.filter((d) => d.status === s).length;
  return (
    <div className="space-y-5">
      {stale && <p className="rounded border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]">The original map has been edited since this proposal was cloned. The comparison uses the frozen baseline from {baseline.takenAt.slice(0, 10)}.</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {[["Activities", baseline.activities, activities], ["Handoffs between owners", baseline.handoffs, handoffs], ["Steps added / removed / modified", "—", `${c("added")} / ${c("removed")} / ${c("modified")}`]].map(([l, a, b]) => (
          <div key={String(l)} className="card p-3"><p className="h-section">{l}</p><p className="mt-1 text-[15px]"><span className="text-muted">{a}</span> <span aria-hidden>→</span> <span className="font-semibold">{b}</span></p></div>))}
      </div>
      <p className="text-[12.5px] text-muted">These count design changes. They are not measured improvements.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Baseline steps"><h3 className="mb-1.5 text-[14px] font-semibold">Baseline: {baseline.name}</h3>
          <ol className="card divide-y divide-line">{diff.filter((d) => d.before).map((d) => <li key={d.stableId} className={`px-3 py-1.5 text-[13px] ${d.status === "removed" ? "bg-danger-soft/60 line-through decoration-danger/40" : d.status === "modified" ? "bg-warn-soft/60" : ""}`}>{d.before!.name} <span className="text-muted">· {d.before!.actor || "no owner"}</span></li>)}</ol></section>
        <section aria-label="Proposal steps"><h3 className="mb-1.5 text-[14px] font-semibold">Proposal: {map.name}</h3>
          <ol className="card divide-y divide-line">{diff.filter((d) => d.after).map((d) => <li key={d.stableId} className={`px-3 py-1.5 text-[13px] ${d.status === "added" ? "bg-accent-soft/60" : d.status === "modified" ? "bg-warn-soft/60" : ""}`}>{d.after!.name} <span className="text-muted">· {d.after!.actor || "no owner"}</span>{d.status === "added" && <span className="badge badge-accent ml-1.5">added</span>}{d.status === "modified" && <span className="badge badge-warn ml-1.5">changed: {d.changed.join(", ")}</span>}</li>)}</ol></section>
      </div>
      <section aria-labelledby="chg-h"><h3 id="chg-h" className="mb-1.5 text-[15px] font-semibold">Why each change</h3>
        {changed.length === 0 ? <p className="text-[13.5px] text-muted">No differences yet. Edit this proposal in the Map or Table view.</p> : <div className="space-y-3">{changed.map((d) => <ChangeForm key={d.stableId} pid={pid} mapId={mapId} d={d} ch={changes.find((x) => x.stable_id === d.stableId)} />)}</div>}
      </section>
      <Scenario pid={pid} mapId={mapId} s={map.scenario} />
    </div>
  );
}

function ChangeForm({ pid, mapId, d, ch }: { pid: string; mapId: string; d: Diff; ch?: Change }) {
  const { run, pending, error } = useAction();
  const [v, setV] = useState({ what: ch?.what ?? "", why: ch?.why ?? "", addresses: ch?.addresses ?? "", expected_outcome: ch?.expected_outcome ?? "", dependencies: ch?.dependencies ?? "", risks: ch?.risks ?? "", assumptions: ch?.assumptions ?? "" });
  const L: [keyof typeof v, string][] = [["what", "What changes"], ["why", "Why"], ["addresses", "Evidence or opportunity addressed"], ["expected_outcome", "Expected outcome"], ["dependencies", "Dependencies"], ["risks", "Risks and controls"], ["assumptions", "Assumptions to validate"]];
  const name = (d.after ?? d.before)!.name;
  return (
    <details className="card p-3"><summary className="cursor-pointer text-[14px] font-medium"><span className={`badge mr-1.5 ${d.status === "added" ? "badge-accent" : d.status === "removed" ? "badge-danger" : "badge-warn"}`}>{d.status}</span>{name}{ch?.what && <span className="ml-2 text-[12px] font-normal text-muted">rationale recorded</span>}</summary>
      <form className="mt-2 grid gap-x-3 md:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await run("change.upsert", { productId: pid, mapId, stableId: d.stableId, fields: v }); }}>
        {L.map(([k, l]) => <Field key={k} label={l} htmlFor={`ch-${d.stableId}-${k}`}><textarea id={`ch-${d.stableId}-${k}`} rows={2} className="input" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}
        <div className="md:col-span-2"><ErrorText message={error} /><button className="btn btn-primary btn-sm" disabled={pending}>Save rationale</button></div></form></details>
  );
}

function Scenario({ pid, mapId, s }: { pid: string; mapId: string; s: Scenario | null }) {
  const { run, pending, error } = useAction();
  const [on, setOn] = useState(!!s);
  const [v, setV] = useState<Scenario>(s ?? { label: "Scenario: estimated effect", unit: "", formula: "", inputs: [] });
  const vars = Object.fromEntries(v.inputs.map((i) => [i.name, i.value]));
  const r = v.formula.trim() ? evalFormula(v.formula, vars) : null;
  if (!on) return <section><h3 className="mb-1 text-[15px] font-semibold">Quantified benefit (optional)</h3><p className="mb-2 text-[13px] text-muted">Only if you can state the formula and the assumptions behind it. It will always be labelled a scenario, never a measured result.</p><button className="btn btn-sm" onClick={() => setOn(true)}>Add a benefit scenario</button></section>;
  return (
    <section aria-labelledby="sc-h" className="card p-4"><h3 id="sc-h" className="text-[15px] font-semibold">{v.label} <span className="badge badge-warn">Scenario estimate — not a measured result</span></h3>
      <div className="mt-2 grid gap-x-3 md:grid-cols-2"><Field label="Label" htmlFor="sc-l"><input id="sc-l" className="input" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field><Field label="Unit of the result" htmlFor="sc-u"><input id="sc-u" className="input" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="e.g. hours / month" /></Field></div>
      <Field label="Formula" htmlFor="sc-f" hint="Use + − × ÷ ( ) and the input names below, e.g. cases * share * hours."><input id="sc-f" className="input font-mono" value={v.formula} onChange={(e) => setV({ ...v, formula: e.target.value })} /></Field>
      <table className="tbl mb-2"><thead><tr><th>Input name</th><th>Value</th><th>Unit</th><th>Where it comes from</th><th /></tr></thead><tbody>{v.inputs.map((i, k) => (
        <tr key={k}><td><input aria-label="Input name" className="input !py-1 font-mono" value={i.name} onChange={(e) => setV({ ...v, inputs: v.inputs.map((x, y) => y === k ? { ...x, name: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") } : x) })} /></td>
          <td><input aria-label="Value" className="input !w-24 !py-1" value={i.value ?? ""} placeholder="unknown" onChange={(e) => setV({ ...v, inputs: v.inputs.map((x, y) => y === k ? { ...x, value: e.target.value === "" || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value) } : x) })} /></td>
          <td><input aria-label="Unit" className="input !py-1" value={i.unit} onChange={(e) => setV({ ...v, inputs: v.inputs.map((x, y) => y === k ? { ...x, unit: e.target.value } : x) })} /></td>
          <td><input aria-label="Source or assumption" className="input !py-1" value={i.note} onChange={(e) => setV({ ...v, inputs: v.inputs.map((x, y) => y === k ? { ...x, note: e.target.value } : x) })} /></td>
          <td><button className="btn btn-quiet btn-sm" aria-label="Remove input" onClick={() => setV({ ...v, inputs: v.inputs.filter((_, y) => y !== k) })}>✕</button></td></tr>))}</tbody></table>
      <button className="btn btn-sm mb-3" onClick={() => setV({ ...v, inputs: [...v.inputs, { name: `input${v.inputs.length + 1}`, value: null, unit: "", note: "" }] })}>Add an input</button>
      <p className="rounded bg-paper px-3 py-2 text-[14px]" aria-live="polite">{r == null ? "Add a formula to see the estimate." : r.error ? <span className="text-danger">{r.error}</span> : r.value == null ? <span className="text-warn">Cannot compute: {r.missing.join(", ")} unknown. Unknown inputs are never treated as zero.</span> : <>Estimate: <strong>{Math.round(r.value * 100) / 100} {v.unit}</strong> <span className="text-muted">= {v.formula}</span></>}</p>
      <ErrorText message={error} />
      <div className="mt-3 flex gap-2"><button className="btn btn-primary btn-sm" disabled={pending} onClick={() => run("scenario.save", { productId: pid, mapId, scenario: v })}>Save scenario</button>{s && <button className="btn btn-sm" onClick={async () => { const x = await run("scenario.save", { productId: pid, mapId, scenario: null }); if (x.ok) setOn(false); }}>Remove</button>}</div>
    </section>
  );
}
