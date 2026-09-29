import { createHash } from "node:crypto";
import { all, get, run, now, parse, j } from "./db";
import { DomainError } from "./links";
import { getInitiative, listFindings, listOpportunities, listExperiments, listDecisions, listConcepts, listAssumptions, listMaps, type Row } from "./queries";
import { fmtDuration } from "./eventlog";
import { loadMap, diffMaps, activityCount, handoffCount } from "./process";
import { DECISION_TYPES, INTERVENTIONS, SOURCE_TYPES, EXPERIMENT_METHODS } from "./types";

export const BRIEF_KEYS = ["question", "outcome", "evidence", "findings", "opportunities", "process", "experiments", "decision", "unknowns"] as const;
export type BriefKey = (typeof BRIEF_KEYS)[number];
const TITLES: Record<BriefKey, string> = {
  question: "Question and scope", outcome: "Desired outcome", evidence: "Evidence reviewed", findings: "What we learned",
  opportunities: "Opportunities", process: "Current and proposed process", experiments: "Experiments and learning",
  decision: "Decision and rationale", unknowns: "What remains uncertain",
};

export type BriefItem = { type: string; id: string; hash: string; md: string; label: string };
export type BriefSection = {
  key: BriefKey; title: string; narrative: string; items: BriefItem[]; hash: string;
  needsRefresh: boolean; changes: string[]; applicable: boolean;
};

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const quote = (t: string) => t.split("\n").map((l) => `> ${l}`).join("\n");

function collect(productId: string, iid: string): Record<BriefKey, { items: BriefItem[]; applicable: boolean }> {
  const init = getInitiative(productId, iid);
  const item = (type: string, id: string, label: string, md: string): BriefItem => ({ type, id, label, md, hash: sha(md) });
  const sources = all<Row>("SELECT s.* FROM initiative_sources x JOIN sources s ON s.id=x.source_id WHERE x.initiative_id=? AND s.deleted_at IS NULL ORDER BY COALESCE(s.source_date, s.imported_at)", iid);
  const findings = listFindings(productId, { initiativeId: iid, status: "accepted" });
  const opps = listOpportunities(productId, iid).filter((o) => o.status !== "dismissed");
  const exps = listExperiments(productId, { initiativeId: iid });
  const decs = listDecisions(productId, iid).filter((d) => d.status === "active");
  const maps = listMaps(productId, iid);
  const assumptions = listAssumptions(productId, iid);
  const concepts = listConcepts(productId, iid);

  const question: BriefItem[] = [item("initiative", iid, "Question", [
    `**Discovery question:** ${init.question || "—"}`,
    init.refined_status === "accepted" && init.refined_question ? `**Refined question (accepted):** ${init.refined_question}` : "",
    `**Who is affected:** ${init.affected || "not yet known"}`,
    `**Scope:** ${init.scope || "not stated"}`,
    `**Known constraints:** ${init.constraints || "none recorded"}`,
  ].filter(Boolean).join("\n\n"))];
  const outcome: BriefItem[] = [item("initiative", iid, "Outcome", [
    `**Desired outcome:** ${init.outcome || "not yet defined"}`, `**Decision this informs:** ${init.decision_to_inform || "not yet defined"}`].join("\n\n"))];
  const evidence = sources.map((s) => item("source", s.id, s.title,
    `- **${s.title}** — ${SOURCE_TYPES[s.source_type] ?? s.source_type}${s.source_date ? `, ${s.source_date}` : ""}${s.segment ? `, segment: ${s.segment}` : ""}${s.participant ? `, ${s.participant}` : ""}${s.synthetic ? " *(synthetic demo data)*" : ""} — version ${s.version}`));
  const fItems = findings.map((f) => {
    const ex = f.supporting.slice(0, 4).map((e: any) => quote(`“${e.text.replace(/\s+/g, " ")}” — ${e.source_title} v${e.source_version}${e.participant ? `, ${e.participant}` : ""}`)).join("\n");
    const data = f.dataRefs.map((d: any) => `- Data: ${d.ref.label ?? "metric"} (${d.title}, run ${d.seq})`).join("\n");
    return item("finding", f.id, f.statement, [
      `### ${f.statement}`,
      `**Evidence strength: ${f.strength.level}.** ${f.strength.explanation}`,
      f.interpretation && `**Interpretation:** ${f.interpretation}`, f.limitations && `**Limitations:** ${f.limitations}`,
      f.segment && `**Segment:** ${f.segment}`, ex, data,
      f.contradicting.length ? `**Contradicting evidence:**\n${f.contradicting.map((e: any) => quote(`“${e.text.replace(/\s+/g, " ")}” — ${e.source_title}`)).join("\n")}` : "",
      f.needs_review ? `⚠ *Needs review: ${f.review_reason}*` : "",
    ].filter(Boolean).join("\n\n"));
  });
  const oItems = opps.map((o) => item("opportunity", o.id, o.title, [
    `### ${o.title}`, o.problem, o.segment && `**Affects:** ${o.segment}`, o.desired_outcome && `**Desired outcome:** ${o.desired_outcome}`,
    (o.frequency || o.severity) && `**Reach / impact:** ${[o.frequency && `frequency — ${o.frequency}`, o.severity && `severity — ${o.severity}`].filter(Boolean).join("; ")}`,
    o.findings.length && `**Supporting findings:** ${o.findings.map((f: any) => f.statement).join("; ")}`,
    o.concepts.length && `**Solution concepts:** ${o.concepts.map((c: any) => `${c.title} (${INTERVENTIONS[c.intervention_type] ?? c.intervention_type})`).join("; ")}`,
    o.override_score != null ? `**Priority:** ${o.override_score} (manual override: ${o.override_rationale})` : o.calc.score != null ? `**Priority score:** ${o.calc.score.toFixed(2)} of 5 — ${o.calc.note}` : `**Priority:** not scored — ${o.calc.note}`,
  ].filter(Boolean).join("\n\n")));
  const pItems: BriefItem[] = [];
  for (const m of maps) {
    const l = loadMap(m.id)!;
    if (m.kind === "current") pItems.push(item("process_map", m.id, m.name, `- **Current state — ${m.name}:** ${activityCount(l.nodes)} activities, ${handoffCount(l.nodes, l.edges)} handoffs${l.nodes.some((n) => n.provenance === "inferred") ? `, ${l.nodes.filter((n) => n.provenance === "inferred").length} step(s) inferred and unconfirmed` : ""}.`));
    else if (l.map.baseline_snapshot) {
      const d = diffMaps(l.map.baseline_snapshot, l);
      pItems.push(item("process_map", m.id, m.name, `- **Proposal — ${m.name}:** ${activityCount(l.nodes)} activities (baseline ${activityCount(l.map.baseline_snapshot.nodes)}), ${handoffCount(l.nodes, l.edges)} handoffs (baseline ${handoffCount(l.map.baseline_snapshot.nodes, l.map.baseline_snapshot.edges)}). ${d.filter((x) => x.status === "added").length} added, ${d.filter((x) => x.status === "removed").length} removed, ${d.filter((x) => x.status === "modified").length} modified. *Design comparison, not measured benefit.*` + (l.changes.length ? "\n" + l.changes.filter((c) => c.what || c.why).map((c) => `  - ${c.what}${c.why ? ` — because ${c.why}` : ""}${c.risks ? ` (risk: ${c.risks})` : ""}`).join("\n") : "")));
    }
  }
  const eItems = exps.map((e) => item("experiment", e.id, e.title, [
    `### ${e.title} (${e.status}${e.outcome ? `, ${e.outcome}` : ""})`, `**Hypothesis:** ${e.hypothesis}`, `**Method:** ${EXPERIMENT_METHODS[e.method] ?? e.method}${e.target ? ` — ${e.target}` : ""}`,
    `**Success criterion (set before running):** ${e.success_criterion || "not defined"}`,
    e.results && `**Results:** ${e.results}`, e.interpretation && `**Interpretation:** ${e.interpretation}`, e.limitations && `**Limitations:** ${e.limitations}`, e.next_action && `**Next:** ${e.next_action}`,
  ].filter(Boolean).join("\n\n")));
  const dItems = decs.map((d) => item("decision", d.id, d.statement, [
    `### ${DECISION_TYPES[d.decision_type] ?? d.decision_type}: ${d.statement}`, `*Decided ${d.decided_on}*`,
    `**Rationale:** ${d.rationale || "—"}`, d.alternatives && `**Alternatives considered:** ${d.alternatives}`,
    d.risks && `**Unresolved risks / contradictory evidence:** ${d.risks}`, d.expected_outcome && `**Expected outcome:** ${d.expected_outcome}`, d.next_action && `**Next action:** ${d.next_action}`,
    d.needs_review ? `⚠ *Needs review: ${d.review_reason}*` : "",
  ].filter(Boolean).join("\n\n")));
  const unknowns: BriefItem[] = [];
  if (init.constraints) void 0;
  for (const o of opps) if (o.unknowns) unknowns.push(item("opportunity", o.id, o.title, `- *${o.title}:* ${o.unknowns.replace(/\n/g, " ")}`));
  for (const a of assumptions.filter((a) => !["supported", "refuted"].includes(a.status))) unknowns.push(item("assumption", a.id, a.statement, `- Assumption (${a.status}, support ${a.support}, importance ${a.importance}): ${a.statement}`));
  for (const f of findings.filter((f) => f.strength.level === "weak" || f.strength.level === "unknown")) unknowns.push(item("finding", f.id, f.statement, `- Weakly supported finding: ${f.statement}`));
  for (const e of exps.filter((e) => e.outcome === "inconclusive")) unknowns.push(item("experiment", e.id, e.title, `- Inconclusive: ${e.title} — ${e.next_action || "next step not recorded"}`));
  void concepts;
  return {
    question: { items: question, applicable: true }, outcome: { items: outcome, applicable: true }, evidence: { items: evidence, applicable: true },
    findings: { items: fItems, applicable: true }, opportunities: { items: oItems, applicable: true },
    process: { items: pItems, applicable: pItems.length > 0 || !!init.process_enabled }, experiments: { items: eItems, applicable: true },
    decision: { items: dItems, applicable: true }, unknowns: { items: unknowns, applicable: true },
  };
}

type Reviewed = { hash: string; items: Record<string, string> };

export function buildBrief(productId: string, iid: string): { initiative: Row; sections: BriefSection[]; markdown: string; anyNeedsRefresh: boolean } {
  const init = getInitiative(productId, iid);
  const data = collect(productId, iid);
  const stored = new Map(all<Row>("SELECT * FROM brief_sections WHERE initiative_id=?", iid).map((r) => [r.key, r]));
  const sections: BriefSection[] = BRIEF_KEYS.map((key) => {
    const { items, applicable } = data[key];
    const hash = sha(items.map((i) => i.hash).join("|"));
    const row = stored.get(key);
    const rv = parse<Reviewed | null>(row?.reviewed_hash, null);
    const changes: string[] = [];
    let needsRefresh = false;
    if (row && (row.narrative.trim() || rv)) {
      if (!rv) needsRefresh = false;
      else if (rv.hash !== hash) {
        needsRefresh = true;
        const now = new Map(items.map((i) => [`${i.type}:${i.id}`, i]));
        for (const [k, h] of Object.entries(rv.items)) { const n = now.get(k); if (!n) changes.push("A record was removed or is no longer included."); else if (n.hash !== h) changes.push(`Changed: ${n.label.slice(0, 80)}`); }
        for (const [k, n] of now) if (!(k in rv.items)) changes.push(`Added: ${n.label.slice(0, 80)}`);
      }
    }
    return { key, title: TITLES[key], narrative: row?.narrative ?? "", items, hash, needsRefresh, changes: [...new Set(changes)].slice(0, 6), applicable };
  });
  const md = [`# Discovery brief: ${init.title}`, `*${init.is_demo ? "Demo initiative with synthetic data · " : ""}Generated ${now().slice(0, 10)}. Status: ${init.status}.*`];
  sections.filter((s) => s.applicable).forEach((s, i) => {
    md.push(`## ${i + 1}. ${s.title}`);
    if (s.needsRefresh) md.push(`> ⚠ *Records in this section changed after the narrative was last reviewed.*`);
    if (s.narrative.trim()) md.push(s.narrative.trim());
    if (s.items.length) md.push(s.items.map((x) => x.md).join(s.key === "evidence" ? "\n" : "\n\n"));
    else md.push("*Nothing recorded yet.*");
  });
  return { initiative: init, sections, markdown: md.join("\n\n") + "\n", anyNeedsRefresh: sections.some((s) => s.needsRefresh) };
}

/** Save the user's narrative. The narrative is never overwritten by generated content. */
export function saveNarrative(productId: string, iid: string, key: string, narrative: string) {
  if (!BRIEF_KEYS.includes(key as BriefKey)) throw new DomainError("Unknown brief section.");
  const data = collect(productId, iid)[key as BriefKey];
  const rv: Reviewed = { hash: sha(data.items.map((i) => i.hash).join("|")), items: Object.fromEntries(data.items.map((i) => [`${i.type}:${i.id}`, i.hash])) };
  run(`INSERT INTO brief_sections (initiative_id, key, narrative, reviewed_hash, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(initiative_id, key) DO UPDATE SET narrative=excluded.narrative, reviewed_hash=excluded.reviewed_hash, updated_at=excluded.updated_at`, iid, key, narrative, j(rv), now());
}
export function markReviewed(productId: string, iid: string, key: string) {
  const cur = get<Row>("SELECT narrative FROM brief_sections WHERE initiative_id=? AND key=?", iid, key);
  saveNarrative(productId, iid, key, cur?.narrative ?? "");
}

/** A plain, deterministic starting draft built from the records. The user decides whether to keep it. */
export function draftNarrative(productId: string, iid: string, key: string): string {
  const b = buildBrief(productId, iid);
  const s = b.sections.find((x) => x.key === key);
  if (!s) throw new DomainError("Unknown brief section.");
  const n = s.items.length;
  switch (key) {
    case "question": return `This investigation asks: ${b.initiative.question || "(question not set)"}`;
    case "outcome": return b.initiative.outcome ? `We want to see: ${b.initiative.outcome}.` : "The outcome we are aiming for has not been defined yet.";
    case "evidence": return n ? `We reviewed ${n} source${n === 1 ? "" : "s"}. Their type, date and version are listed below so each claim can be traced back.` : "No evidence has been added yet.";
    case "findings": return n ? `${n} finding${n === 1 ? " is" : "s are"} currently accepted. Strength reflects the number of independent voices, not the number of quotes.` : "No findings have been accepted yet.";
    case "opportunities": return n ? `${n} opportunit${n === 1 ? "y is" : "ies are"} under consideration. Scores, where present, are a comparison aid rather than a verdict.` : "No opportunities have been recorded yet.";
    case "process": return "The maps below describe how work happens today and what has been proposed. Steps marked inferred have not been confirmed.";
    case "experiments": return n ? `${n} experiment${n === 1 ? "" : "s"} recorded. Results and interpretation are kept separate; inconclusive results are valid learning.` : "No experiments have been run yet.";
    case "decision": return n ? "The decision and its reasoning are below, with the evidence it rests on." : "No decision has been recorded yet.";
    default: return n ? `${n} open uncertaint${n === 1 ? "y" : "ies"} remain.` : "No open uncertainties have been recorded; check that this reflects reality.";
  }
}

export { fmtDuration };
