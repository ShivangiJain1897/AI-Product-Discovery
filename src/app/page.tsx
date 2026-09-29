import { Suspense } from "react";
import { all } from "@/lib/db";
import { listProducts } from "@/lib/queries";
import { StartBox, ProductGrid, LoadDemoButton } from "@/components/home";
import { ago } from "@/lib/format";
import { aiMode } from "@/lib/ai/live";
import { SaveIndicator } from "@/components/ui";
import { demoLoaded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default function Home() {
  const products = listProducts(true);
  const live = products.filter((p) => !p.archived_at);
  const recent = all<any>(`SELECT i.id, i.title, i.status, i.updated_at, i.product_id, p.name pname, i.is_demo FROM initiatives i JOIN products p ON p.id=i.product_id WHERE p.archived_at IS NULL AND i.status IN ('active','paused') ORDER BY i.updated_at DESC LIMIT 4`);
  const cards = products.map((p) => {
    const last = p.activeInitiatives[0];
    const lines: string[] = [];
    if (p.attention.experimentsToInterpret.length) lines.push(`${p.attention.experimentsToInterpret.length} result${p.attention.experimentsToInterpret.length === 1 ? "" : "s"} to interpret`);
    if (p.attention.findingsToReview.length) lines.push(`${p.attention.findingsToReview.length} finding${p.attention.findingsToReview.length === 1 ? "" : "s"} to review`);
    if (p.attention.decisionsToReview.length) lines.push(`${p.attention.decisionsToReview.length} decision${p.attention.decisionsToReview.length === 1 ? "" : "s"} to review`);
    if (p.attention.outdatedAnalyses.length) lines.push(`${p.attention.outdatedAnalyses.length} analys${p.attention.outdatedAnalyses.length === 1 ? "is" : "es"} may be outdated`);
    return {
      id: p.id, name: p.name, description: p.description, lifecycle: p.lifecycle, is_demo: p.is_demo, archived_at: p.archived_at,
      activeInitiatives: p.activeInitiatives, lastActivity: p.lastActivity ? { summary: p.lastActivity.summary, ago: ago(p.lastActivity.created_at) } : null,
      attentionCount: p.attentionCount, attentionLines: lines,
      continueHref: last ? `/p/${p.id}/i/${last.id}` : `/p/${p.id}`, continueLabel: last ? `Resume “${last.title}”` : "Open workspace",
    };
  });
  const hasDemo = demoLoaded();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 font-serif text-[20px] font-semibold tracking-tight text-accent-strong"><span aria-hidden className="inline-block h-5 w-5 rounded-full border-[5px] border-accent" />Clarity</span>
        <div className="flex items-center gap-3"><span className={`badge ${aiMode() === "live" ? "badge-accent" : "badge-warn"}`}>AI: {aiMode() === "live" ? "live model" : "demo mode — no API key"}</span><SaveIndicator /></div>
      </header>
      <main id="main" className="px-6 pb-16 pt-6">
        <Suspense><StartBox products={live.map((p) => ({ id: p.id, name: p.name }))} /></Suspense>

        {recent.length > 0 && (
          <section aria-labelledby="recent-h" className="mx-auto mt-12 max-w-5xl">
            <h2 id="recent-h" className="mb-2 text-[19px] font-semibold">Resume recent work</h2>
            <ul className="grid gap-2 md:grid-cols-2">
              {recent.map((r) => (
                <li key={r.id}><a href={`/p/${r.product_id}/i/${r.id}`} className="card flex items-center justify-between gap-3 px-4 py-2.5 hover:border-accent">
                  <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{r.title}</span><span className="block truncate text-[12.5px] text-muted">{r.pname} · updated {ago(r.updated_at)}</span></span>
                  <span className="flex shrink-0 gap-1">{r.is_demo ? <span className="badge badge-warn">Demo</span> : null}{r.status === "paused" && <span className="badge">Paused</span>}</span>
                </a></li>
              ))}
            </ul>
          </section>
        )}

        {products.length > 0 ? <Suspense><ProductGrid cards={cards} /></Suspense> : (
          <section className="mx-auto mt-12 max-w-2xl rounded-lg border border-dashed border-line-strong bg-surface p-6 text-center">
            <h2 className="text-[17px] font-semibold">No products yet</h2>
            <p className="mt-1 text-[14px] text-muted">Ask your first question above, or explore two worked examples with clearly labelled synthetic data — one with a process map and event log, one interview-only.</p>
            <div className="mt-3"><LoadDemoButton primary /></div>
          </section>
        )}
        {products.length > 0 && !hasDemo && <p className="mx-auto mt-6 max-w-5xl text-[13px] text-muted">Want to see a worked example? <LoadDemoButton /></p>}
        {hasDemo && <p className="mx-auto mt-6 max-w-5xl text-[12.5px] text-muted">Products marked <span className="badge badge-warn">Demo</span> contain synthetic data invented for illustration. Nothing in them is real research.</p>}
      </main>
    </div>
  );
}
