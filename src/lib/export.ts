import { all, get } from "./db";
import { getProduct } from "./queries";

const TABLES_BY_PRODUCT = ["initiatives", "sources", "excerpts", "observations", "findings", "opportunities", "solution_concepts", "assumptions", "hypotheses", "experiments", "decisions", "links", "process_maps", "analyses", "event_datasets", "ai_proposals", "activity"] as const;

/** Structured JSON export of a product workspace: every record, original source content and all versions. */
export function exportWorkspace(productId: string) {
  const product = getProduct(productId);
  const data: Record<string, unknown> = { product };
  for (const t of TABLES_BY_PRODUCT) data[t] = all(`SELECT * FROM ${t} WHERE product_id=?`, productId);
  const sourceIds = (data.sources as { id: string }[]).map((s) => s.id);
  data.source_versions = sourceIds.length ? all(`SELECT * FROM source_versions WHERE source_id IN (${sourceIds.map(() => "?").join(",")})`, ...sourceIds) : [];
  data.initiative_sources = all("SELECT x.* FROM initiative_sources x JOIN initiatives i ON i.id=x.initiative_id WHERE i.product_id=?", productId);
  const mapIds = (data.process_maps as { id: string }[]).map((m) => m.id);
  const inMaps = mapIds.map(() => "?").join(",");
  data.process_nodes = mapIds.length ? all(`SELECT * FROM process_nodes WHERE map_id IN (${inMaps})`, ...mapIds) : [];
  data.process_edges = mapIds.length ? all(`SELECT * FROM process_edges WHERE map_id IN (${inMaps})`, ...mapIds) : [];
  data.process_changes = mapIds.length ? all(`SELECT * FROM process_changes WHERE map_id IN (${inMaps})`, ...mapIds) : [];
  data.analysis_sources = all("SELECT x.* FROM analysis_sources x JOIN analyses a ON a.id=x.analysis_id WHERE a.product_id=?", productId);
  data.analysis_revisions = all("SELECT r.* FROM analysis_revisions r JOIN analyses a ON a.id=r.analysis_id WHERE a.product_id=?", productId);
  data.analysis_runs = all("SELECT r.* FROM analysis_runs r JOIN analyses a ON a.id=r.analysis_id WHERE a.product_id=?", productId);
  data.brief_sections = all("SELECT b.* FROM brief_sections b JOIN initiatives i ON i.id=b.initiative_id WHERE i.product_id=?", productId);
  return { format: "clarity-workspace", version: 1, exportedAt: new Date().toISOString(), ...data };
}
export const _get = get;
