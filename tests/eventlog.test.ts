import { describe, expect, it } from "vitest";
import { analyze, parseCsv, parseTimestamp, percentile, stats, validate, DEFAULT_OPTIONS, fmtDuration } from "@/lib/eventlog";

const M = { caseId: "case", activity: "act", timestamp: "ts", actor: "team" };
// Hand-computed fixture. Times in hours from 2025-01-01 00:00.
// A: R(0) C(2) D(10)         span 10h   variant R>C>D
// B: R(0) C(4) C(6) D(30)    span 30h   variant R>C>C>D, C repeated
// C: R(0) C(1) D(2)          span 2h    variant R>C>D
// D: R(0) C(3) D(60)         span 60h   variant R>C>D
const H = (h: number) => { const d = new Date(Date.UTC(2025, 0, 1) + h * 3600000); return d.toISOString().slice(0, 19).replace("T", " "); };
const rows = [["A", "R", 0, "S"], ["A", "C", 2, "Ops"], ["A", "D", 10, "Ops"], ["B", "R", 0, "S"], ["B", "C", 4, "Ops"], ["B", "C", 6, "Ops"], ["B", "D", 30, "Fin"], ["C", "R", 0, "S"], ["C", "C", 1, "Ops"], ["C", "D", 2, "Ops"], ["D", "R", 0, "S"], ["D", "C", 3, "Ops"], ["D", "D", 60, "Fin"]] as const;
const csv = "case,act,ts,team\n" + rows.map((r) => `${r[0]},${r[1]},${H(r[2] as number)},${r[3]}`).join("\n");
const HR = 3600000;

describe("event-log calculations match hand-computed values", () => {
  const v = validate(parseCsv(csv), M, DEFAULT_OPTIONS);
  const a = analyze(v, M, DEFAULT_OPTIONS);
  it("counts cases, events and variants", () => {
    expect(a.counts.cases).toBe(4); expect(a.counts.events).toBe(13);
    expect(a.variants.map((x) => x.cases)).toEqual([3, 1]);
    expect(a.variants[0].key).toBe("R → C → D");
  });
  it("uses observed span, labelled as such", () => {
    expect(a.durationBasis).toBe("observed_span");
    expect(a.durationBasisLabel).toMatch(/not a confirmed cycle time/i);
    expect(a.span!.n).toBe(4); expect(a.span!.min).toBe(2 * HR); expect(a.span!.max).toBe(60 * HR);
    expect(a.span!.median).toBe(20 * HR);           // sorted 2,10,30,60 → (10+30)/2
    expect(a.span!.p90).toBeCloseTo(51 * HR);       // rank 2.7 → 30 + .7*30 = 51
  });
  it("finds repeated activities, handoffs and gaps", () => {
    expect(a.repeats).toEqual([{ activity: "C", cases: 1, share: 0.25, extraOccurrences: 1 }]);
    // S→Ops in all 4 cases; Ops→Fin in B and D
    expect(a.handoffs!.totalChanges).toBe(6); expect(a.handoffs!.casesWithChange).toBe(4);
    const g = a.gaps.find((x) => x.from === "C" && x.to === "D")!;
    expect(g.count).toBe(4); expect(g.median).toBe(16 * HR); // gaps 1h,8h,24h,57h → (8+24)/2
  });
  it("supports an end activity: durations only for cases that reach it", () => {
    const o = { ...DEFAULT_OPTIONS, endActivity: "C" };
    const x = analyze(validate(parseCsv(csv), M, o), M, o);
    expect(x.durationBasis).toBe("to_end_activity");
    expect(x.span!.n).toBe(4);                  // first C: 2,4,1,3
    expect(x.span!.median).toBe(2.5 * HR);
  });
  it("percentile and duration formatting", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5); expect(stats([])).toBeNull();
    expect(fmtDuration(90 * 60000)).toBe("1.5 h"); expect(fmtDuration(null)).toBe("—");
  });
});

describe("validation never silently repairs data", () => {
  const bad = ["case,act,ts,team",
    "A,R,2025-01-01 00:00:00,S", "A,R,2025-01-01 00:00:00,S",           // duplicate
    "A,C,2025-01-01 00:00:00,Ops",                                       // same timestamp as duplicate row
    "B,R,not-a-date,S", ",C,2025-01-02 00:00:00,S",                     // unparseable, missing
    "C,R,2025-01-03 00:00:00,S",                                         // single-event case
    "D,R,2025-01-04 00:00:00,S", "D,C,2025-01-04T10:00:00Z,S",           // mixed timezone
    "E,R,03/04/2025 10:00,S", "E,C,03/05/2025 10:00,S"].join("\n");
  const v = validate(parseCsv(bad), M, DEFAULT_OPTIONS);
  const code = (c: string) => v.issues.find((i) => i.code === c);
  it("counts and explains each problem", () => {
    expect(code("duplicate_rows")!.count).toBe(1);
    expect(code("unparseable_timestamp")!.count).toBe(1);
    expect(code("missing_required")!.count).toBe(1);
    expect(code("single_event_case")!.count).toBe(1);   // only case C; B's only row was unparseable
    expect(code("same_timestamp")).toBeTruthy();
    expect(code("mixed_timezones")).toBeTruthy();
    expect(code("ambiguous_date")!.count).toBe(2);
    for (const i of v.issues) expect(i.handling.length).toBeGreaterThan(10);
  });
  it("included + excluded equals total, nothing vanishes", () => {
    expect(v.includedRows + v.excludedRows).toBe(v.totalRows);
    expect(v.totalRows).toBe(10);
  });
  it("keeps duplicates when asked", () => {
    const k = validate(parseCsv(bad), M, { ...DEFAULT_OPTIONS, duplicates: "keep" });
    expect(k.includedRows).toBeGreaterThan(v.includedRows);
  });
  it("rejects end-before-start", () => {
    const t = "case,act,ts,s,e\nA,R,2025-01-01 10:00,2025-01-01 10:00,2025-01-01 09:00\nA,C,2025-01-02 10:00,2025-01-02 10:00,2025-01-02 11:00";
    const r = validate(parseCsv(t), { caseId: "case", activity: "act", timestamp: "ts", start: "s", end: "e" }, { ...DEFAULT_OPTIONS, singleEventCases: "keep" });
    expect(r.issues.find((i) => i.code === "invalid_start_end")!.count).toBe(1);
  });
  it("parses timestamps strictly", () => {
    expect(parseTimestamp("2025-02-30")).toBeNull(); expect(parseTimestamp("13/13/2025")).toBeNull();
    expect(parseTimestamp("2025-01-01T00:00:00+02:00")!.ms).toBe(Date.UTC(2024, 11, 31, 22));
    expect(parseTimestamp("25/12/2025")!.ambiguousDate).toBe(false);
  });
});
