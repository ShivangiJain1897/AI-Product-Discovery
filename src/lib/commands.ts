// The single write path. The UI calls these through /api/command; tests call them directly.
import { z } from "zod";
import { all, get, run as sql, newId, now, tx, j, parse } from "./db";
import { DomainError, assertInProduct, link, unlink } from "./links";
import { logActivity } from "./log";
import { CRUD, createEntity, updateEntity, softDelete, restore, deletionImpact, trunc } from "./entities";
import type { EntityType } from "./types";
import { LIFECYCLES } from "./types";
import * as ev from "./evidence";
import * as proc from "./process";
import * as an from "./analyses";
import * as ai from "./ai";
import { generatePlan } from "./ai";
import * as brief from "./brief";
import { saveDims, setScores } from "./priority";
import { traceDecision, getInitiative, getProduct } from "./queries";
import { parseCsv, guessMapping, validate, DEFAULT_OPTIONS, type Mapping, type Options } from "./eventlog";
import type { Kind } from "./ai/schemas";
import { ITEM_SCHEMAS } from "./ai/schemas";
import * as docs from "./docs";
import { TOPIC_TYPES, CATALOG_BY_KEY } from "./catalog";
import { TEMPLATES } from "./templates";
import { entityHref } from "./routes";

type A = Record<string, any>;
const req = (v: unknown, msg: string) => { if (v === undefined || v === null || (typeof v === "string" && !v.trim())) throw new DomainError(msg); return v as any; };
const pid = (a: A) => { req(a.productId, "Missing product"); if (!get("SELECT 1 x FROM products WHERE id=?", a.productId)) throw new DomainError("Product not found", "not_found"); return a.productId as string; };

function touchInitiative(id?: string | null) { if (id) sql("UPDATE initiatives SET updated_at=? WHERE id=?", now(), id); }

const KINDS = Object.keys(ITEM_SCHEMAS) as Kind[];
const LINKABLE: EntityType[] = ["source", "excerpt", "observation", "finding", "opportunity", "concept", "assumption", "hypothesis", "experiment", "decision", "process_node", "process_map", "analysis", "analysis_run", "initiative"];

function snapshotDecision(productId: string, id: string) {
  const t = traceDecision(productId, id);
  const snap = [
    ...t.findings.flatMap((f) => f.excerpts.map((e) => ({ kind: "excerpt", id: e.id, findingId: f.id, sourceId: e.source_id, sourceTitle: e.source_title, sourceVersion: e.version }))),
    ...t.runs.map((r) => ({ kind: "analysis_run", id: r.id, analysisId: r.analysis_id, title: r.analysis_title, seq: r.seq, sources: r.sources.map((s) => ({ id: s.id, version: s.version })) })),
    ...t.experiments.map((e) => ({ kind: "experiment", id: e.id, title: e.title, outcome: e.outcome })),
  ];
  sql("UPDATE decisions SET evidence_snapshot=? WHERE id=?", j(snap), id);
}

const H: Record<string, (a: A) => any | Promise<any>> = {
  // ---------- products ----------
  "product.create": (a) => {
    // A name is optional when the caller says so (auto): Clarity assigns "Untitled product", "Untitled product 2", … and the user can rename it any time.
    let name = String(a.name ?? "").trim();
    if (!name && a.auto) {
      const taken = new Set(all<any>("SELECT name FROM products").map((r) => r.name));
      name = "Untitled product";
      for (let n = 2; taken.has(name); n++) name = `Untitled product ${n}`;
    }
    if (!name) throw new DomainError("Give the product a name.");
    const id = newId("prd"); const ts = now();
    sql("INSERT INTO products (id, name, description, last_opened_at, created_at, updated_at) VALUES (?,?,?,?,?,?)", id, name, a.description ?? "", ts, ts, ts);
    logActivity(id, { kind: "created", entityType: "product", entityId: id, summary: `Created product ${name}` });
    return { id };
  },
  "product.update": (a) => {
    const id = pid({ productId: a.id }); const sets: string[] = []; const p: unknown[] = [];
    for (const k of ["name", "description", "lifecycle", "target_users", "objectives", "context"]) if (k in a) {
      if (k === "name" && !String(a[k]).trim()) throw new DomainError("A product needs a name.");
      if (k === "lifecycle" && !(LIFECYCLES as readonly string[]).includes(a[k])) throw new DomainError("Unknown lifecycle stage.");
      sets.push(`${k}=?`); p.push(a[k]);
    }
    if (sets.length) { sql(`UPDATE products SET ${sets.join(",")}, updated_at=? WHERE id=?`, ...p as never[], now(), id); logActivity(id, { kind: "updated", entityType: "product", entityId: id, summary: "Updated product context" }); }
    return { id };
  },
  "product.archive": (a) => { const id = pid({ productId: a.id }); sql("UPDATE products SET archived_at=? WHERE id=?", now(), id); return { id }; },
  "product.restore": (a) => { const id = pid({ productId: a.id }); sql("UPDATE products SET archived_at=NULL WHERE id=?", id); return { id }; },
  "product.touch": (a) => { const id = pid({ productId: a.id }); sql("UPDATE products SET last_opened_at=? WHERE id=?", now(), id); return {}; },

  // ---------- initiatives ----------
  "initiative.create": async (a) => {
    const productId = pid(a);
    const question = String(req(a.question, "Write the question you want to answer. “I don't know yet” is fine to refine later.")).trim();
    const title = (a.title?.trim()) || trunc(question.replace(/\?$/, ""), 70);
    const mode = ["question", "evidence", "process"].includes(a.mode) ? a.mode : "question";
    const ctx = { question, affected: a.affected ?? "", outcome: a.outcome ?? "", decision: a.decision ?? "", constraints: a.constraints ?? "", mode };
    const plan = await generatePlan({ productId, ...ctx });
    const id = newId("ini"); const ts = now();
    tx(() => {
      sql(`INSERT INTO initiatives (id, product_id, title, question, refined_question, refined_status, affected, outcome, decision_to_inform, constraints, plan, status, process_enabled, started_mode, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`,
        id, productId, title, question, plan.refinedQuestion, plan.refinedQuestion.trim() === question ? "none" : "proposed", ctx.affected, ctx.outcome, ctx.decision, ctx.constraints, j(plan), mode === "process" ? 1 : 0, mode, ts, ts);
      logActivity(productId, { initiativeId: id, kind: "created", entityType: "initiative", entityId: id, summary: `Started discovery: ${trunc(title)}` });
    });
    return { id };
  },
  "topic.create": async (a) => {
    const productId = pid(a);
    const type = a.type in TOPIC_TYPES ? a.type : "question";
    const text = String(req(a.text, "Describe what you’re working on — a sentence is enough.")).trim().slice(0, 20000);
    const items: string[] = [...new Set<string>(a.items ?? [])].filter((k) => k in CATALOG_BY_KEY);
    const firstLine = text.split("\n")[0].replace(/\s+/g, " ").trim();
    const question = (type === "question" ? firstLine : firstLine).slice(0, 220);
    const title = (a.title?.trim()) || trunc(question.replace(/[?.]+$/, ""), 70);
    const ctx = { question, affected: a.affected ?? "", outcome: a.outcome ?? "", decision: a.decision ?? "", constraints: a.constraints ?? "", mode: "question" };
    const plan = await generatePlan({ productId, ...ctx });
    const id = newId("ini"); const ts = now();
    tx(() => {
      sql(`INSERT INTO initiatives (id, product_id, title, question, refined_question, refined_status, affected, outcome, decision_to_inform, constraints, plan, status, process_enabled, started_mode, topic_type, topic_text, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?)`,
        id, productId, title, question, plan.refinedQuestion, plan.refinedQuestion.trim() === question ? "none" : "proposed", ctx.affected, ctx.outcome, ctx.decision, ctx.constraints, j(plan),
        items.some((k) => ["process_mapping", "event_log"].includes(k)) ? 1 : 0, "question", type, text, ts, ts);
      if (a.background && String(a.background).trim()) ev.createSource(productId, { title: `Background: ${trunc(title, 50)}`, sourceType: "other", content: String(a.background), tags: ["topic background"] }, id);
      items.forEach((k, i) => { const aid = an.createAnalysis(productId, { type: k, title: CATALOG_BY_KEY[k].label, question, initiativeId: id, scope: "initiative" }); sql("UPDATE analyses SET plan_order=? WHERE id=?", i + 1, aid); });
      logActivity(productId, { initiativeId: id, kind: "created", entityType: "initiative", entityId: id, summary: `Started ${type}: ${trunc(title)}${items.length ? ` — planned ${items.length} piece(s) of work` : ""}` });
    });
    return { id };
  },
  "topic.addWork": (a) => {
    const productId = pid(a); getInitiative(productId, a.initiativeId);
    const items: string[] = [...new Set<string>(a.items ?? [])].filter((k) => k in CATALOG_BY_KEY);
    if (!items.length) throw new DomainError("Choose at least one thing to do.");
    const ini = getInitiative(productId, a.initiativeId);
    const max = get<any>("SELECT MAX(plan_order) m FROM analyses WHERE initiative_id=?", a.initiativeId)?.m ?? 0;
    const created: string[] = []; const skipped: string[] = [];
    tx(() => items.forEach((k, i) => {
      const dupe = get("SELECT 1 x FROM analyses a WHERE a.initiative_id=? AND a.type=? AND a.deleted_at IS NULL AND a.status='draft' AND NOT EXISTS (SELECT 1 FROM analysis_runs r WHERE r.analysis_id=a.id)", a.initiativeId, k);
      if (dupe) { skipped.push(CATALOG_BY_KEY[k].label); return; }
      const aid = an.createAnalysis(productId, { type: k, title: CATALOG_BY_KEY[k].label, question: ini.question, initiativeId: a.initiativeId, scope: "initiative" });
      sql("UPDATE analyses SET plan_order=? WHERE id=?", max + i + 1, aid); created.push(aid);
      if (["process_mapping", "event_log"].includes(k)) sql("UPDATE initiatives SET process_enabled=1 WHERE id=?", a.initiativeId);
    }));
    touchInitiative(a.initiativeId);
    return { created, skipped };
  },
  "doc.generate": async (a) => { const p = pid(a); return docs.generateDoc(p, a.id, { answers: a.answers, useRecords: a.useRecords }); },
  "doc.apply": (a) => { docs.applyDraft(pid(a), a.id, a.seq, a.keys ?? []); return {}; },
  "doc.keepMine": (a) => { docs.keepMine(pid(a), a.id, a.keys ?? []); return {}; },
  "doc.saveSection": (a) => { docs.saveSection(pid(a), a.id, a.key, a.value); return {}; },
  "doc.saveAnswers": (a) => { docs.saveAnswers(pid(a), a.id, a.answers ?? {}); return {}; },
  "doc.setRecords": (a) => { const p = pid(a); const row = an.getAnalysis(p, a.id); const d = docs.readDocData(row); d.useRecords = !!a.useRecords; sql("UPDATE analyses SET data=?, updated_at=? WHERE id=?", j(d), now(), a.id); return {}; },

  "initiative.update": (a) => {
    const productId = pid(a); getInitiative(productId, a.id);
    const f = ["title", "question", "affected", "outcome", "decision_to_inform", "scope", "constraints", "topic_text", "topic_type"]; const sets: string[] = []; const p: unknown[] = [];
    for (const k of f) if (k in a.fields) { if ((k === "title" || k === "question") && !String(a.fields[k]).trim()) throw new DomainError("This cannot be empty."); sets.push(`${k}=?`); p.push(a.fields[k]); }
    if (sets.length) { sql(`UPDATE initiatives SET ${sets.join(",")}, updated_at=? WHERE id=?`, ...p as never[], now(), a.id); logActivity(productId, { initiativeId: a.id, kind: "updated", entityType: "initiative", entityId: a.id, summary: "Updated the discovery frame" }); }
    return {};
  },
  "initiative.setStatus": (a) => {
    const productId = pid(a); const i = getInitiative(productId, a.id);
    if (!["active", "paused", "completed", "archived"].includes(a.status)) throw new DomainError("Unknown status.");
    sql("UPDATE initiatives SET status=?, closed_at=?, updated_at=? WHERE id=?", a.status, ["completed", "archived"].includes(a.status) ? now() : null, now(), a.id);
    const verb = { active: i.status === "active" ? "Resumed" : "Reopened", paused: "Paused", completed: "Completed", archived: "Archived" }[a.status as string];
    logActivity(productId, { initiativeId: a.id, kind: "status", entityType: "initiative", entityId: a.id, summary: `${verb} discovery: ${trunc(i.title)}` });
    return {};
  },
  "initiative.refined": (a) => {
    const productId = pid(a); getInitiative(productId, a.id);
    if (a.action === "accept") sql("UPDATE initiatives SET refined_status='accepted', refined_question=COALESCE(?, refined_question), updated_at=? WHERE id=?", a.text ?? null, now(), a.id);
    else if (a.action === "dismiss") sql("UPDATE initiatives SET refined_status='dismissed', updated_at=? WHERE id=?", now(), a.id);
    else throw new DomainError("Unknown action.");
    return {};
  },
  "initiative.savePlan": (a) => {
    const productId = pid(a); const i = getInitiative(productId, a.id);
    sql("UPDATE initiatives SET plan=?, updated_at=? WHERE id=?", j({ ...i.plan, ...a.plan, edited: true }), now(), a.id); return {};
  },
  "initiative.processEnabled": (a) => { const productId = pid(a); getInitiative(productId, a.id); sql("UPDATE initiatives SET process_enabled=?, updated_at=? WHERE id=?", a.enabled ? 1 : 0, now(), a.id); return {}; },

  // ---------- evidence ----------
  "source.create": (a) => {
    const productId = pid(a);
    const id = ev.createSource(productId, { title: a.title, sourceType: a.sourceType, date: a.date, participant: a.participant, segment: a.segment, tags: a.tags, content: a.content, filename: a.filename }, a.initiativeId);
    // new evidence may make earlier analyses outdated; that is computed, not silently applied
    touchInitiative(a.initiativeId);
    return { id };
  },
  "source.update": (a) => { const productId = pid(a); const r = ev.updateSource(productId, a.id, a.fields); return r; },
  "source.delete": (a) => { const productId = pid(a); ev.softDeleteSource(productId, a.id); return {}; },
  "source.restore": (a) => { const productId = pid(a); restore("source", productId, a.id); return {}; },
  "source.linkInitiative": (a) => {
    const productId = pid(a);
    if (a.linked === false) ev.unlinkSourceFromInitiative(productId, a.initiativeId, a.sourceId); else ev.linkSourceToInitiative(productId, a.initiativeId, a.sourceId);
    touchInitiative(a.initiativeId); return {};
  },
  "excerpt.create": (a) => ({ id: ev.createExcerpt(pid(a), a.sourceId, a.start, a.end) }),
  "excerpt.createRow": (a) => ({ id: ev.createRowExcerpt(pid(a), a.sourceId, a.row) }),
  "observation.create": (a) => ({ id: ev.addObservation(pid(a), a as any) }),
  "observation.delete": (a) => { const p = pid(a); assertInProduct(p, "observation", a.id); sql("UPDATE observations SET deleted_at=? WHERE id=?", now(), a.id); return {}; },

  // ---------- findings ----------
  "finding.create": (a) => tx(() => {
    const productId = pid(a);
    const id = createEntity("finding", productId, { statement: a.statement, interpretation: a.interpretation, limitations: a.limitations, follow_up: a.followUp, segment: a.segment, origin: "manual", status: "accepted" }, a.initiativeId);
    for (const x of a.excerpts ?? []) ev.linkExcerptToFinding(productId, x.id, id, x.relation === "contradicts" ? "contradicts" : "supports");
    touchInitiative(a.initiativeId);
    return { id };
  }),
  "finding.linkExcerpt": (a) => { const p = pid(a); assertInProduct(p, "finding", a.findingId); assertInProduct(p, "excerpt", a.excerptId); ev.linkExcerptToFinding(p, a.excerptId, a.findingId, a.relation === "contradicts" ? "contradicts" : "supports"); return {}; },
  "finding.unlinkExcerpt": (a) => { const p = pid(a); sql("DELETE FROM links WHERE product_id=? AND from_type='excerpt' AND from_id=? AND to_type='finding' AND to_id=?", p, a.excerptId, a.findingId); return {}; },
  "finding.setStatus": (a) => {
    const p = pid(a); assertInProduct(p, "finding", a.id);
    if (!["proposed", "accepted", "dismissed", "superseded"].includes(a.status)) throw new DomainError("Unknown status.");
    sql("UPDATE findings SET status=?, superseded_by=?, updated_at=? WHERE id=?", a.status, a.status === "superseded" ? (a.supersededBy ?? null) : null, now(), a.id);
    logActivity(p, { kind: "status", entityType: "finding", entityId: a.id, summary: `Marked finding ${a.status}` });
    return {};
  },
  "finding.markReviewed": (a) => { const p = pid(a); assertInProduct(p, "finding", a.id); sql("UPDATE findings SET needs_review=0, review_reason='', updated_at=? WHERE id=?", now(), a.id); return {}; },
  "finding.merge": (a) => tx(() => {
    const p = pid(a);
    if (a.fromId === a.intoId) throw new DomainError("Choose two different findings to merge.");
    assertInProduct(p, "finding", a.fromId); assertInProduct(p, "finding", a.intoId);
    for (const l of all<any>("SELECT * FROM links WHERE to_type='finding' AND to_id=?", a.fromId)) {
      const dup = get("SELECT 1 x FROM links WHERE from_type=? AND from_id=? AND to_type='finding' AND to_id=? AND relation=?", l.from_type, l.from_id, a.intoId, l.relation);
      if (dup) sql("DELETE FROM links WHERE id=?", l.id); else sql("UPDATE links SET to_id=? WHERE id=?", a.intoId, l.id);
    }
    for (const l of all<any>("SELECT * FROM links WHERE from_type='finding' AND from_id=?", a.fromId)) {
      const dup = get("SELECT 1 x FROM links WHERE from_type='finding' AND from_id=? AND to_type=? AND to_id=? AND relation=?", a.intoId, l.to_type, l.to_id, l.relation);
      if (dup) sql("DELETE FROM links WHERE id=?", l.id); else sql("UPDATE links SET from_id=? WHERE id=?", a.intoId, l.id);
    }
    sql("UPDATE findings SET status='superseded', superseded_by=?, updated_at=? WHERE id=?", a.intoId, now(), a.fromId);
    logActivity(p, { kind: "merged", entityType: "finding", entityId: a.intoId, summary: "Merged two findings; the earlier one is kept as superseded" });
    return {};
  }),

  // ---------- generic objects ----------
  "entity.create": (a) => {
    const productId = pid(a);
    const type = a.type as EntityType;
    if (!CRUD[type]) throw new DomainError("Unsupported object type");
    if (type === "experiment") checkExperimentRules(null, a.data);
    const id = createEntity(type, productId, a.data ?? {}, a.initiativeId);
    for (const l of a.links ?? []) link(productId, l.direction === "in" ? [l.type, l.id] : [type, id], l.direction === "in" ? [type, id] : [l.type, l.id], l.relation);
    if (type === "decision") snapshotDecision(productId, id);
    touchInitiative(a.initiativeId);
    return { id };
  },
  "entity.update": (a) => {
    const productId = pid(a); const type = a.type as EntityType;
    if (type === "experiment") checkExperimentRules(get("SELECT * FROM experiments WHERE id=? AND product_id=?", a.id, productId), a.data);
    if (type === "experiment") {
      const d = a.data as A;
      const cur = get<any>("SELECT * FROM experiments WHERE id=?", a.id);
      const willRun = (d.status === "running" || d.status === "completed") || (d.results && String(d.results).trim());
      if (cur && !cur.criterion_locked_at && willRun && (d.success_criterion ?? cur.success_criterion)?.trim()) sql("UPDATE experiments SET criterion_locked_at=? WHERE id=?", now(), a.id);
    }
    updateEntity(type, productId, a.id, a.data);
    if (type === "decision") { sql("UPDATE decisions SET needs_review=0, review_reason='' WHERE id=?", a.id); snapshotDecision(productId, a.id); }
    const row = get<any>(`SELECT initiative_id FROM ${CRUD[type]!.table} WHERE id=?`, a.id); touchInitiative(row?.initiative_id);
    return {};
  },
  "entity.delete": (a) => { const productId = pid(a); return softDelete(a.type, productId, a.id); },
  "entity.restore": (a) => { const productId = pid(a); restore(a.type, productId, a.id); return {}; },
  "entity.impact": (a) => { const productId = pid(a); assertInProduct(productId, a.type, a.id); return deletionImpact(a.type, a.id); },
  "decision.reaffirm": (a) => { const p = pid(a); assertInProduct(p, "decision", a.id); sql("UPDATE decisions SET needs_review=0, review_reason='', updated_at=? WHERE id=?", now(), a.id); snapshotDecision(p, a.id); logActivity(p, { kind: "updated", entityType: "decision", entityId: a.id, summary: "Reviewed and reaffirmed a decision against current evidence" }); return {}; },
  "decision.supersede": (a) => { const p = pid(a); assertInProduct(p, "decision", a.id); sql("UPDATE decisions SET status='superseded', updated_at=? WHERE id=?", now(), a.id); return {}; },

  // ---------- links ----------
  "link.add": (a) => {
    const productId = pid(a);
    if (!LINKABLE.includes(a.fromType) || !LINKABLE.includes(a.toType)) throw new DomainError("These records cannot be linked.");
    if (a.fromType === a.toType && a.fromId === a.toId) throw new DomainError("A record cannot link to itself.");
    const id = link(productId, [a.fromType, a.fromId], [a.toType, a.toId], String(req(a.relation, "Missing relation")), a.note ?? "");
    return { id };
  },
  "link.remove": (a) => { unlink(pid(a), a.linkId); return {}; },
  "link.replaceSet": (a) => tx(() => { // set the targets of (from, relation, toType) exactly to `toIds`
    const p = pid(a);
    const cur = all<any>("SELECT id, to_id FROM links WHERE product_id=? AND from_type=? AND from_id=? AND to_type=? AND relation=?", p, a.fromType, a.fromId, a.toType, a.relation);
    for (const c of cur) if (!a.toIds.includes(c.to_id)) sql("DELETE FROM links WHERE id=?", c.id);
    for (const t of a.toIds) link(p, [a.fromType, a.fromId], [a.toType, t], a.relation);
    return {};
  }),
  "opportunity.scores": (a) => { const p = pid(a); setScores(p, a.id, a.scores ?? {}, a.override); return {}; },
  "prioritization.save": (a) => { saveDims(pid(a), a.dims); return {}; },

  // ---------- process ----------
  "map.create": (a) => ({ id: proc.createMap(pid(a), { name: a.name, kind: "current", initiativeId: a.initiativeId, description: a.description }) }),
  "map.cloneFuture": (a) => ({ id: proc.cloneAsFuture(pid(a), a.mapId, a.name) }),
  "map.update": (a) => { const p = pid(a); assertInProduct(p, "process_map", a.id); if (a.name !== undefined && !a.name.trim()) throw new DomainError("Name the map."); sql("UPDATE process_maps SET name=COALESCE(?,name), description=COALESCE(?,description), updated_at=? WHERE id=?", a.name ?? null, a.description ?? null, now(), a.id); return {}; },
  "map.delete": (a) => { const p = pid(a); assertInProduct(p, "process_map", a.id); const dependents = all<any>("SELECT name FROM process_maps WHERE baseline_map_id=? AND deleted_at IS NULL", a.id); sql("UPDATE process_maps SET deleted_at=? WHERE id=?", now(), a.id); logActivity(p, { kind: "deleted", entityType: "process_map", entityId: a.id, summary: "Deleted a process map (recoverable)" }); return { dependents: dependents.map((d) => d.name) }; },
  "map.restore": (a) => { const p = pid(a); restore("process_map", p, a.id); return {}; },
  "node.add": (a) => proc.addNode(pid(a), a.mapId, a.node),
  "node.update": (a) => { proc.updateNode(pid(a), a.mapId, a.stableId, a.fields); return {}; },
  "node.delete": (a) => { proc.deleteNode(pid(a), a.mapId, a.stableId); return {}; },
  "edge.add": (a) => ({ id: proc.addEdge(pid(a), a.mapId, a.source, a.target, a.label ?? "") }),
  "edge.update": (a) => { proc.updateEdge(pid(a), a.mapId, a.edgeId, a.label ?? ""); return {}; },
  "edge.delete": (a) => { proc.deleteEdge(pid(a), a.mapId, a.edgeId); return {}; },
  "map.positions": (a) => { proc.savePositions(pid(a), a.mapId, a.positions); return {}; },
  "change.upsert": (a) => { proc.upsertChange(pid(a), a.mapId, a.stableId, a.fields); return {}; },
  "scenario.save": (a) => { proc.saveScenario(pid(a), a.mapId, a.scenario); return {}; },

  // ---------- analyses ----------
  "analysis.create": (a) => ({ id: an.createAnalysis(pid(a), a as any) }),
  "analysis.update": (a) => { an.updateAnalysis(pid(a), a.id, a.fields); return {}; },
  "analysis.setSources": (a) => { an.setAnalysisSources(pid(a), a.id, a.sourceIds ?? []); return {}; },
  "analysis.saveRevision": (a) => { const p = pid(a); an.getAnalysis(p, a.id); return { seq: an.saveRevision(a.id, a.note ?? "Saved revision") }; },
  "analysis.restoreRevision": (a) => { an.restoreRevision(pid(a), a.id, a.seq); return {}; },
  "analysis.duplicate": (a) => ({ id: an.duplicateAnalysis(pid(a), a.id, a.title) }),
  "analysis.delete": (a) => { an.softDeleteAnalysis(pid(a), a.id); return {}; },
  "analysis.restore": (a) => { restore("analysis", pid(a), a.id); return {}; },
  "analysis.run": async (a) => runAnalysisCmd(pid(a), a.id, a),
  "analysis.compare": (a) => an.compareRuns(pid(a), a.id, a.seqA, a.seqB),

  // ---------- event log ----------
  "eventlog.preview": (a) => {
    const p = pid(a); assertInProduct(p, "source", a.sourceId);
    const s = get<any>("SELECT content, title FROM sources WHERE id=?", a.sourceId)!;
    const parsed = parseCsv(s.content);
    const mapping: Partial<Mapping> = a.mapping ?? guessMapping(parsed.headers);
    const options: Options = { ...DEFAULT_OPTIONS, ...(a.options ?? {}) };
    const ready = !!(mapping.caseId && mapping.activity && mapping.timestamp);
    const v = ready ? validate(parsed, mapping as Mapping, options) : null;
    return { headers: parsed.headers, sample: parsed.rows.slice(0, 5), totalRows: parsed.rows.length, parseErrors: parsed.parseErrors.slice(0, 5), guessed: guessMapping(parsed.headers), mapping, options,
      validation: v && { totalRows: v.totalRows, includedRows: v.includedRows, excludedRows: v.excludedRows, issues: v.issues, caseCount: new Set(v.events.map((e) => e.caseId)).size, activities: [...new Set(v.events.map((e) => e.activity))].sort() } };
  },
  "eventlog.run": (a) => {
    const productId = pid(a);
    const mapping = a.mapping as Mapping; const options = { ...DEFAULT_OPTIONS, ...(a.options ?? {}) } as Options;
    for (const k of ["caseId", "activity", "timestamp"] as const) if (!mapping?.[k]) throw new DomainError("Map the case, activity and timestamp columns first.");
    return tx(() => {
      let analysisId = a.analysisId as string | undefined;
      if (!analysisId) analysisId = an.createAnalysis(productId, { type: "event_log", title: a.title || "Event-log analysis", question: a.question ?? "", initiativeId: a.initiativeId, sourceIds: [a.sourceId] });
      const row = an.getAnalysis(productId, analysisId);
      if (row.type !== "event_log") throw new DomainError("That analysis is not an event-log analysis.");
      const r = an.runEventLog(productId, row, { sourceId: a.sourceId, mapping, options });
      return { analysisId, runId: r.id, seq: r.seq };
    });
  },
  "eventlog.derive": (a) => tx(() => { // turn a pattern into a finding or opportunity, keeping dataset + metric reference
    const productId = pid(a);
    const r = get<any>("SELECT r.*, a.product_id, a.initiative_id FROM analysis_runs r JOIN analyses a ON a.id=r.analysis_id WHERE r.id=?", a.runId);
    if (!r || r.product_id !== productId) throw new DomainError("Run not found in this product", "not_found");
    const results = parse<any>(r.results, {});
    const ref = { runId: a.runId, datasetId: results.datasetId, metric: a.metric, key: a.key, label: a.label, value: a.value, cases: results.detail?.counts?.cases };
    let id: string;
    if (a.as === "opportunity") id = createEntity("opportunity", productId, { title: a.title, problem: a.statement, origin: "analysis" }, a.initiativeId ?? r.initiative_id);
    else id = createEntity("finding", productId, { statement: a.statement, interpretation: a.interpretation ?? "", limitations: a.limitations ?? "Operational data shows what was recorded, not why. Elapsed time between events is not verified waiting time.", origin: "analysis", status: "accepted" }, a.initiativeId ?? r.initiative_id);
    link(productId, ["analysis_run", a.runId], [a.as === "opportunity" ? "opportunity" : "finding", id], "derived_from", j(ref));
    return { id };
  }),

  // ---------- AI ----------
  "ai.generate": async (a) => {
    const productId = pid(a);
    if (!KINDS.includes(a.kind)) throw new DomainError("Unknown AI action.");
    const r = await ai.generateProposal(productId, { kind: a.kind, scope: a.scope ?? { sourceIds: [] }, analysisId: a.analysisId });
    return { id: r.id };
  },
  "ai.accept": (a) => {
    const p = pid(a);
    const r = ai.acceptItem(p, a.proposalId, a.index ?? 0, a.overrides ?? {}, a.mergeIntoId);
    const ini = get<any>("SELECT initiative_id FROM ai_proposals WHERE id=?", a.proposalId)?.initiative_id;
    return { ...r, href: entityHref(p, r.entityType, r.entityId, ini) };
  },
  "ai.dismissItem": (a) => { ai.dismissItem(pid(a), a.proposalId, a.index); return {}; },
  "ai.dismissProposal": (a) => { ai.dismissProposal(pid(a), a.proposalId); return {}; },

  // ---------- brief ----------
  "brief.saveNarrative": (a) => { const p = pid(a); getInitiative(p, a.initiativeId); brief.saveNarrative(p, a.initiativeId, a.key, a.narrative ?? ""); return {}; },
  "brief.markReviewed": (a) => { const p = pid(a); brief.markReviewed(p, a.initiativeId, a.key); return {}; },
  "brief.draft": (a) => ({ text: brief.draftNarrative(pid(a), a.initiativeId, a.key) }),

  "demo.load": async () => { const { loadDemos } = await import("./seed"); return loadDemos(); },

  // ---------- trash ----------
  "trash.restore": (a) => { const p = pid(a); if (a.type === "source") restore("source", p, a.id); else if (a.type === "analysis") restore("analysis", p, a.id); else if (a.type === "process_map") restore("process_map", p, a.id); else restore(a.type, p, a.id); return {}; },
};

function checkExperimentRules(cur: any, d: A) {
  if (!d) return;
  if (cur?.criterion_locked_at && "success_criterion" in d && String(d.success_criterion) !== cur.success_criterion)
    throw new DomainError("The success criterion was locked when the experiment started. Record what changed in the limitations instead of moving the goalposts.");
  const results = "results" in d ? String(d.results ?? "").trim() : cur?.results;
  const crit = "success_criterion" in d ? String(d.success_criterion ?? "").trim() : cur?.success_criterion;
  if (results && !crit) throw new DomainError("Define the success criterion before recording results.");
  if ((d.status === "running" || d.status === "completed") && !crit) throw new DomainError("Define the success criterion before starting the experiment.");
  if (d.outcome && !["supported", "refuted", "inconclusive", null, ""].includes(d.outcome)) throw new DomainError("Unknown outcome.");
}

async function runAnalysisCmd(productId: string, id: string, a: A) {
  const row = an.getAnalysis(productId, id);
  switch (row.type) {
    case "research_plan": case "questionnaire": case "market_analysis": case "competitor_scan": case "rca": case "journey_map":
    case "solution_design": case "requirements": case "prd": case "test_plan": { const r = await docs.generateDoc(productId, id, { answers: a.answers, useRecords: a.useRecords }); return { runId: r.runId, seq: r.seq }; }
    case "research_synthesis": case "custom": case "process_mapping": {
      const ids = an.analysisSourceIds(row);
      const kind: Kind = row.type === "process_mapping" ? "process_draft" : "synthesis";
      if (!ids.length) throw new DomainError("Choose the evidence to analyse first (selected sources are the default scope).");
      const r = await ai.generateProposal(productId, { kind, analysisId: id, scope: { sourceIds: ids, initiativeId: row.initiative_id, question: row.question, includeProductKnowledge: !!a.includeKnowledge } });
      const voices = new Set(ids.map((s) => get<any>("SELECT participant, id FROM sources WHERE id=?", s)).map((s) => s.participant || `s:${s.id}`)).size;
      const summary = kind === "synthesis"
        ? [{ label: "Candidate findings", value: String(r.proposal.items.length) }, { label: "Rejected (unverifiable)", value: String(r.rejected.length) }, { label: "Sources analysed", value: String(ids.length) }, { label: "Independent voices", value: String(voices) }, { label: "Produced by", value: r.mode === "live" ? "Live model" : "Demo keyword grouping" }]
        : [{ label: "Steps drafted", value: String(r.proposal.items.length) }, { label: "Supported by evidence", value: String(r.proposal.items.filter((i: any) => i.support === "evidence").length) }, { label: "Inferred", value: String(r.proposal.items.filter((i: any) => i.support === "inferred").length) }, { label: "Produced by", value: r.mode === "live" ? "Live model" : "Demo list reader" }];
      const items = kind === "synthesis" ? r.proposal.items.map((i: any) => i.statement) : r.proposal.items.map((i: any) => i.name);
      const runRow = an.insertRun(row, r.mode, an.baseInputs(row, ids), { summary, items, proposalId: r.id, detail: { notes: r.proposal.notes, uncertainties: r.proposal.uncertainties, assumptions: r.proposal.assumptions, followUps: r.proposal.followUps } });
      sql("UPDATE ai_proposals SET run_id=? WHERE id=?", runRow.id, r.id);
      return { runId: runRow.id, seq: runRow.seq, proposalId: r.id };
    }
    case "event_log": {
      const cfg = parse<any>(row.config, null);
      if (!cfg?.sourceId) throw new DomainError("Import and map an event log first.");
      const r = an.runEventLog(productId, row, cfg);
      return { runId: r.id, seq: r.seq };
    }
    case "opportunity_analysis": return pick(an.runOpportunityAnalysis(productId, row));
    case "assumption_analysis": return pick(an.runAssumptionAnalysis(productId, row));
    case "solution_comparison": return pick(an.runSolutionComparison(productId, row));
    case "future_state": return pick(an.runFutureState(productId, row));
    case "experiment_analysis": return pick(an.runExperimentAnalysis(productId, row));
    default: throw new DomainError("This analysis type is completed manually. Use “Save revision” to preserve versions.");
  }
}
const pick = (r: { id: string; seq: number }) => ({ runId: r.id, seq: r.seq });

export type CommandResult = { ok: true; data: any } | { ok: false; error: { message: string; code: string } };

export async function execute(action: string, args: A): Promise<CommandResult> {
  const h = H[action];
  if (!h) return { ok: false, error: { message: `Unknown action ${action}`, code: "unknown" } };
  try {
    const data = await h(args ?? {});
    return { ok: true, data: data ?? {} };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: { message: e.message, code: e.code } };
    if (e instanceof z.ZodError) return { ok: false, error: { message: "Some values are not valid.", code: "validation" } };
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|constraint/i.test(msg)) return { ok: false, error: { message: "That already exists.", code: "conflict" } };
    console.error(`[command ${action}]`, e);
    return { ok: false, error: { message: /AI provider|AI response/.test(msg) ? msg : "Something went wrong and your change was not saved.", code: "server" } };
  }
}
export const _unused = { getProduct };
