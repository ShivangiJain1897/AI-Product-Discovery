import { all, get } from "./db";
import { listFindings, listAssumptions, listExperiments, getInitiative, type Row } from "./queries";
import { trunc } from "./entities";
import type { EntityType } from "./types";

export type Signal = { id: string; kind: string; message: string; why: string; type: EntityType; targetId: string; section: "evidence" | "explore" | "validate" | "decide" };

/** Specific readiness signals. No percentages; each one names the record and why it appeared. */
export function readinessSignals(productId: string, initiativeId: string): Signal[] {
  const out: Signal[] = [];
  const findings = listFindings(productId, { initiativeId, status: "accepted" });
  for (const f of findings) {
    if (f.strength.excerpts === 0 && f.dataRefs.length === 0)
      out.push({ id: `nosupport-${f.id}`, kind: "unsupported_finding", message: `A finding has no supporting evidence: “${trunc(f.statement, 70)}”`, why: "Accepted findings should trace to at least one excerpt or a data metric.", type: "finding", targetId: f.id, section: "evidence" });
    if (f.needs_review)
      out.push({ id: `review-${f.id}`, kind: "finding_review", message: `A finding needs review: “${trunc(f.statement, 70)}”`, why: f.review_reason || "Its evidence changed.", type: "finding", targetId: f.id, section: "evidence" });
    if (f.strength.contradicting > 0 && f.strength.level !== "unknown")
      out.push({ id: `contra-${f.id}`, kind: "contradiction", message: `Evidence disagrees with itself: “${trunc(f.statement, 70)}”`, why: `${f.strength.contradicting} contradicting excerpt(s) are linked. Resolve or explain the difference before relying on this.`, type: "finding", targetId: f.id, section: "evidence" });
  }
  for (const a of listAssumptions(productId, initiativeId)) {
    if (a.importance === "high" && ["weak", "none", "unknown"].includes(a.support) && a.status === "untested" && a.experiments.length === 0)
      out.push({ id: `asm-${a.id}`, kind: "untested_assumption", message: `A critical assumption is untested: “${trunc(a.statement, 70)}”`, why: `Marked high importance with ${a.support === "unknown" ? "unknown" : a.support} support, and no experiment is planned.`, type: "assumption", targetId: a.id, section: "validate" });
  }
  // preferred solution contradicted
  for (const c of all<Row>("SELECT id, title FROM solution_concepts WHERE initiative_id=? AND status='preferred' AND deleted_at IS NULL", initiativeId)) {
    const refuted = all<Row>("SELECT a.id, a.statement FROM links l JOIN assumptions a ON a.id=l.to_id WHERE l.from_type='concept' AND l.from_id=? AND l.to_type='assumption' AND a.status='refuted' AND a.deleted_at IS NULL", c.id);
    for (const a of refuted) out.push({ id: `pref-${c.id}-${a.id}`, kind: "contradicts_preferred", message: `Evidence contradicts the preferred solution “${trunc(c.title, 50)}”`, why: `Its assumption was refuted: “${trunc(a.statement, 90)}”.`, type: "concept", targetId: c.id, section: "explore" });
    const contra = get<Row>(`SELECT f.id, f.statement FROM links lo JOIN links lf ON lf.to_type='finding' JOIN findings f ON f.id=lf.to_id
      JOIN links lx ON lx.to_type='finding' AND lx.to_id=f.id AND lx.relation='contradicts' AND lx.from_type='excerpt'
      WHERE lo.from_type='opportunity' AND lo.to_type='concept' AND lo.to_id=? AND f.deleted_at IS NULL AND 0`, c.id);
    void contra;
  }
  for (const e of listExperiments(productId, { initiativeId })) {
    if (e.results && !e.interpretation) out.push({ id: `exp-${e.id}`, kind: "results_uninterpreted", message: `Experiment results are waiting for interpretation: “${trunc(e.title, 60)}”`, why: "Results are recorded but interpretation is empty. Keep them separate, but do interpret them.", type: "experiment", targetId: e.id, section: "validate" });
  }
  for (const d of all<Row>("SELECT id, statement, review_reason FROM decisions WHERE initiative_id=? AND deleted_at IS NULL AND needs_review=1", initiativeId))
    out.push({ id: `dec-${d.id}`, kind: "decision_review", message: `A decision is ready for review: “${trunc(d.statement, 70)}”`, why: d.review_reason || "Evidence it relied on has changed.", type: "decision", targetId: d.id, section: "decide" });
  for (const o of all<Row>("SELECT o.id, o.title FROM opportunities o WHERE o.initiative_id=? AND o.deleted_at IS NULL AND o.status='active' AND NOT EXISTS (SELECT 1 FROM links l WHERE l.to_type='opportunity' AND l.to_id=o.id AND l.from_type IN ('finding','analysis_run'))", initiativeId))
    out.push({ id: `oppnoev-${o.id}`, kind: "opportunity_no_evidence", message: `An opportunity has no linked finding: “${trunc(o.title, 70)}”`, why: "Link the finding or data that shows this problem is real.", type: "opportunity", targetId: o.id, section: "explore" });
  return out;
}

export type NextAction = { label: string; why: string; href: string };
export function suggestNext(productId: string, initiativeId: string): NextAction {
  const base = `/p/${productId}/i/${initiativeId}`;
  const i = getInitiative(productId, initiativeId);
  const n = (sql: string) => get<Row>(sql, initiativeId)!.n as number;
  const sources = n("SELECT COUNT(*) n FROM initiative_sources x JOIN sources s ON s.id=x.source_id WHERE x.initiative_id=? AND s.deleted_at IS NULL");
  const findings = n("SELECT COUNT(*) n FROM findings WHERE initiative_id=? AND deleted_at IS NULL AND status='accepted'");
  const opps = n("SELECT COUNT(*) n FROM opportunities WHERE initiative_id=? AND deleted_at IS NULL");
  const concepts = n("SELECT COUNT(*) n FROM solution_concepts WHERE initiative_id=? AND deleted_at IS NULL");
  const exps = n("SELECT COUNT(*) n FROM experiments WHERE initiative_id=? AND deleted_at IS NULL");
  const decs = n("SELECT COUNT(*) n FROM decisions WHERE initiative_id=? AND deleted_at IS NULL");
  const sig = readinessSignals(productId, initiativeId);
  const review = sig.find((s) => s.kind === "decision_review" || s.kind === "finding_review");
  if (review) return { label: "Review what changed", why: review.why, href: `${base}/${review.section}?item=${review.type}:${review.targetId}` };
  if (sources === 0) return { label: i.started_mode === "process" ? "Sketch the current process" : "Add your first evidence", why: "Nothing has been added to investigate yet. Rough notes are fine.", href: i.started_mode === "process" ? `${base}/explore?tab=process` : `${base}/evidence?add=1` };
  if (findings === 0) return { label: "Turn evidence into a finding", why: `${sources} source(s) added but nothing has been learned from them yet.`, href: `${base}/evidence` };
  const unsup = sig.find((s) => s.kind === "unsupported_finding" || s.kind === "contradiction");
  if (unsup) return { label: "Strengthen a finding", why: unsup.why, href: `${base}/evidence?item=finding:${unsup.targetId}` };
  if (opps === 0) return { label: "Name the problems worth solving", why: "You have findings but no opportunities. Which of them deserve attention, and for whom?", href: `${base}/explore` };
  const unt = sig.find((s) => s.kind === "untested_assumption");
  if (concepts > 0 && unt) return { label: "Test this assumption", why: unt.why, href: `${base}/validate?item=assumption:${unt.targetId}` };
  const unint = sig.find((s) => s.kind === "results_uninterpreted");
  if (unint) return { label: "Interpret experiment results", why: unint.why, href: `${base}/validate?item=experiment:${unint.targetId}` };
  if (concepts === 0) return { label: "Explore alternative responses", why: "Opportunities exist but no solution concepts. Consider information, process and policy options, not only features.", href: `${base}/explore` };
  if (exps === 0) return { label: "Design a low-cost test", why: "Concepts exist but nothing is planned to reduce uncertainty.", href: `${base}/validate` };
  if (decs === 0) return { label: "Record a decision", why: "You have evidence and tests. What should happen next, and why?", href: `${base}/decide` };
  return { label: "Export or refresh the brief", why: "A decision is recorded. Share the reasoning, or reopen the investigation if things changed.", href: `${base}/brief` };
}
