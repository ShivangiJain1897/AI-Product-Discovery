import { all, get, run, newId, now, tx, j, parse } from "./db";
import { DomainError, assertInProduct, link } from "./links";
import { logActivity } from "./log";
import { trunc } from "./entities";
import { ANALYSIS_TYPES } from "./types";
import { analyze, parseCsv, validate, fmtDuration, type Mapping, type Options, type Analysis as ELAnalysis, type Validation } from "./eventlog";
import { computeScore, productDims } from "./priority";
import { loadMap, diffMaps, handoffCount, activityCount } from "./process";

export type Summary = { label: string; value: string };
export type RunResults = {
  summary: Summary[]; items: string[]; detail?: unknown; note?: string; proposalId?: string; datasetId?: string;
};
export type RunInputs = {
  question: string; scope: string; config: unknown;
  sources: { id: string; title: string; version: number }[];
  extra?: Record<string, unknown>;
};
export type AnalysisRow = {
  id: string; product_id: string; initiative_id: string | null; type: string; title: string; question: string; scope: string;
  config: string; data: string; notes: string; interpretation: string; status: string; parent_analysis_id: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};
export type RunRow = { id: string; analysis_id: string; seq: number; mode: string; inputs: string; results: string; created_at: string };

export function initialData(type: string): Record<string, unknown> {
  switch (type) {
    case "problem_analysis": return { problem: "", context: "", symptoms: "", causes: [], alternatives: "" };
    case "solution_comparison": return { criteria: [{ key: "value", label: "User value" }, { key: "effort", label: "Effort to build and run" }, { key: "risk", label: "Risk / reversibility" }], conceptIds: [], ratings: {} };
    case "opportunity_analysis": return { opportunityIds: [] };
    case "assumption_analysis": return { category: "all" };
    case "future_state": return { mapId: "" };
    case "experiment_analysis": return { experimentId: "" };
    default: return {};
  }
}

export function createAnalysis(productId: string, d: {
  type: string; title: string; question?: string; initiativeId?: string | null; scope?: string; sourceIds?: string[];
  from?: { type: "finding" | "opportunity" | "source" | "analysis" | "experiment" | "decision"; id: string } | null; config?: unknown;
}) {
  if (!ANALYSIS_TYPES[d.type]) throw new DomainError("Unknown analysis type.");
  if (d.initiativeId) assertInProduct(productId, "initiative", d.initiativeId);
  if (!d.title.trim()) throw new DomainError("Give the analysis a title.");
  const id = newId("ana"); const ts = now();
  tx(() => {
    run(`INSERT INTO analyses (id, product_id, initiative_id, type, title, question, scope, config, data, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?)`,
      id, productId, d.initiativeId ?? null, d.type, d.title.trim(), d.question?.trim() ?? "", d.scope ?? "selected", j(d.config ?? {}), j(initialData(d.type)), ts, ts);
    for (const s of d.sourceIds ?? []) { assertInProduct(productId, "source", s); run("INSERT OR IGNORE INTO analysis_sources (analysis_id, source_id, added_at) VALUES (?,?,?)", id, s, ts); }
    if (d.from) link(productId, ["analysis", id], [d.from.type, d.from.id], "started_from");
    saveRevision(id, "Created");
    logActivity(productId, { initiativeId: d.initiativeId, analysisId: id, kind: "created", entityType: "analysis", entityId: id, summary: `Started ${ANALYSIS_TYPES[d.type].label.toLowerCase()}: ${trunc(d.title)}` });
  });
  return id;
}

export function getAnalysis(productId: string, id: string) {
  assertInProduct(productId, "analysis", id);
  return get<AnalysisRow>("SELECT * FROM analyses WHERE id=?", id)!;
}

export function updateAnalysis(productId: string, id: string, d: Partial<{ title: string; question: string; scope: string; config: unknown; data: unknown; notes: string; interpretation: string; status: string; initiativeId: string | null }>) {
  const a = getAnalysis(productId, id);
  const sets: string[] = []; const p: unknown[] = [];
  const set = (c: string, v: unknown) => { sets.push(`${c}=?`); p.push(v); };
  if (d.title !== undefined) { if (!d.title.trim()) throw new DomainError("Title cannot be empty."); set("title", d.title.trim()); }
  if (d.question !== undefined) set("question", d.question);
  if (d.scope !== undefined) { if (!["selected", "initiative", "product"].includes(d.scope)) throw new DomainError("Unknown evidence scope."); set("scope", d.scope); }
  if (d.config !== undefined) set("config", j(d.config));
  if (d.data !== undefined) set("data", j(d.data));
  if (d.notes !== undefined) set("notes", d.notes);
  if (d.interpretation !== undefined) set("interpretation", d.interpretation);
  if (d.status !== undefined) { if (!["draft", "in_progress", "completed"].includes(d.status)) throw new DomainError("Unknown status."); set("status", d.status); }
  if (d.initiativeId !== undefined) { if (d.initiativeId) assertInProduct(productId, "initiative", d.initiativeId); set("initiative_id", d.initiativeId); }
  if (!sets.length) return;
  set("updated_at", now());
  run(`UPDATE analyses SET ${sets.join(",")} WHERE id=?`, ...p as never[], id);
  if (d.status && d.status !== a.status) {
    saveRevision(id, `Status → ${d.status.replace("_", " ")}`);
    logActivity(productId, { initiativeId: a.initiative_id, analysisId: id, kind: "status", entityType: "analysis", entityId: id, summary: `Marked analysis ${d.status.replace("_", " ")}: ${trunc(a.title)}` });
  }
}

export function setAnalysisSources(productId: string, id: string, sourceIds: string[]) {
  getAnalysis(productId, id);
  for (const s of sourceIds) assertInProduct(productId, "source", s);
  tx(() => {
    run("DELETE FROM analysis_sources WHERE analysis_id=?", id);
    for (const s of sourceIds) run("INSERT INTO analysis_sources (analysis_id, source_id, added_at) VALUES (?,?,?)", id, s, now());
    run("UPDATE analyses SET updated_at=? WHERE id=?", now(), id);
  });
}

export function analysisSourceIds(a: AnalysisRow): string[] {
  const live = "s.deleted_at IS NULL";
  if (a.scope === "product") return all<{ id: string }>(`SELECT id FROM sources s WHERE product_id=? AND ${live}`, a.product_id).map((r) => r.id);
  if (a.scope === "initiative" && a.initiative_id)
    return all<{ id: string }>(`SELECT s.id FROM initiative_sources i JOIN sources s ON s.id=i.source_id WHERE i.initiative_id=? AND ${live}`, a.initiative_id).map((r) => r.id);
  return all<{ id: string }>(`SELECT s.id FROM analysis_sources x JOIN sources s ON s.id=x.source_id WHERE x.analysis_id=? AND ${live}`, a.id).map((r) => r.id);
}

export function saveRevision(analysisId: string, note = "") {
  const a = get<AnalysisRow>("SELECT * FROM analyses WHERE id=?", analysisId)!;
  const last = get<{ seq: number }>("SELECT MAX(seq) seq FROM analysis_revisions WHERE analysis_id=?", analysisId)?.seq ?? 0;
  const snap = {
    title: a.title, question: a.question, scope: a.scope, config: parse(a.config, {}), data: parse(a.data, {}),
    notes: a.notes, interpretation: a.interpretation, status: a.status,
    sourceIds: all<{ source_id: string }>("SELECT source_id FROM analysis_sources WHERE analysis_id=?", analysisId).map((r) => r.source_id),
  };
  const prev = get<{ snapshot: string }>("SELECT snapshot FROM analysis_revisions WHERE analysis_id=? AND seq=?", analysisId, last);
  if (prev && prev.snapshot === j(snap) && note === "") return last; // nothing changed
  run("INSERT INTO analysis_revisions (id, analysis_id, seq, note, snapshot, created_at) VALUES (?,?,?,?,?,?)", newId("rev"), analysisId, last + 1, note, j(snap), now());
  return last + 1;
}

export function restoreRevision(productId: string, analysisId: string, seq: number) {
  const a = getAnalysis(productId, analysisId);
  const r = get<{ snapshot: string }>("SELECT snapshot FROM analysis_revisions WHERE analysis_id=? AND seq=?", analysisId, seq);
  if (!r) throw new DomainError("Revision not found", "not_found");
  const s = parse<any>(r.snapshot, {});
  tx(() => {
    saveRevision(analysisId, `Before restoring revision ${seq}`);
    run("UPDATE analyses SET title=?, question=?, scope=?, config=?, data=?, notes=?, interpretation=?, status=?, updated_at=? WHERE id=?",
      s.title, s.question, s.scope, j(s.config), j(s.data), s.notes, s.interpretation, s.status, now(), analysisId);
    setAnalysisSources(productId, analysisId, (s.sourceIds ?? []).filter((id: string) => get("SELECT 1 x FROM sources WHERE id=? AND product_id=?", id, productId)));
    saveRevision(analysisId, `Restored revision ${seq}`);
    logActivity(productId, { initiativeId: a.initiative_id, analysisId, kind: "updated", entityType: "analysis", entityId: analysisId, summary: `Restored revision ${seq} of ${trunc(a.title)}` });
  });
}

/** Duplicate to explore a different question. Runs are not copied; inputs are. */
export function duplicateAnalysis(productId: string, id: string, title?: string) {
  const a = getAnalysis(productId, id);
  const nid = newId("ana"); const ts = now();
  tx(() => {
    run(`INSERT INTO analyses (id, product_id, initiative_id, type, title, question, scope, config, data, notes, interpretation, status, parent_analysis_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)`,
      nid, productId, a.initiative_id, a.type, title?.trim() || `${a.title} (copy)`, a.question, a.scope, a.config, a.data, "", "", a.id, ts, ts);
    for (const s of all<{ source_id: string }>("SELECT source_id FROM analysis_sources WHERE analysis_id=?", id))
      run("INSERT INTO analysis_sources (analysis_id, source_id, added_at) VALUES (?,?,?)", nid, s.source_id, ts);
    saveRevision(nid, `Duplicated from “${trunc(a.title, 40)}”`);
    logActivity(productId, { initiativeId: a.initiative_id, analysisId: nid, kind: "created", entityType: "analysis", entityId: nid, summary: `Duplicated analysis: ${trunc(a.title)}` });
  });
  return nid;
}

export function softDeleteAnalysis(productId: string, id: string) {
  const a = getAnalysis(productId, id);
  run("UPDATE analyses SET deleted_at=? WHERE id=?", now(), id);
  logActivity(productId, { initiativeId: a.initiative_id, kind: "deleted", entityType: "analysis", entityId: id, summary: `Deleted analysis: ${trunc(a.title)} (recoverable)` });
}

// ---------- runs ----------
export function listRuns(analysisId: string) {
  return all<RunRow>("SELECT * FROM analysis_runs WHERE analysis_id=? ORDER BY seq DESC", analysisId)
    .map((r) => ({ ...r, inputs: parse<RunInputs>(r.inputs, {} as RunInputs), results: parse<RunResults>(r.results, { summary: [], items: [] }) }));
}

export function insertRun(a: AnalysisRow, mode: string, inputs: RunInputs, results: RunResults) {
  const seq = (get<{ s: number }>("SELECT MAX(seq) s FROM analysis_runs WHERE analysis_id=?", a.id)?.s ?? 0) + 1;
  const id = newId("run");
  run("INSERT INTO analysis_runs (id, analysis_id, seq, mode, inputs, results, created_at) VALUES (?,?,?,?,?,?,?)", id, a.id, seq, mode, j(inputs), j(results), now());
  run("UPDATE analyses SET updated_at=?, status=CASE WHEN status='draft' THEN 'in_progress' ELSE status END WHERE id=?", now(), a.id);
  saveRevision(a.id, `Before run ${seq}`);
  logActivity(a.product_id, { initiativeId: a.initiative_id, analysisId: a.id, kind: "run", entityType: "analysis", entityId: a.id, summary: `Ran ${ANALYSIS_TYPES[a.type].label.toLowerCase()} (run ${seq}): ${trunc(a.title)}` });
  return { id, seq };
}

export function sourceSnapshot(ids: string[]) {
  return ids.map((id) => get<{ id: string; title: string; version: number }>("SELECT id, title, version FROM sources WHERE id=?", id)!).filter(Boolean);
}

export function baseInputs(a: AnalysisRow, sourceIds: string[], extra?: Record<string, unknown>): RunInputs {
  return { question: a.question, scope: a.scope, config: parse(a.config, {}), sources: sourceSnapshot(sourceIds), extra };
}

// ----- deterministic runners (AI-backed runs live in ai/) -----
export function runEventLog(productId: string, a: AnalysisRow, cfg: { sourceId: string; mapping: Mapping; options: Options; name?: string }) {
  assertInProduct(productId, "source", cfg.sourceId);
  const src = get<{ id: string; content: string; version: number; title: string }>("SELECT id, content, version, title FROM sources WHERE id=? AND deleted_at IS NULL", cfg.sourceId);
  if (!src) throw new DomainError("The event-log source is deleted or missing.");
  const parsed = parseCsv(src.content);
  const v = validate(parsed, cfg.mapping, cfg.options);
  if (!v.events.length) throw new DomainError("No rows were left to analyse after validation. Check the column mapping.");
  const res = analyze(v, cfg.mapping, cfg.options);
  const dsId = newId("eds");
  run("INSERT INTO event_datasets (id, product_id, source_id, source_version, analysis_id, name, mapping, options, validation, confirmed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    dsId, productId, src.id, src.version, a.id, cfg.name || src.title, j(cfg.mapping), j(cfg.options),
    j({ totalRows: v.totalRows, includedRows: v.includedRows, excludedRows: v.excludedRows, issues: v.issues.map(({ rows, ...rest }) => ({ ...rest, sampleRows: rows.slice(0, 10) })) }), now(), now());
  const s = res.span;
  const summary: Summary[] = [
    { label: "Cases", value: String(res.counts.cases) },
    { label: "Events", value: String(res.counts.events) },
    { label: "Variants", value: String(res.variants.length) },
    { label: "Median observed span", value: fmtDuration(s?.median) },
    { label: "90th percentile span", value: fmtDuration(s?.p90) },
    { label: "Rows excluded", value: `${res.dataQuality.excluded} of ${v.totalRows}` },
  ];
  const items = [
    ...res.gaps.slice(0, 3).map((g) => `Longest median gap between recorded events: ${g.from} → ${g.to} (${fmtDuration(g.median)}, n=${g.count})`),
    ...res.repeats.slice(0, 3).map((r) => `${r.activity} repeated within ${r.cases} case(s)`),
  ];
  const inputs = baseInputs({ ...a, config: j({ ...cfg }) }, [src.id], { datasetId: dsId, mapping: cfg.mapping, options: cfg.options });
  const r = insertRun(a, "deterministic", inputs, { summary, items, detail: res, datasetId: dsId });
  run("UPDATE analyses SET config=?, updated_at=? WHERE id=?", j({ sourceId: cfg.sourceId, mapping: cfg.mapping, options: cfg.options, name: cfg.name }), now(), a.id);
  run("INSERT OR IGNORE INTO analysis_sources (analysis_id, source_id, added_at) VALUES (?,?,?)", a.id, src.id, now());
  return r;
}

export function runOpportunityAnalysis(productId: string, a: AnalysisRow) {
  const dims = productDims(productId);
  const opps = all<any>(`SELECT * FROM opportunities WHERE product_id=? AND deleted_at IS NULL AND status<>'dismissed' ${a.initiative_id && a.scope !== "product" ? "AND initiative_id=?" : ""}`,
    ...(a.initiative_id && a.scope !== "product" ? [productId, a.initiative_id] : [productId]));
  const rows = opps.map((o) => {
    const sc = computeScore(dims, parse(o.scores, {}));
    return { id: o.id, title: o.title, score: o.override_score ?? sc.score, computed: sc.score, overridden: o.override_score != null, rationale: o.override_rationale, known: sc.known.length, of: dims.length, scores: parse(o.scores, {}) };
  }).sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  const summary: Summary[] = [
    { label: "Opportunities compared", value: String(rows.length) },
    { label: "Fully scored", value: String(rows.filter((r) => r.score != null).length) },
    { label: "Not scored (too many unknowns)", value: String(rows.filter((r) => r.score == null).length) },
  ];
  const items = rows.map((r) => `${r.title}: ${r.score == null ? "not scored" : r.score.toFixed(2)}${r.overridden ? " (manual override)" : ""}`);
  return insertRun(a, "deterministic", baseInputs(a, [], { opportunityIds: opps.map((o) => o.id), dims }), { summary, items, detail: { rows, dims }, note: "Scores are a comparison aid. They do not replace judgment." });
}

export function runAssumptionAnalysis(productId: string, a: AnalysisRow) {
  const data = parse<{ category?: string }>(a.data, {});
  const rows = all<any>(`SELECT * FROM assumptions WHERE product_id=? AND deleted_at IS NULL ${a.initiative_id && a.scope !== "product" ? "AND initiative_id=?" : ""}`,
    ...(a.initiative_id && a.scope !== "product" ? [productId, a.initiative_id] : [productId]))
    .filter((r) => !data.category || data.category === "all" || r.category === data.category);
  const imp = { high: 3, medium: 2, low: 1, unknown: 0 } as Record<string, number>;
  const sup = { strong: 0, moderate: 1, weak: 2, none: 3, unknown: 3 } as Record<string, number>;
  const scored = rows.filter((r) => !["supported", "refuted"].includes(r.status)).map((r) => ({
    id: r.id, statement: r.statement, category: r.category, importance: r.importance, support: r.support, status: r.status,
    priority: imp[r.importance] * (1 + sup[r.support]), critical: r.importance === "high" && ["weak", "none", "unknown"].includes(r.support),
  })).sort((x, y) => y.priority - x.priority);
  const summary: Summary[] = [
    { label: "Open assumptions", value: String(scored.length) },
    { label: "Consequential and weakly supported", value: String(scored.filter((s) => s.critical).length) },
    { label: "Importance not yet judged", value: String(scored.filter((s) => s.importance === "unknown").length) },
  ];
  return insertRun(a, "deterministic", baseInputs(a, [], { category: data.category ?? "all", assumptionIds: rows.map((r) => r.id) }), {
    summary, items: scored.filter((s) => s.critical).map((s) => s.statement), detail: { rows: scored },
    note: "Ranking = importance × (1 + how weakly supported). Unknown importance ranks lowest until you judge it.",
  });
}

export function runSolutionComparison(productId: string, a: AnalysisRow) {
  const d = parse<any>(a.data, {});
  const concepts = (d.conceptIds ?? []).map((id: string) => get<any>("SELECT id, title, intervention_type FROM solution_concepts WHERE id=? AND product_id=? AND deleted_at IS NULL", id, productId)).filter(Boolean);
  if (concepts.length < 2) throw new DomainError("Choose at least two solution concepts to compare.");
  const rows = concepts.map((c: any) => {
    const r = d.ratings?.[c.id] ?? {};
    const vals = (d.criteria as any[]).map((k) => r[k.key]?.value).filter((v: unknown) => typeof v === "number");
    return { id: c.id, title: c.title, type: c.intervention_type, ratings: r, rated: vals.length, of: d.criteria.length };
  });
  const summary: Summary[] = [{ label: "Concepts compared", value: String(rows.length) }, { label: "Criteria", value: String(d.criteria.length) },
    { label: "Ratings given", value: `${rows.reduce((s: number, r: any) => s + r.rated, 0)} of ${rows.length * d.criteria.length}` }];
  return insertRun(a, "manual", baseInputs(a, [], { conceptIds: concepts.map((c: any) => c.id), criteria: d.criteria }), {
    summary, items: rows.map((r: any) => `${r.title} (${r.rated}/${r.of} criteria rated)`), detail: { rows, criteria: d.criteria }, note: "Ratings are your judgments; blank cells stay unknown.",
  });
}

export function runFutureState(productId: string, a: AnalysisRow) {
  const d = parse<{ mapId?: string }>(a.data, {});
  if (!d.mapId) throw new DomainError("Choose a future-state proposal.");
  assertInProduct(productId, "process_map", d.mapId);
  const m = loadMap(d.mapId)! as any;
  const base = m.map.baseline_snapshot;
  if (m.map.kind !== "future" || !base) throw new DomainError("That map is not a future-state proposal with a baseline.");
  const diff = diffMaps(base, m);
  const c = (s: string) => diff.filter((x) => x.status === s).length;
  const summary: Summary[] = [
    { label: "Activities: baseline → proposal", value: `${activityCount(base.nodes)} → ${activityCount(m.nodes)}` },
    { label: "Handoffs: baseline → proposal", value: `${handoffCount(base.nodes, base.edges)} → ${handoffCount(m.nodes, m.edges)}` },
    { label: "Steps added / removed / modified", value: `${c("added")} / ${c("removed")} / ${c("modified")}` },
  ];
  return insertRun(a, "deterministic", baseInputs(a, [], { mapId: d.mapId, baselineTakenAt: base.takenAt }), {
    summary, items: diff.filter((x) => x.status !== "unchanged").map((x) => `${x.status}: ${(x.after ?? x.before)!.name}${x.changed.length ? ` (${x.changed.join(", ")})` : ""}`),
    detail: { diff: diff.map(({ before, after, ...r }) => ({ ...r, beforeName: before?.name, afterName: after?.name })) },
    note: "Counts come from the map structure. They describe design changes, not measured improvement.",
  });
}

export function runExperimentAnalysis(productId: string, a: AnalysisRow) {
  const d = parse<{ experimentId?: string }>(a.data, {});
  if (!d.experimentId) throw new DomainError("Choose an experiment to interpret.");
  assertInProduct(productId, "experiment", d.experimentId);
  const e = get<any>("SELECT * FROM experiments WHERE id=?", d.experimentId)!;
  const summary: Summary[] = [
    { label: "Experiment", value: e.title }, { label: "Status", value: e.status },
    { label: "Outcome", value: e.outcome ?? "not recorded" },
    { label: "Criterion set before running", value: e.criterion_locked_at ? "yes" : "no" },
  ];
  return insertRun(a, "manual", baseInputs(a, [], { experimentId: e.id }), {
    summary, items: [`Success criterion: ${e.success_criterion || "—"}`, `Results: ${e.results || "—"}`].filter(Boolean),
    detail: { success_criterion: e.success_criterion, results: e.results, interpretation: e.interpretation, limitations: e.limitations, outcome: e.outcome },
    note: "Results and interpretation stay separate. Inconclusive and negative outcomes are valid.",
  });
}

// ---------- freshness ----------
export function analysisFreshness(a: AnalysisRow): { outdated: boolean; reasons: string[] } {
  const last = get<RunRow>("SELECT * FROM analysis_runs WHERE analysis_id=? ORDER BY seq DESC LIMIT 1", a.id);
  if (!last) return { outdated: false, reasons: [] };
  const inp = parse<RunInputs>(last.inputs, {} as RunInputs);
  const reasons: string[] = [];
  const cur = new Map(all<{ id: string; title: string; version: number; deleted_at: string | null }>(
    `SELECT id, title, version, deleted_at FROM sources WHERE id IN (${(inp.sources ?? []).map(() => "?").join(",") || "''"})`, ...(inp.sources ?? []).map((s) => s.id)).map((s) => [s.id, s]));
  for (const s of inp.sources ?? []) {
    const c = cur.get(s.id);
    if (!c || c.deleted_at) reasons.push(`“${trunc(s.title, 40)}” was removed since run ${last.seq}.`);
    else if (c.version !== s.version) reasons.push(`“${trunc(s.title, 40)}” changed (v${s.version} → v${c.version}) since run ${last.seq}.`);
  }
  if (["research_synthesis", "custom", "event_log"].includes(a.type) && a.type !== "event_log") {
    const nowIds = analysisSourceIds(a);
    const ran = new Set((inp.sources ?? []).map((s) => s.id));
    const added = nowIds.filter((id) => !ran.has(id));
    if (added.length) reasons.push(`${added.length} source${added.length === 1 ? "" : "s"} added to its scope since run ${last.seq}: ${added.slice(0, 3).map((id) => `“${trunc(get<{ title: string }>("SELECT title FROM sources WHERE id=?", id)!.title, 30)}”`).join(", ")}.`);
  }
  const ex = inp.extra as Record<string, any> | undefined;
  if (a.type === "opportunity_analysis" && ex?.opportunityIds) {
    const changed = all<{ id: string }>(`SELECT id FROM opportunities WHERE product_id=? AND updated_at>? AND deleted_at IS NULL`, a.product_id, last.created_at);
    const fresh = a.scope === "product" || !a.initiative_id
      ? all<{ id: string }>("SELECT id FROM opportunities WHERE product_id=? AND deleted_at IS NULL", a.product_id)
      : all<{ id: string }>("SELECT id FROM opportunities WHERE initiative_id=? AND deleted_at IS NULL", a.initiative_id);
    const newer = fresh.filter((o) => !ex.opportunityIds.includes(o.id));
    if (newer.length) reasons.push(`${newer.length} opportunit${newer.length === 1 ? "y was" : "ies were"} added since run ${last.seq}.`);
    const edited = changed.filter((o) => ex.opportunityIds.includes(o.id));
    if (edited.length) reasons.push(`${edited.length} compared opportunit${edited.length === 1 ? "y was" : "ies were"} edited since run ${last.seq}.`);
  }
  if (a.type === "assumption_analysis") {
    const ch = get<{ n: number }>("SELECT COUNT(*) n FROM assumptions WHERE product_id=? AND updated_at>? AND deleted_at IS NULL", a.product_id, last.created_at)!.n;
    if (ch) reasons.push(`${ch} assumption${ch === 1 ? "" : "s"} changed since run ${last.seq}.`);
  }
  if (a.type === "future_state" && ex?.mapId) {
    const m = get<{ updated_at: string }>("SELECT updated_at FROM process_maps WHERE id=?", ex.mapId);
    if (m && m.updated_at > last.created_at) reasons.push(`The proposal map was edited since run ${last.seq}.`);
  }
  if (a.type === "experiment_analysis" && ex?.experimentId) {
    const m = get<{ updated_at: string }>("SELECT updated_at FROM experiments WHERE id=?", ex.experimentId);
    if (m && m.updated_at > last.created_at) reasons.push(`The experiment was updated since run ${last.seq}.`);
  }
  return { outdated: reasons.length > 0, reasons };
}

// ---------- compare runs ----------
export function compareRuns(productId: string, analysisId: string, seqA: number, seqB: number) {
  getAnalysis(productId, analysisId);
  const runs = listRuns(analysisId);
  const A = runs.find((r) => r.seq === seqA), B = runs.find((r) => r.seq === seqB);
  if (!A || !B) throw new DomainError("Run not found", "not_found");
  const sa = new Map(A.inputs.sources.map((s) => [s.id, s])), sb = new Map(B.inputs.sources.map((s) => [s.id, s]));
  const inputs = {
    added: B.inputs.sources.filter((s) => !sa.has(s.id)).map((s) => s.title),
    removed: A.inputs.sources.filter((s) => !sb.has(s.id)).map((s) => s.title),
    versionChanged: B.inputs.sources.filter((s) => sa.has(s.id) && sa.get(s.id)!.version !== s.version).map((s) => `${s.title}: v${sa.get(s.id)!.version} → v${s.version}`),
    questionChanged: A.inputs.question !== B.inputs.question,
  };
  const labels = [...new Set([...A.results.summary.map((s) => s.label), ...B.results.summary.map((s) => s.label)])];
  const metrics = labels.map((label) => {
    const a = A.results.summary.find((s) => s.label === label)?.value ?? "—", b = B.results.summary.find((s) => s.label === label)?.value ?? "—";
    return { label, a, b, changed: a !== b };
  });
  const ia = new Set(A.results.items), ib = new Set(B.results.items);
  return { a: { seq: A.seq, at: A.created_at, mode: A.mode }, b: { seq: B.seq, at: B.created_at, mode: B.mode }, inputs, metrics,
    items: { added: B.results.items.filter((x) => !ia.has(x)), removed: A.results.items.filter((x) => !ib.has(x)) } };
}

export type { ELAnalysis, Validation };
