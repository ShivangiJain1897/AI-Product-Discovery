import Link from "next/link";
import type { ReactNode } from "react";
import { sidebarData } from "@/lib/sidebar";
import { Group, Item, ProductSwitch, SidebarFrame, TopicNav } from "./sidebar";
import { Icon } from "./icon";

/** The app frame: one left menu everywhere. On the home screen it lists your products; inside a product it lists the product's sections, its topics and, for the topic you're in, its work. */
export function Shell({ productId, children }: { productId?: string; children: ReactNode }) {
  const d = sidebarData(productId);
  const base = productId ? `/p/${productId}` : "";
  return (
    <div className="flex min-h-screen">
      <SidebarFrame>
        <Link href="/" className="mb-4 flex items-center gap-2 px-1.5 font-serif text-[20px] font-semibold tracking-tight text-accent-strong">
          <span aria-hidden className="inline-block h-5 w-5 rounded-full border-[5px] border-accent" />Clarity
        </Link>
        <Link href={productId ? `${base}/new` : "/#start"} className="btn btn-primary mb-4 !justify-start !py-2"><Icon name="plus" size={16} />New topic</Link>
        {d.product ? (
          <>
            <ProductSwitch current={d.product} products={d.products} />
            <nav className="mt-3" aria-label="Product sections">
              <ul className="space-y-0.5">
                <li><Item href={base} icon="home" exact>Overview</Item></li>
                <li><Item href={`${base}/discovery`} icon="folder">Topics</Item></li>
                <li><Item href={`${base}/analyses`} icon="file">Outputs</Item></li>
                <li><Item href={`${base}/knowledge`} icon="book">Knowledge</Item></li>
                <li><Item href={`${base}/experiments`} icon="flask">Experiments</Item></li>
              </ul>
            </nav>
            <Group label="Topics"><TopicNav pid={productId!} topics={d.topics} />{d.topics.length === 0 && <p className="px-2.5 py-1 text-[12.5px] text-muted">No topics yet.</p>}</Group>
          </>
        ) : (
          <nav aria-label="Products">
            <Group label="My products" action={<Link href="/?new=product" className="rounded-md p-0.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Add a product"><Icon name="plus" size={15} /></Link>}>
              <ul className="space-y-0.5">
                {d.products.map((p) => <li key={p.id}><Item href={`/p/${p.id}`} icon="folder">{p.name}</Item></li>)}
              </ul>
              {d.products.length === 0 && <p className="px-2.5 py-1 text-[12.5px] text-muted">Nothing yet. Start with a sentence on the right.</p>}
            </Group>
          </nav>
        )}
        <div className="mt-auto pt-6"><Link href="/" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-muted hover:bg-sunken"><Icon name="home" size={14} />All products</Link></div>
      </SidebarFrame>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
