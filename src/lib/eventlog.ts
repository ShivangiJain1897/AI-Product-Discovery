// Deterministic, pure event-log analysis. No AI, no database access.
// Every number shown in the UI for an event log comes from this file.
import Papa from "papaparse";

export type Mapping = {
  caseId: string;
  activity: string;
  timestamp: string;
  actor?: string;
  start?: string;
  end?: string;
  complete?: string;
};
export type Options = {
  /** Case is "complete" once this activity occurs; span = first event → first occurrence of it. */
  endActivity?: string;
  duplicates: "exclude" | "keep";
  singleEventCases: "exclude" | "keep";
  /** Used only for a/b/yyyy dates where both parts are <= 12. */
  dateOrder: "mdy" | "dmy";
};
export const DEFAULT_OPTIONS: Options = { duplicates: "exclude", singleEventCases: "exclude", dateOrder: "mdy" };

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; parseErrors: string[] };

export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim(),
  });
  const parseErrors = res.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  return { headers: res.meta.fields ?? [], rows: res.data, parseErrors };
}

/** Guess a mapping from header names. Users always confirm it. */
export function guessMapping(headers: string[]): Partial<Mapping> {
  const find = (...pats: RegExp[]) => headers.find((h) => pats.some((p) => p.test(h)));
  return {
    caseId: find(/^case[\s_-]*id$/i, /case/i, /^(instance|trace|ticket|application|order)[\s_-]*id$/i),
    activity: find(/^activity$/i, /activity|event[\s_-]*name|task|step|action/i),
    timestamp: find(/^timestamp$/i, /time[\s_-]*stamp|event[\s_-]*time|datetime|^time$|^date$/i),
    actor: find(/actor|team|resource|user|owner|role/i),
    start: find(/start/i),
    end: find(/(^|[\s_-])end|complete[\s_-]*time/i),
    complete: find(/completed?$|is[\s_-]*complete|case[\s_-]*complete|closed/i),
  };
}

export type ParsedTs = { ms: number; hasTz: boolean; ambiguousDate: boolean } | null;

export function parseTimestamp(raw: string, dateOrder: "mdy" | "dmy" = "mdy"): ParsedTs {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // ISO-like: 2025-03-04, 2025-03-04T10:00[:00[.sss]][Z|±hh[:mm]], with space allowed
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0", frac = "0", tz] = m;
    if (!validParts(+y, +mo, +d, +h, +mi, +sec)) return null;
    let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec, +frac.padEnd(3, "0"));
    if (tz && tz.toUpperCase() !== "Z") {
      const sign = tz[0] === "-" ? -1 : 1;
      const digits = tz.slice(1).replace(":", "");
      const off = (+digits.slice(0, 2)) * 60 + (+(digits.slice(2) || "0"));
      ms -= sign * off * 60000;
    }
    return { ms, hasTz: !!tz, ambiguousDate: false };
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, a, b, y, h = "0", mi = "0", sec = "0"] = m;
    let mo: number, d: number, ambiguous = false;
    if (+a > 12) { d = +a; mo = +b; }
    else if (+b > 12) { mo = +a; d = +b; }
    else { ambiguous = +a !== +b; if (dateOrder === "mdy") { mo = +a; d = +b; } else { d = +a; mo = +b; } }
    if (!validParts(+y, mo, d, +h, +mi, +sec)) return null;
    return { ms: Date.UTC(+y, mo - 1, d, +h, +mi, +sec), hasTz: false, ambiguousDate: ambiguous };
  }
  return null;
}
function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim;
}

export type Issue = {
  code: string;
  label: string;
  severity: "excluded" | "flagged" | "info";
  count: number;
  rows: number[]; // 1-based data row numbers (first 25)
  handling: string;
};
export type Event = {
  row: number; // data row number (1-based, excluding header)
  caseId: string;
  activity: string;
  ts: number;
  actor: string;
  start?: number;
  end?: number;
  complete: boolean;
};
export type Validation = {
  totalRows: number;
  includedRows: number;
  excludedRows: number;
  issues: Issue[];
  events: Event[];
  excludedCaseIds: string[];
};

const TRUTHY = new Set(["1", "true", "yes", "y", "t", "complete", "completed", "closed", "done"]);

export function validate(parsed: ParsedCsv, mapping: Mapping, options: Options): Validation {
  const issues = new Map<string, Issue>();
  const add = (code: string, label: string, severity: Issue["severity"], row: number, handling: string) => {
    let i = issues.get(code);
    if (!i) issues.set(code, (i = { code, label, severity, count: 0, rows: [], handling }));
    i.count++;
    if (i.rows.length < 25) i.rows.push(row);
  };
  const excluded = new Set<number>();
  const candidates: Event[] = [];
  let tzCount = 0, naiveCount = 0;

  parsed.rows.forEach((r, idx) => {
    const row = idx + 1;
    const caseId = (r[mapping.caseId] ?? "").trim();
    const activity = (r[mapping.activity] ?? "").trim();
    const tsRaw = (r[mapping.timestamp] ?? "").trim();
    if (!caseId || !activity || !tsRaw) {
      add("missing_required", "Missing a required value (case, activity or timestamp)", "excluded", row,
        "Row excluded. It cannot be placed in a case timeline.");
      excluded.add(row); return;
    }
    const ts = parseTimestamp(tsRaw, options.dateOrder);
    if (!ts) {
      add("unparseable_timestamp", "Timestamp could not be parsed", "excluded", row,
        "Row excluded. Supported: ISO 8601 (2025-03-04 10:15) and a/b/yyyy.");
      excluded.add(row); return;
    }
    if (ts.hasTz) tzCount++; else naiveCount++;
    if (ts.ambiguousDate) add("ambiguous_date", "Day/month order is ambiguous (e.g. 03/04/2025)", "flagged", row,
      `Kept. Interpreted as ${options.dateOrder === "mdy" ? "month/day" : "day/month"}/year — change this if wrong.`);
    let start: number | undefined, end: number | undefined;
    if (mapping.start && (r[mapping.start] ?? "").trim()) {
      const p = parseTimestamp(r[mapping.start], options.dateOrder);
      if (!p) { add("unparseable_timestamp", "Timestamp could not be parsed", "excluded", row, "Row excluded. Supported: ISO 8601 (2025-03-04 10:15) and a/b/yyyy."); excluded.add(row); return; }
      start = p.ms;
    }
    if (mapping.end && (r[mapping.end] ?? "").trim()) {
      const p = parseTimestamp(r[mapping.end], options.dateOrder);
      if (!p) { add("unparseable_timestamp", "Timestamp could not be parsed", "excluded", row, "Row excluded. Supported: ISO 8601 (2025-03-04 10:15) and a/b/yyyy."); excluded.add(row); return; }
      end = p.ms;
    }
    if (start !== undefined && end !== undefined && end < start) {
      add("invalid_start_end", "Activity end is earlier than its start", "excluded", row,
        "Row excluded. A negative activity duration is not plausible; check the export.");
      excluded.add(row); return;
    }
    candidates.push({
      row, caseId, activity, ts: ts.ms,
      actor: mapping.actor ? (r[mapping.actor] ?? "").trim() : "",
      start, end,
      complete: mapping.complete ? TRUTHY.has((r[mapping.complete] ?? "").trim().toLowerCase()) : false,
    });
  });

  if (tzCount > 0 && naiveCount > 0) {
    issues.set("mixed_timezones", {
      code: "mixed_timezones", label: "Some timestamps carry a timezone and some do not", severity: "flagged",
      count: naiveCount, rows: [],
      handling: "Kept. Offsets were applied where present; the rest were read as UTC. Durations that span both kinds may be off.",
    });
  } else if (naiveCount > 0) {
    issues.set("timezone_unspecified", {
      code: "timezone_unspecified", label: "Timestamps have no timezone", severity: "info",
      count: naiveCount, rows: [],
      handling: "Kept. All read at face value (as if UTC). Durations are consistent if the export used one timezone; daylight-saving shifts are not corrected.",
    });
  }

  // Duplicates: identical case+activity+timestamp+actor
  let events = candidates;
  const seen = new Map<string, number>();
  const dupRows: number[] = [];
  for (const e of candidates) {
    const key = `${e.caseId}\u0001${e.activity}\u0001${e.ts}\u0001${e.actor}`;
    if (seen.has(key)) dupRows.push(e.row); else seen.set(key, e.row);
  }
  if (dupRows.length) {
    issues.set("duplicate_rows", {
      code: "duplicate_rows", label: "Duplicate rows (same case, activity, time and actor)", severity: options.duplicates === "exclude" ? "excluded" : "flagged",
      count: dupRows.length, rows: dupRows.slice(0, 25),
      handling: options.duplicates === "exclude"
        ? "Repeat copies excluded; the first occurrence is kept. Switch to “keep” if these are real repeated events."
        : "Kept as real events. Activity counts and repeats may be inflated if these are export duplicates.",
    });
    if (options.duplicates === "exclude") {
      const d = new Set(dupRows);
      dupRows.forEach((r) => excluded.add(r));
      events = candidates.filter((e) => !d.has(e.row));
    }
  }

  // Same timestamp within a case (different activities)
  const byCase = groupByCase(events);
  const sameTs: number[] = [];
  for (const evs of byCase.values()) {
    for (let i = 1; i < evs.length; i++) if (evs[i].ts === evs[i - 1].ts) sameTs.push(evs[i].row);
  }
  if (sameTs.length) {
    issues.set("same_timestamp", {
      code: "same_timestamp", label: "Events in the same case share a timestamp", severity: "flagged",
      count: sameTs.length, rows: sameTs.slice(0, 25),
      handling: "Kept. Their order follows file order, so sequences and variants involving them are uncertain.",
    });
  }

  // Single-event cases
  const excludedCaseIds: string[] = [];
  const singles: number[] = [];
  for (const [cid, evs] of byCase) if (evs.length === 1) { singles.push(evs[0].row); excludedCaseIds.push(cid); }
  if (singles.length) {
    const ex = options.singleEventCases === "exclude";
    issues.set("single_event_case", {
      code: "single_event_case", label: "Cases with only one event", severity: ex ? "excluded" : "flagged",
      count: singles.length, rows: singles.slice(0, 25),
      handling: ex
        ? "Excluded. One event has no duration or sequence. Switch to “keep” to count them."
        : "Kept. They contribute zero-length spans, which lowers median durations.",
    });
    if (ex) {
      const s = new Set(singles);
      singles.forEach((r) => excluded.add(r));
      events = events.filter((e) => !s.has(e.row));
    }
  }

  const order = ["missing_required", "unparseable_timestamp", "invalid_start_end", "duplicate_rows", "single_event_case", "same_timestamp", "ambiguous_date", "mixed_timezones", "timezone_unspecified"];
  const list = [...issues.values()].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  return {
    totalRows: parsed.rows.length, includedRows: events.length, excludedRows: parsed.rows.length - events.length,
    issues: list, events, excludedCaseIds: ex(excludedCaseIds, options),
  };
}
function ex(ids: string[], o: Options) { return o.singleEventCases === "exclude" ? ids : []; }

function groupByCase(events: Event[]) {
  const m = new Map<string, Event[]>();
  for (const e of events) { const a = m.get(e.caseId); if (a) a.push(e); else m.set(e.caseId, [e]); }
  for (const a of m.values()) a.sort((x, y) => x.ts - y.ts || x.row - y.row);
  return m;
}

// ---------- Metrics ----------

export const METRIC_DEFS: Record<string, string> = {
  cases: "Number of distinct case IDs in the included rows.",
  events: "Number of included rows (each row is one recorded event).",
  activity_frequency: "How many events and how many distinct cases contain each activity.",
  variants: "A variant is the exact ordered sequence of activities in a case. Cases with the same sequence share a variant.",
  case_span: "Observed span = time from a case's first recorded event to its last recorded event (or to the chosen end activity). It is what the log shows, not a confirmed end-to-end cycle time — work before the first or after the last event is invisible.",
  percentile: "Percentiles use linear interpolation between ranked case spans. Median = 50th percentile; P90 means 90% of cases were at or below it.",
  repeats: "Repeated activity: an activity that appears more than once in the same case. It is a pattern to ask about, not proof of rework — it may be legitimate.",
  handoffs: "Actor change: consecutive events in a case recorded under different actors/teams. Requires an actor column.",
  transition_gap: "Elapsed time between consecutive recorded events, grouped by activity pair. It is NOT verified waiting time: people may have been working, or the system may only log at certain moments.",
  activity_duration: "Recorded activity duration = activity end minus activity start, only where both columns were mapped.",
};

export type Stats = { n: number; min: number; median: number; p75: number; p90: number; p95: number; max: number; mean: number };

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
export function stats(values: number[]): Stats | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length, min: s[0], median: percentile(s, 50), p75: percentile(s, 75), p90: percentile(s, 90),
    p95: percentile(s, 95), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

export type Analysis = {
  version: 1;
  durationBasis: "observed_span" | "to_end_activity" | "completion_flag";
  durationBasisLabel: string;
  counts: { cases: number; events: number; casesWithDuration: number; casesWithoutDuration: number };
  activities: { activity: string; events: number; cases: number; share: number }[];
  variants: { key: string; sequence: string[]; cases: number; share: number; span: Stats | null; caseIds: string[] }[];
  span: Stats | null;
  repeats: { activity: string; cases: number; share: number; extraOccurrences: number }[];
  handoffs: null | { available: true; totalChanges: number; casesWithChange: number; perCaseMean: number; pairs: { from: string; to: string; count: number }[] };
  gaps: { from: string; to: string; count: number; median: number; p90: number; total: number }[];
  activityDurations: null | { activity: string; n: number; median: number; p90: number }[];
  dataQuality: { included: number; excluded: number; flaggedIssues: string[] };
};

export function analyze(v: Validation, mapping: Mapping, options: Options): Analysis {
  const byCase = groupByCase(v.events);
  const nCases = byCase.size;

  // activities
  const actAgg = new Map<string, { events: number; cases: Set<string> }>();
  for (const e of v.events) {
    const a = actAgg.get(e.activity) ?? { events: 0, cases: new Set<string>() };
    a.events++; a.cases.add(e.caseId); actAgg.set(e.activity, a);
  }
  const activities = [...actAgg].map(([activity, a]) => ({ activity, events: a.events, cases: a.cases.size, share: nCases ? a.cases.size / nCases : 0 }))
    .sort((a, b) => b.events - a.events || a.activity.localeCompare(b.activity));

  // durations
  let basis: Analysis["durationBasis"] = "observed_span";
  let basisLabel = "Observed span: first to last recorded event per case. Not a confirmed cycle time.";
  if (options.endActivity) {
    basis = "to_end_activity";
    basisLabel = `First event to first “${options.endActivity}” per case. Cases that never reach it are excluded from duration statistics.`;
  } else if (mapping.complete) {
    basis = "completion_flag";
    basisLabel = "First event to the event where the completion indicator is true. Cases without one are excluded from duration statistics.";
  }
  const spanOf = (evs: Event[]): number | null => {
    if (basis === "observed_span") return evs[evs.length - 1].ts - evs[0].ts;
    const idx = basis === "to_end_activity" ? evs.findIndex((e) => e.activity === options.endActivity) : evs.findIndex((e) => e.complete);
    return idx < 0 ? null : evs[idx].ts - evs[0].ts;
  };
  const caseSpan = new Map<string, number | null>();
  for (const [cid, evs] of byCase) caseSpan.set(cid, spanOf(evs));
  const spans = [...caseSpan.values()].filter((x): x is number => x !== null);

  // variants
  const varAgg = new Map<string, { seq: string[]; caseIds: string[] }>();
  for (const [cid, evs] of byCase) {
    const seq = evs.map((e) => e.activity);
    const key = seq.join(" → ");
    const a = varAgg.get(key) ?? { seq, caseIds: [] };
    a.caseIds.push(cid); varAgg.set(key, a);
  }
  const variants = [...varAgg].map(([key, a]) => ({
    key, sequence: a.seq, cases: a.caseIds.length, share: nCases ? a.caseIds.length / nCases : 0,
    span: stats(a.caseIds.map((c) => caseSpan.get(c)).filter((x): x is number => x != null)),
    caseIds: a.caseIds.sort(),
  })).sort((a, b) => b.cases - a.cases || a.key.localeCompare(b.key));

  // repeats
  const repAgg = new Map<string, { cases: number; extra: number }>();
  for (const evs of byCase.values()) {
    const c = new Map<string, number>();
    evs.forEach((e) => c.set(e.activity, (c.get(e.activity) ?? 0) + 1));
    for (const [act, n] of c) if (n > 1) {
      const r = repAgg.get(act) ?? { cases: 0, extra: 0 };
      r.cases++; r.extra += n - 1; repAgg.set(act, r);
    }
  }
  const repeats = [...repAgg].map(([activity, r]) => ({ activity, cases: r.cases, share: nCases ? r.cases / nCases : 0, extraOccurrences: r.extra }))
    .sort((a, b) => b.cases - a.cases || a.activity.localeCompare(b.activity));

  // handoffs
  let handoffs: Analysis["handoffs"] = null;
  if (mapping.actor) {
    const pairs = new Map<string, number>();
    let total = 0, casesWith = 0;
    for (const evs of byCase.values()) {
      let any = false;
      for (let i = 1; i < evs.length; i++) {
        const a = evs[i - 1].actor, b = evs[i].actor;
        if (a && b && a !== b) { total++; any = true; const k = `${a}\u0001${b}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
      }
      if (any) casesWith++;
    }
    handoffs = {
      available: true, totalChanges: total, casesWithChange: casesWith, perCaseMean: nCases ? total / nCases : 0,
      pairs: [...pairs].map(([k, count]) => { const [from, to] = k.split("\u0001"); return { from, to, count }; })
        .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from)),
    };
  }

  // gaps
  const gapAgg = new Map<string, number[]>();
  for (const evs of byCase.values()) {
    for (let i = 1; i < evs.length; i++) {
      const k = `${evs[i - 1].activity}\u0001${evs[i].activity}`;
      const a = gapAgg.get(k) ?? []; a.push(evs[i].ts - evs[i - 1].ts); gapAgg.set(k, a);
    }
  }
  const gaps = [...gapAgg].map(([k, vals]) => {
    const [from, to] = k.split("\u0001");
    const s = stats(vals)!;
    return { from, to, count: vals.length, median: s.median, p90: s.p90, total: vals.reduce((a, b) => a + b, 0) };
  }).sort((a, b) => b.median - a.median || a.from.localeCompare(b.from));

  // activity durations
  let activityDurations: Analysis["activityDurations"] = null;
  if (mapping.start && mapping.end) {
    const d = new Map<string, number[]>();
    for (const e of v.events) if (e.start !== undefined && e.end !== undefined) {
      const a = d.get(e.activity) ?? []; a.push(e.end - e.start); d.set(e.activity, a);
    }
    activityDurations = [...d].map(([activity, vals]) => { const s = stats(vals)!; return { activity, n: s.n, median: s.median, p90: s.p90 }; })
      .sort((a, b) => b.median - a.median);
  }

  return {
    version: 1,
    durationBasis: basis, durationBasisLabel: basisLabel,
    counts: { cases: nCases, events: v.events.length, casesWithDuration: spans.length, casesWithoutDuration: nCases - spans.length },
    activities, variants, span: stats(spans), repeats, handoffs, gaps, activityDurations,
    dataQuality: {
      included: v.includedRows, excluded: v.excludedRows,
      flaggedIssues: v.issues.filter((i) => i.severity !== "info").map((i) => `${i.label}: ${i.count}`),
    },
  };
}

// ---------- formatting ----------
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const abs = Math.abs(ms);
  const min = abs / 60000, hr = min / 60, day = hr / 24;
  if (abs < 1000) return "0 s";
  if (min < 1) return `${Math.round(abs / 1000)} s`;
  if (hr < 1) return `${Math.round(min)} min`;
  if (day < 1) return `${hr.toFixed(1)} h`;
  return `${day.toFixed(1)} days`;
}
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A reference a finding/opportunity can carry back to the exact metric. */
export type MetricRef = { analysisId: string; runId: string; datasetId?: string; metric: string; key?: string; label: string; value: string };
