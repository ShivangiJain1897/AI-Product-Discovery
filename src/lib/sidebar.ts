import { all } from "./db";
import { CATALOG_BY_KEY } from "./catalog";
import { listInitiatives, listProducts } from "./queries";

export type SidebarWork = { id: string; title: string; icon: string; started: boolean };
export type SidebarData = {
  products: { id: string; name: string; lifecycle: string; is_demo: number }[];
  product?: { id: string; name: string };
  topics: { id: string; title: string; status: string; topic_type: string; work: SidebarWork[] }[];
};

/** Everything the left menu needs, in cheap queries (no freshness calculations). */
export function sidebarData(productId?: string): SidebarData {
  const products = listProducts().map((p) => ({ id: p.id, name: p.name, lifecycle: p.lifecycle, is_demo: p.is_demo }));
  if (!productId) return { products, topics: [] };
  const product = products.find((p) => p.id === productId);
  const rows = all<any>(`SELECT a.id, a.title, a.type, a.initiative_id iid, EXISTS(SELECT 1 FROM analysis_runs r WHERE r.analysis_id=a.id) started
    FROM analyses a WHERE a.product_id=? AND a.deleted_at IS NULL AND a.initiative_id IS NOT NULL ORDER BY COALESCE(a.plan_order, 9999), a.created_at`, productId);
  const topics = listInitiatives(productId).filter((i) => i.status !== "archived").map((i) => ({
    id: i.id, title: i.title, status: i.status, topic_type: i.topic_type,
    work: rows.filter((r) => r.iid === i.id).map((r) => ({ id: r.id, title: r.title, icon: CATALOG_BY_KEY[r.type]?.icon ?? "file", started: !!r.started })),
  }));
  return { products, product: product && { id: product.id, name: product.name }, topics };
}
