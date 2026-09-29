import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, listInitiatives, listProducts } from "@/lib/queries";
import { aiMode } from "@/lib/ai/live";
import { InitiativeNav, NavLink, ProductSwitcher, TopBar } from "@/components/nav";
import { TouchProduct } from "@/components/touch";

export const dynamic = "force-dynamic";

export default async function ProductLayout({ children, params }: { children: React.ReactNode; params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  let product;
  try { product = getProduct(pid); } catch { notFound(); }
  const products = listProducts().map((p) => ({ id: p.id, name: p.name }));
  const initiatives = listInitiatives(pid).filter((i) => i.status !== "archived").map((i) => ({ id: i.id, title: i.title, status: i.status }));
  const base = `/p/${pid}`;
  return (
    <div className="flex min-h-screen">
      <TouchProduct id={pid} />
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-sunken/60 px-3 py-4 md:flex" aria-label="Product navigation">
        <Link href="/" className="mb-4 flex items-center gap-2 px-1.5 font-serif text-[19px] font-semibold tracking-tight text-accent-strong">
          <span aria-hidden className="inline-block h-5 w-5 rounded-full border-[5px] border-accent" />Clarity
        </Link>
        <ProductSwitcher current={{ id: pid, name: product.name }} products={products} />
        <nav className="mt-4" aria-label="Product sections">
          <ul className="space-y-0.5">
            <li><NavLink href={base} exact>Overview</NavLink></li>
            <li><NavLink href={`${base}/discovery`}>Topics</NavLink></li>
            <li><NavLink href={`${base}/analyses`}>Outputs</NavLink></li>
            <li><NavLink href={`${base}/knowledge`}>Knowledge</NavLink></li>
            <li><NavLink href={`${base}/experiments`}>Experiments</NavLink></li>
          </ul>
        </nav>
        <div className="mt-5">
          <p className="h-section mb-1.5 px-2.5">Topics</p>
          <InitiativeNav pid={pid} initiatives={initiatives} />
          <Link href={`${base}/new`} className="mt-1 block rounded-md px-2.5 py-1.5 text-[13px] text-accent-strong hover:bg-sunken">+ New topic</Link>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar product={{ id: pid, name: product.name, is_demo: product.is_demo }} initiatives={initiatives} aiMode={aiMode()} />
        <nav className="no-print flex gap-1 overflow-x-auto border-b border-line px-3 py-1.5 md:hidden" aria-label="Product sections (compact)">
          {[["Overview", base], ["Topics", `${base}/discovery`], ["Outputs", `${base}/analyses`], ["Knowledge", `${base}/knowledge`], ["Experiments", `${base}/experiments`]].map(([l, h]) => <NavLink key={l} href={h} exact={h === base}>{l}</NavLink>)}
        </nav>
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
