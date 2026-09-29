import { buildBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ pid: string; iid: string }> }) {
  const { pid, iid } = await params;
  try {
    const b = buildBrief(pid, iid);
    const name = b.initiative.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "brief";
    return new Response(b.markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="discovery-brief-${name}.md"` } });
  } catch { return new Response("Not found", { status: 404 }); }
}
