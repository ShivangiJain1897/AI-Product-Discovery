import { all, get, parse, run, j, now } from "./db";
import { DomainError, assertInProduct } from "./links";
import { strengthFor, type Strength } from "./strength";

export type Dim = { key: string; label: string; scale: string; weight: number; lowerIsBetter: boolean };

export const DEFAULT_DIMS: Dim[] = [
  { key: "impact", label: "Expected impact", scale: "1 = small gain for few people · 3 = clear gain for a segment · 5 = large gain for many, or removes a serious blocker", weight: 1, lowerIsBetter: false },
  { key: "evidence", label: "Strength of evidence", scale: "1 = a single anecdote · 3 = several independent voices · 5 = consistent across independent sources and data", weight: 1, lowerIsBetter: false },
  { key: "effort", label: "Effort or complexity", scale: "1 = days, one team · 3 = a few weeks, two teams · 5 = months, many teams or new capability (lower is better)", weight: 1, lowerIsBetter: true },
  { key: "strategic", label: "Strategic relevance", scale: "1 = tangential · 3 = supports a stated objective · 5 = central to the product's current objective", weight: 1, lowerIsBetter: false },
];
export const MIN_KNOWN = 3;

export function productDims(productId: string): Dim[] {
  const p = get<{ prioritization: string | null }>("SELECT prioritization FROM products WHERE id=?", productId);
  const d = parse<Dim[] | null>(p?.prioritization, null);
  return d && d.length ? d : DEFAULT_DIMS;
}

export function saveDims(productId: string, dims: Dim[]) {
  if (dims.length < 1 || dims.length > 8) throw new DomainError("Use between 1 and 8 dimensions.");
  const keys = new Set<string>();
  for (const d of dims) {
    if (!d.label.trim() || !d.key.trim()) throw new DomainError("Every dimension needs a name.");
    if (keys.has(d.key)) throw new DomainError("Dimension keys must be unique.");
    keys.add(d.key);
    if (!(d.weight >= 0 && d.weight <= 10)) throw new DomainError("Weights must be between 0 and 10.");
  }
  run("UPDATE products SET prioritization=?, updated_at=? WHERE id=?", j(dims), now(), productId);
}

export type ScoreResult = {
  score: number | null; known: { key: string; label: string; value: number; used: number; weight: number }[]; missing: string[];
  formula: string; note: string;
};

export function computeScore(dims: Dim[], scores: Record<string, number | null | undefined>): ScoreResult {
  const known: ScoreResult["known"] = []; const missing: string[] = [];
  for (const d of dims) {
    const v = scores[d.key];
    if (v == null || Number.isNaN(v)) { missing.push(d.label); continue; }
    known.push({ key: d.key, label: d.label, value: v, used: d.lowerIsBetter ? 6 - v : v, weight: d.weight });
  }
  const wsum = known.reduce((a, k) => a + k.weight, 0);
  const formula = "score = Σ(weight × value) ÷ Σ(weight), over known dimensions only. Lower-is-better dimensions use (6 − value).";
  if (known.length < Math.min(MIN_KNOWN, dims.length) || wsum === 0)
    return { score: null, known, missing, formula, note: `Not scored: only ${known.length} of ${dims.length} dimensions are known (needs ${Math.min(MIN_KNOWN, dims.length)}). Unknown values are never treated as zero.` };
  const score = known.reduce((a, k) => a + k.weight * k.used, 0) / wsum;
  return { score, known, missing, formula, note: missing.length ? `Based on ${known.length} of ${dims.length} dimensions; ${missing.join(", ")} unknown and left out.` : `Based on all ${dims.length} dimensions.` };
}

const STRENGTH_VALUE: Record<Strength, number | null> = { strong: 5, moderate: 3, weak: 1, unknown: null };

/** Suggested evidence-strength value from linked findings; shown as a hint, never auto-applied. */
export function suggestEvidenceValue(opportunityId: string): { value: number | null; basis: string } {
  const fs = all<{ id: string }>(
    `SELECT f.id FROM links l JOIN findings f ON f.id=l.from_id WHERE l.to_type='opportunity' AND l.to_id=? AND l.from_type='finding' AND f.deleted_at IS NULL AND f.status='accepted'`, opportunityId);
  if (!fs.length) return { value: null, basis: "No accepted findings linked." };
  let best: Strength = "unknown"; const rank = { unknown: 0, weak: 1, moderate: 2, strong: 3 };
  for (const f of fs) {
    const rows = all<{ relation: string; source_id: string; participant: string; segment: string }>(
      `SELECT l.relation, e.source_id, s.participant, s.segment FROM links l JOIN excerpts e ON e.id=l.from_id JOIN sources s ON s.id=e.source_id
        WHERE l.to_type='finding' AND l.to_id=? AND l.from_type='excerpt'`, f.id);
    const s = strengthFor(rows).level;
    if (rank[s] > rank[best]) best = s;
  }
  return { value: STRENGTH_VALUE[best], basis: `Strongest linked finding is ${best} (${fs.length} finding${fs.length === 1 ? "" : "s"}).` };
}

export function setScores(productId: string, oppId: string, scores: Record<string, number | null>, override?: { score: number | null; rationale: string }) {
  assertInProduct(productId, "opportunity", oppId);
  const clean: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(scores)) {
    if (v == null) clean[k] = null;
    else if (v >= 1 && v <= 5) clean[k] = v;
    else throw new DomainError("Scores use a 1–5 scale.");
  }
  if (override && override.score != null && !override.rationale.trim()) throw new DomainError("A manual override needs a rationale.");
  run("UPDATE opportunities SET scores=?, override_score=?, override_rationale=?, updated_at=? WHERE id=?",
    j(clean), override?.score ?? null, override?.score != null ? override.rationale.trim() : "", now(), oppId);
}
