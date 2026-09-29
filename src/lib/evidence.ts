import { all, get, run, newId, now, tx, j, parse } from "./db";
import { DomainError, assertInProduct, link, linksFrom } from "./links";
import { logActivity } from "./log";
import { parseCsv } from "./eventlog";
import { trunc, flagDependents } from "./entities";
import type { EntityType } from "./types";

export const MAX_SOURCE_CHARS = 2_000_000;

export type SourceInput = {
  title: string; sourceType?: string; date?: string | null; participant?: string; segment?: string;
  tags?: string[]; content: string; filename?: string | null; synthetic?: boolean; isDemo?: boolean;
};

export function createSource(productId: string, d: SourceInput, initiativeId?: string | null) {
  if (initiativeId) assertInProduct(productId, "initiative", initiativeId);
  const title = d.title?.trim();
  if (!title) throw new DomainError("Give the source a title so you can find it later.");
  if (!d.content || !d.content.trim()) throw new DomainError("This source has no content.");
  if (d.content.length > MAX_SOURCE_CHARS) throw new DomainError("This source is larger than 2 MB. Split it into smaller sources.");
  const isCsv = d.sourceType === "event_log" || /\.csv$/i.test(d.filename ?? "");
  const id = newId("src");
  const ts = now();
  tx(() => {
    run(`INSERT INTO sources (id, product_id, title, source_type, source_date, participant, segment, tags, content, content_kind, version, synthetic, is_demo, filename, imported_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)`,
      id, productId, title, d.sourceType ?? "other", d.date || null, d.participant?.trim() ?? "", d.segment?.trim() ?? "",
      j(d.tags ?? []), d.content, isCsv ? "csv" : "text", d.synthetic ? 1 : 0, d.isDemo ? 1 : 0, d.filename ?? null, ts, ts);
    run("INSERT INTO source_versions (id, source_id, version, title, content, change_note, created_at) VALUES (?,?,?,?,?,?,?)",
      newId("sv"), id, 1, title, d.content, "Imported", ts);
    if (initiativeId) run("INSERT OR IGNORE INTO initiative_sources (initiative_id, source_id, added_at) VALUES (?,?,?)", initiativeId, id, ts);
    logActivity(productId, { initiativeId, kind: "evidence_added", entityType: "source", entityId: id, summary: `Added evidence: ${trunc(title)}` });
  });
  return id;
}

export function linkSourceToInitiative(productId: string, initiativeId: string, sourceId: string) {
  assertInProduct(productId, "initiative", initiativeId);
  assertInProduct(productId, "source", sourceId);
  run("INSERT OR IGNORE INTO initiative_sources (initiative_id, source_id, added_at) VALUES (?,?,?)", initiativeId, sourceId, now());
}
export function unlinkSourceFromInitiative(productId: string, initiativeId: string, sourceId: string) {
  assertInProduct(productId, "initiative", initiativeId);
  run("DELETE FROM initiative_sources WHERE initiative_id=? AND source_id=?", initiativeId, sourceId);
}

type SrcRow = { id: string; product_id: string; title: string; content: string; content_kind: string; version: number };

export function updateSource(productId: string, id: string, d: Partial<SourceInput> & { changeNote?: string }) {
  assertInProduct(productId, "source", id);
  const cur = get<SrcRow>("SELECT * FROM sources WHERE id=?", id)!;
  const ts = now();
  let versionBumped = false;
  tx(() => {
    const sets: string[] = []; const p: unknown[] = [];
    const set = (c: string, v: unknown) => { sets.push(`${c}=?`); p.push(v); };
    if (d.title !== undefined) { if (!d.title.trim()) throw new DomainError("Title cannot be empty."); set("title", d.title.trim()); }
    if (d.sourceType !== undefined) set("source_type", d.sourceType);
    if (d.date !== undefined) set("source_date", d.date || null);
    if (d.participant !== undefined) set("participant", d.participant.trim());
    if (d.segment !== undefined) set("segment", d.segment.trim());
    if (d.tags !== undefined) set("tags", j(d.tags));
    const contentChanged = d.content !== undefined && d.content !== cur.content;
    if (contentChanged) {
      if (!d.content!.trim()) throw new DomainError("A source cannot be emptied. Delete it instead.");
      if (d.content!.length > MAX_SOURCE_CHARS) throw new DomainError("This source is larger than 2 MB.");
      set("content", d.content); set("version", cur.version + 1);
      versionBumped = true;
    }
    if (!sets.length) return;
    set("updated_at", ts);
    run(`UPDATE sources SET ${sets.join(",")} WHERE id=?`, ...p as never[], id);
    if (contentChanged) {
      const newTitle = d.title?.trim() ?? cur.title;
      run("INSERT INTO source_versions (id, source_id, version, title, content, change_note, created_at) VALUES (?,?,?,?,?,?,?)",
        newId("sv"), id, cur.version + 1, newTitle, d.content, d.changeNote ?? "", ts);
      const summary = reanchorAndFlag(productId, id, cur.content, d.content!, cur.version + 1, newTitle);
      logActivity(productId, { kind: "evidence_changed", entityType: "source", entityId: id,
        summary: `Evidence changed: ${trunc(newTitle)} (v${cur.version}→v${cur.version + 1}). ${summary}` });
    } else {
      logActivity(productId, { kind: "updated", entityType: "source", entityId: id, summary: `Edited evidence details: ${trunc(cur.title)}` });
    }
  });
  return { versionBumped };
}

/** Normalise for tolerant quote matching (whitespace, curly quotes). */
export function norm(s: string) {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
}

/** Locate a verbatim quote in content. Returns exact offsets into `content`. */
export function locateQuote(content: string, quote: string): [number, number] | null {
  const q = quote.trim();
  if (!q) return null;
  const i = content.indexOf(q);
  if (i >= 0) return [i, i + q.length];
  // whitespace/quote-tolerant match: build a regex from the words
  const words = q.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['\u2018\u2019]").replace(/"/g, '["\u201C\u201D]');
  const m = new RegExp(words.map(esc).join("\\s+")).exec(content);
  return m ? [m.index, m.index + m[0].length] : null;
}

function reanchorAndFlag(productId: string, sourceId: string, _old: string, next: string, newVersion: number, title: string) {
  const excerpts = all<{ id: string; start_offset: number | null; end_offset: number | null; text: string; row_ref: string | null }>(
    "SELECT * FROM excerpts WHERE source_id=?", sourceId);
  let moved = 0, broken = 0, ok = 0;
  const parsedNew = get<{ content_kind: string }>("SELECT content_kind FROM sources WHERE id=?", sourceId)!.content_kind === "csv" ? parseCsv(next) : null;
  for (const e of excerpts) {
    let status = "ok"; let start = e.start_offset, end = e.end_offset;
    if (e.row_ref && parsedNew) {
      const ref = parse<{ row: number; fields: Record<string, string> }>(e.row_ref, { row: 0, fields: {} });
      const row = parsedNew.rows[ref.row - 1];
      const same = row && Object.entries(ref.fields).every(([k, v]) => (row[k] ?? "") === v);
      status = same ? "ok" : "broken";
    } else if (start != null && end != null) {
      if (next.slice(start, end) === e.text) status = "ok";
      else {
        const loc = locateQuote(next, e.text);
        if (loc) { status = "moved"; [start, end] = loc; } else status = "broken";
      }
    }
    if (status === "ok") ok++; else if (status === "moved") moved++; else broken++;
    // Excerpt text is never rewritten: it preserves what the reader saw at v(source_version).
    run("UPDATE excerpts SET status=?, start_offset=?, end_offset=? WHERE id=?", status, start, end, e.id);
    if (status !== "broken") run("UPDATE excerpts SET source_version=? WHERE id=?", newVersion, e.id);
  }
  const detail = excerpts.length
    ? `${ok} excerpt(s) unchanged, ${moved} moved, ${broken} no longer found.`
    : "No excerpts were taken from it.";
  const reason = `Evidence “${trunc(title, 40)}” changed to v${newVersion}. ${detail}`;
  const findingIds = new Set<string>();
  for (const e of excerpts) for (const l of all<{ to_id: string }>("SELECT to_id FROM links WHERE from_type='excerpt' AND from_id=? AND to_type='finding'", e.id)) findingIds.add(l.to_id);
  for (const f of findingIds) {
    run("UPDATE findings SET needs_review=1, review_reason=? WHERE id=? AND deleted_at IS NULL", reason, f);
    for (const d of downstream("finding", f)) if (d.type === "decision")
      run("UPDATE decisions SET needs_review=1, review_reason=? WHERE id=? AND deleted_at IS NULL", `A finding it relies on needs review. ${reason}`, d.id);
  }
  // decisions linked to analysis runs that used this source
  for (const r of all<{ id: string; inputs: string }>(
    "SELECT r.id, r.inputs FROM analysis_runs r JOIN analyses a ON a.id=r.analysis_id WHERE a.product_id=?", productId)) {
    const inp = parse<{ sources?: { id: string }[] }>(r.inputs, {});
    if (inp.sources?.some((s) => s.id === sourceId))
      for (const l of all<{ to_id: string }>("SELECT to_id FROM links WHERE from_type='analysis_run' AND from_id=? AND to_type='decision'", r.id))
        run("UPDATE decisions SET needs_review=1, review_reason=? WHERE id=? AND deleted_at IS NULL", `An analysis it relies on used older evidence. ${reason}`, l.to_id);
  }
  return `${findingIds.size} finding(s) flagged for review.`;
}

/** Records reachable by following relationships forward (finding → opportunity → … → decision). */
export function downstream(type: EntityType, id: string, maxDepth = 6): { type: EntityType; id: string }[] {
  const seen = new Set<string>([`${type}:${id}`]);
  const out: { type: EntityType; id: string }[] = [];
  let frontier: [EntityType, string][] = [[type, id]];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: [EntityType, string][] = [];
    for (const [t, i] of frontier) for (const l of linksFrom(t, i)) {
      const k = `${l.to_type}:${l.to_id}`;
      if (seen.has(k)) continue;
      seen.add(k); out.push({ type: l.to_type, id: l.to_id }); next.push([l.to_type, l.to_id]);
    }
    frontier = next;
  }
  return out;
}

export function softDeleteSource(productId: string, id: string) {
  assertInProduct(productId, "source", id);
  const s = get<{ title: string; version: number }>("SELECT title, version FROM sources WHERE id=?", id)!;
  const reason = `Evidence “${trunc(s.title, 40)}” was deleted (recoverable).`;
  tx(() => {
    run("UPDATE sources SET deleted_at=? WHERE id=?", now(), id);
    for (const e of all<{ id: string }>("SELECT id FROM excerpts WHERE source_id=?", id))
      flagDependents(productId, "excerpt", e.id, reason);
  });
}

// ---------- excerpts ----------
export function createExcerpt(productId: string, sourceId: string, start: number, end: number) {
  assertInProduct(productId, "source", sourceId);
  const s = get<SrcRow>("SELECT * FROM sources WHERE id=?", sourceId)!;
  if (!(start >= 0 && end > start && end <= s.content.length)) throw new DomainError("That selection is outside the source text.");
  const text = s.content.slice(start, end);
  if (!text.trim()) throw new DomainError("Select some text first.");
  if (text.length > 4000) throw new DomainError("Select a shorter excerpt (up to 4,000 characters).");
  const ex = get<{ id: string }>("SELECT id FROM excerpts WHERE source_id=? AND source_version=? AND start_offset=? AND end_offset=?", sourceId, s.version, start, end);
  if (ex) return ex.id;
  const id = newId("exc");
  run("INSERT INTO excerpts (id, product_id, source_id, source_version, start_offset, end_offset, text, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, productId, sourceId, s.version, start, end, text, now());
  return id;
}

export function createRowExcerpt(productId: string, sourceId: string, rowNumber: number) {
  assertInProduct(productId, "source", sourceId);
  const s = get<SrcRow>("SELECT * FROM sources WHERE id=?", sourceId)!;
  if (s.content_kind !== "csv") throw new DomainError("Row references only apply to CSV sources.");
  const parsed = parseCsv(s.content);
  const row = parsed.rows[rowNumber - 1];
  if (!row) throw new DomainError(`Row ${rowNumber} does not exist.`);
  const fields: Record<string, string> = {};
  for (const h of parsed.headers) fields[h] = row[h] ?? "";
  const ref = j({ row: rowNumber, fields });
  const ex = get<{ id: string }>("SELECT id FROM excerpts WHERE source_id=? AND source_version=? AND row_ref=?", sourceId, s.version, ref);
  if (ex) return ex.id;
  const id = newId("exc");
  const text = `Row ${rowNumber}: ` + parsed.headers.map((h) => `${h}=${fields[h]}`).join("; ");
  run("INSERT INTO excerpts (id, product_id, source_id, source_version, text, row_ref, created_at) VALUES (?,?,?,?,?,?,?)",
    id, productId, sourceId, s.version, text, ref, now());
  return id;
}

export function addObservation(productId: string, d: { sourceId: string; excerptId?: string | null; initiativeId?: string | null; text: string; kind?: string }) {
  assertInProduct(productId, "source", d.sourceId);
  if (d.excerptId) {
    assertInProduct(productId, "excerpt", d.excerptId);
    const ex = get<{ source_id: string }>("SELECT source_id FROM excerpts WHERE id=?", d.excerptId)!;
    if (ex.source_id !== d.sourceId) throw new DomainError("That excerpt belongs to a different source.");
  }
  if (!d.text.trim()) throw new DomainError("Write what you observed.");
  const id = newId("obs");
  run("INSERT INTO observations (id, product_id, source_id, excerpt_id, initiative_id, text, kind, created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, productId, d.sourceId, d.excerptId ?? null, d.initiativeId ?? null, d.text.trim(), d.kind ?? "other", now());
  logActivity(productId, { initiativeId: d.initiativeId, kind: "created", entityType: "observation", entityId: id, summary: `Added observation: ${trunc(d.text)}` });
  return id;
}

/** Link an excerpt to a finding as supporting or contradicting evidence. */
export function linkExcerptToFinding(productId: string, excerptId: string, findingId: string, relation: "supports" | "contradicts" = "supports") {
  const id = link(productId, ["excerpt", excerptId], ["finding", findingId], relation);
  // an excerpt cannot both support and contradict the same finding
  run("DELETE FROM links WHERE from_type='excerpt' AND from_id=? AND to_type='finding' AND to_id=? AND relation<>?", excerptId, findingId, relation);
  return id;
}

/** Latest content check used by tests and the reader: does the stored excerpt still resolve? */
export function resolveExcerpt(excerptId: string): { ok: boolean; text: string; current: string | null; sourceId: string } {
  const e = get<{ source_id: string; text: string; start_offset: number | null; end_offset: number | null; row_ref: string | null }>("SELECT * FROM excerpts WHERE id=?", excerptId);
  if (!e) throw new DomainError("Excerpt not found", "not_found");
  const s = get<{ content: string }>("SELECT content FROM sources WHERE id=?", e.source_id)!;
  const current = e.start_offset != null && e.end_offset != null ? s.content.slice(e.start_offset, e.end_offset) : null;
  return { ok: current === e.text, text: e.text, current, sourceId: e.source_id };
}
