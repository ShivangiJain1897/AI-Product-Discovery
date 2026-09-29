import { buildBrief } from "@/lib/brief";
import { Markdown } from "@/components/md";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function PrintBrief({ params }: { params: Promise<{ pid: string; iid: string }> }) {
  const { pid, iid } = await params;
  const b = buildBrief(pid, iid);
  return (
    <div className="print-page mx-auto max-w-3xl px-6 py-6">
      <div className="no-print mb-4 flex justify-between"><a className="btn btn-sm" href={`/p/${pid}/i/${iid}/brief`}>← Back to the brief</a><PrintButton /></div>
      <h1 className="font-serif text-[26px] font-semibold">Discovery brief: {b.initiative.title}</h1>
      <p className="mb-5 text-[12.5px] text-muted">{b.initiative.is_demo ? "Demo initiative — synthetic data. " : ""}Status: {b.initiative.status}. Printed {new Date().toISOString().slice(0, 10)}.</p>
      {b.sections.filter((s) => s.applicable).map((s, i) => (
        <section key={s.key} className="mb-6 break-inside-avoid-page">
          <h2 className="mb-1 border-b border-line pb-1 text-[16px] font-semibold">{i + 1}. {s.title}</h2>
          {s.needsRefresh && <p className="text-[12.5px] italic text-warn">Records in this section changed after its narrative was last reviewed.</p>}
          {s.narrative.trim() && <p className="mb-2 whitespace-pre-line">{s.narrative}</p>}
          {s.items.length ? <Markdown text={s.items.map((x) => x.md).join(s.key === "evidence" ? "\n" : "\n\n")} /> : <p className="text-[13px] text-muted">Nothing recorded yet.</p>}
        </section>
      ))}
    </div>
  );
}
