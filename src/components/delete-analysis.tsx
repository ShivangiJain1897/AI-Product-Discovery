"use client";
import { useAction } from "@/lib/client";
export function DeleteAnalysis({ pid, id, title }: { pid: string; id: string; title: string }) {
  const { run, pending, router } = useAction();
  return <button className="btn btn-sm btn-quiet text-danger" disabled={pending} onClick={async () => { if (confirm(`Delete “${title}”? Its runs and revisions are kept and it can be restored from Recently deleted in Knowledge.`)) { const r = await run("analysis.delete", { productId: pid, id }, { refresh: false }); if (r.ok) router.push(`/p/${pid}/analyses`); } }}>Delete this analysis</button>;
}
