import { notFound } from "next/navigation";
import { getProduct, listInitiatives } from "@/lib/queries";
import { aiMode } from "@/lib/ai/live";
import { TopBar } from "@/components/nav";
import { TouchProduct } from "@/components/touch";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function ProductLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  let product;
  try { product = getProduct(pid); } catch { notFound(); }
  const initiatives = listInitiatives(pid).filter((i) => i.status !== "archived").map((i) => ({ id: i.id, title: i.title, status: i.status }));
  return (
    <Shell productId={pid}>
      <TouchProduct id={pid} />
      <TopBar product={{ id: pid, name: product.name, is_demo: product.is_demo }} initiatives={initiatives} aiMode={aiMode()} />
      <main id="main" className="min-w-0 flex-1">{children}</main>
    </Shell>
  );
}
