// Evidence strength is computed from the supporting excerpts, never taken from AI output.
// It distinguishes excerpt count from independent sources/participants.
import { all } from "./db";

export type Strength = "strong" | "moderate" | "weak" | "unknown";
export type StrengthInfo = {
  level: Strength; excerpts: number; sources: number; participants: number; independent: number;
  contradicting: number; explanation: string; segments: string[];
};

type Row = { excerpt_id: string; relation: string; source_id: string; participant: string; segment: string; title: string };

export function strengthFor(rows: { relation: string; source_id: string; participant: string; segment: string }[]): StrengthInfo {
  const sup = rows.filter((r) => r.relation === "supports");
  const con = rows.filter((r) => r.relation === "contradicts");
  const sources = new Set(sup.map((r) => r.source_id));
  const participants = new Set(sup.filter((r) => r.participant).map((r) => r.participant));
  // Independent voices: distinct participant labels; a source with no label counts as one voice.
  const voices = new Set(sup.map((r) => (r.participant ? `p:${r.participant}` : `s:${r.source_id}`)));
  const independent = voices.size;
  const segments = [...new Set(sup.map((r) => r.segment).filter(Boolean))];
  let level: Strength;
  if (sup.length === 0) level = "unknown";
  else if (independent >= 4) level = "strong";
  else if (independent >= 2) level = "moderate";
  else level = "weak";
  if (level === "strong" && con.length > 0) level = "moderate";
  const parts: string[] = [];
  if (sup.length === 0) parts.push("No supporting excerpt is linked yet, so strength cannot be assessed.");
  else {
    parts.push(`${sup.length} supporting excerpt${sup.length === 1 ? "" : "s"} from ${independent} independent ${independent === 1 ? "voice" : "voices"}` +
      ` across ${sources.size} source${sources.size === 1 ? "" : "s"}.`);
    if (sup.length > independent) parts.push("Several excerpts come from the same voice, so they count once toward independence.");
    if (independent === 1) parts.push("A single voice is an anecdote, not a pattern.");
    if (con.length) parts.push(`${con.length} contradicting excerpt${con.length === 1 ? "" : "s"} linked${level === "moderate" && independent >= 4 ? " (caps strength at moderate)" : ""}.`);
    if (segments.length === 1) parts.push(`All support is from one segment (${segments[0]}); do not generalise beyond it.`);
    if (segments.length > 1) parts.push(`Support spans segments: ${segments.join(", ")}.`);
    parts.push("Rule: 1 voice = weak, 2–3 = moderate, 4+ = strong.");
  }
  return { level, excerpts: sup.length, sources: sources.size, participants: participants.size, independent, contradicting: con.length, explanation: parts.join(" "), segments };
}

export type DataRef = { runId: string; note: string };

export function findingStrength(findingId: string): StrengthInfo {
  const rows = all<Row>(
    `SELECT l.relation, e.source_id, s.participant, s.segment
       FROM links l JOIN excerpts e ON e.id = l.from_id JOIN sources s ON s.id = e.source_id
      WHERE l.to_type='finding' AND l.to_id=? AND l.from_type='excerpt' AND s.deleted_at IS NULL`, findingId);
  const info = strengthFor(rows);
  // Operational-data support (event-log metrics) is a different kind of evidence: it shows what happened, not why.
  const refs = all<{ note: string }>(
    "SELECT note FROM links WHERE to_type='finding' AND to_id=? AND from_type='analysis_run' AND relation='derived_from'", findingId);
  if (refs.length && info.level === "unknown") {
    let n = 0;
    for (const r of refs) { try { n = Math.max(n, JSON.parse(r.note).cases ?? 0); } catch { /* ignore */ } }
    const level: Strength = n >= 30 ? "moderate" : "weak";
    return { ...info, level, explanation: `Derived from an operational event-log metric covering ${n || "an unknown number of"} case(s). It shows what was recorded, not why it happened, and is not corroborated by any interview excerpt yet.` };
  }
  if (refs.length) info.explanation += ` Also linked to ${refs.length} event-log metric reference(s), which show what was recorded, not why.`;
  return info;
}
