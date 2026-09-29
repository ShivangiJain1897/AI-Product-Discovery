import { get } from "./db";
import type { Knowledge } from "./catalog";

/** Counts of what already exists in a product (or one topic), used for readiness hints. */
export function productKnowledge(productId: string, initiativeId?: string): Knowledge {
  const n = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)!.n;
  const scope = initiativeId ? " AND initiative_id=?" : "";
  const p = initiativeId ? [productId, initiativeId] : [productId];
  return {
    sources: initiativeId ? n("SELECT COUNT(*) n FROM initiative_sources x JOIN sources s ON s.id=x.source_id WHERE x.initiative_id=? AND s.deleted_at IS NULL", initiativeId) : n("SELECT COUNT(*) n FROM sources WHERE product_id=? AND deleted_at IS NULL", productId),
    csv: initiativeId ? n("SELECT COUNT(*) n FROM initiative_sources x JOIN sources s ON s.id=x.source_id WHERE x.initiative_id=? AND s.deleted_at IS NULL AND s.content_kind='csv'", initiativeId) : n("SELECT COUNT(*) n FROM sources WHERE product_id=? AND deleted_at IS NULL AND content_kind='csv'", productId),
    findings: n(`SELECT COUNT(*) n FROM findings WHERE product_id=?${scope} AND deleted_at IS NULL AND status='accepted'`, ...p),
    opportunities: n(`SELECT COUNT(*) n FROM opportunities WHERE product_id=?${scope} AND deleted_at IS NULL`, ...p),
    concepts: n(`SELECT COUNT(*) n FROM solution_concepts WHERE product_id=?${scope} AND deleted_at IS NULL`, ...p),
    assumptions: n(`SELECT COUNT(*) n FROM assumptions WHERE product_id=?${scope} AND deleted_at IS NULL`, ...p),
  };
}

import { all } from "./db";
import { CATALOG_BY_KEY, NEXT } from "./catalog";
import { TEMPLATES, isEmptyValue } from "./templates";
import { analysisFreshness, type AnalysisRow } from "./analyses";
import { readDocData } from "./docs";
import { ANALYSIS_TYPES } from "./types";

export type WorkItem = {
  id: string; type: string; title: string; label: string; icon: string; produces: string; order: number | null;
  state: "not_started" | "in_progress" | "done" | "needs_refresh"; note: string; runs: number; updated_at: string; outdatedReason?: string;
};

/** The pieces of work planned in a topic, with a plain-language state for each. */
export function topicWork(productId: string, initiativeId: string): WorkItem[] {
  const rows = all<AnalysisRow & { plan_order: number | null }>("SELECT * FROM analyses WHERE product_id=? AND initiative_id=? AND deleted_at IS NULL ORDER BY COALESCE(plan_order, 9999), created_at", productId, initiativeId);
  return rows.map((a) => {
    const cat = CATALOG_BY_KEY[a.type];
    const runs = all<any>("SELECT 1 x FROM analysis_runs WHERE analysis_id=?", a.id).length;
    const t = TEMPLATES[a.type];
    const hasContent = t ? t.sections.some((s) => !isEmptyValue(readDocData(a).sections[s.key])) : runs > 0 || (a.type === "problem_analysis" && a.status !== "draft");
    const fresh = analysisFreshness(a);
    const state: WorkItem["state"] = fresh.outdated && (hasContent || runs) ? "needs_refresh" : a.status === "completed" ? "done" : hasContent || runs > 0 ? "in_progress" : "not_started";
    return {
      id: a.id, type: a.type, title: a.title, label: ANALYSIS_TYPES[a.type]?.label ?? a.type, icon: cat?.icon ?? "file", produces: cat?.produces ?? ANALYSIS_TYPES[a.type]?.purpose ?? "",
      order: a.plan_order, state, note: state === "not_started" ? cat?.needs ?? "" : "", runs, updated_at: a.updated_at, outdatedReason: fresh.reasons[0],
    };
  });
}

export type Suggestion = { id: string; label: string; why: string; kind: "open" | "add"; href?: string; key?: string };

/** "What now?": specific next steps drawn from what exists. Never more than four. */
export function suggestWork(productId: string, initiativeId: string): Suggestion[] {
  const work = topicWork(productId, initiativeId);
  const k = productKnowledge(productId, initiativeId);
  const out: Suggestion[] = [];
  const base = `/p/${productId}`;
  for (const w of work.filter((x) => x.state === "needs_refresh").slice(0, 2)) out.push({ id: `refresh-${w.id}`, kind: "open", label: `Refresh “${w.title}”`, why: w.outdatedReason ?? "Its inputs changed.", href: `${base}/analyses/${w.id}` });
  const planned = new Set(work.map((w) => w.type));
  const progressed = work.filter((w) => w.state === "in_progress" || w.state === "done");
  for (const w of progressed) for (const nk of NEXT[w.type] ?? []) {
    if (planned.has(nk) || out.some((o) => o.key === nk) || out.length >= 4) continue;
    out.push({ id: `next-${nk}`, kind: "add", key: nk, label: `Add: ${CATALOG_BY_KEY[nk].label}`, why: `Follows from “${w.label}”. ${CATALOG_BY_KEY[nk].produces}.` });
  }
  if (!planned.has("prd") && k.findings + k.opportunities > 0 && out.length < 4) out.push({ id: "next-prd", kind: "add", key: "prd", label: "Generate a PRD from what you have", why: `${k.findings} finding(s), ${k.opportunities} opportunit${k.opportunities === 1 ? "y" : "ies"} and your decisions can be assembled, with every line cited.` });
  const nextUp = work.find((w) => w.state === "not_started");
  if (nextUp && out.length < 4) out.unshift({ id: `start-${nextUp.id}`, kind: "open", label: `Start: ${nextUp.title}`, why: nextUp.produces + (nextUp.note ? ` — ${nextUp.note}` : ""), href: `${base}/analyses/${nextUp.id}` });
  if (k.sources === 0 && !progressed.length && out.length < 4) out.push({ id: "evidence", kind: "open", label: "Add what you already have", why: "Notes, tickets or a data export make every piece of work stronger. Rough is fine.", href: `${base}/i/${initiativeId}/evidence?add=1` });
  return out.slice(0, 4);
}
