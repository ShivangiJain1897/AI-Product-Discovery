import { get } from "./db";
import type { EntityType } from "./types";

const enc = encodeURIComponent;

/** Where a record lives in the UI. Records open in the contextual panel via ?item=type:id. */
export function entityHref(productId: string, type: EntityType | string, id: string, initiativeId?: string | null): string {
  const p = `/p/${productId}`;
  const i = initiativeId ? `${p}/i/${initiativeId}` : null;
  const item = `item=${type}:${id}`;
  switch (type) {
    case "source": return `${p}/sources/${id}${initiativeId ? `?i=${initiativeId}` : ""}`;
    case "excerpt": { const s = get<{ source_id: string }>("SELECT source_id FROM excerpts WHERE id=?", id); return s ? `${p}/sources/${s.source_id}?excerpt=${id}` : p; }
    case "finding": return i ? `${i}/evidence?tab=findings&${item}` : `${p}/knowledge?tab=findings&${item}`;
    case "opportunity": return i ? `${i}/explore?${item}` : `${p}/knowledge?tab=opportunities&${item}`;
    case "concept": return i ? `${i}/explore?${item}` : `${p}/knowledge?tab=opportunities&${item}`;
    case "assumption": return i ? `${i}/validate?${item}` : `${p}/experiments?${item}`;
    case "experiment": return i ? `${i}/validate?${item}` : `${p}/experiments?${item}`;
    case "decision": return i ? `${i}/decide?${item}` : `${p}/knowledge?tab=decisions&${item}`;
    case "analysis": return `${p}/analyses/${id}`;
    case "analysis_run": { const r = get<{ analysis_id: string; seq: number }>("SELECT analysis_id, seq FROM analysis_runs WHERE id=?", id); return r ? `${p}/analyses/${r.analysis_id}?run=${r.seq}` : p; }
    case "process_map": return `${p}/maps/${id}`;
    case "process_node": { const n = get<{ map_id: string; stable_id: string }>("SELECT map_id, stable_id FROM process_nodes WHERE id=?", id); return n ? `${p}/maps/${n.map_id}?node=${n.stable_id}` : p; }
    case "initiative": return `${p}/i/${id}`;
    default: return `${p}/knowledge?q=${enc(id)}`;
  }
}

export const TYPE_LABEL: Record<string, string> = {
  source: "Evidence", excerpt: "Excerpt", observation: "Observation", finding: "Finding", opportunity: "Opportunity", concept: "Solution concept",
  assumption: "Assumption", hypothesis: "Hypothesis", experiment: "Experiment", decision: "Decision", process_node: "Process step",
  process_map: "Process map", analysis: "Analysis", analysis_run: "Analysis run", initiative: "Discovery",
};

export const RELATION_LABEL: Record<string, string> = {
  supports: "supports", contradicts: "contradicts", informs: "informs", addressed_by: "addressed by", relies_on: "relies on",
  tested_by: "tested by", derived_from: "derived from", produced: "produced", started_from: "started from", relates_to: "relates to",
};
