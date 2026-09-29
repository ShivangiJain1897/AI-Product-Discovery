import { exportWorkspace } from "@/lib/export";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  try {
    const data = exportWorkspace(pid);
    const name = String(((data as any).product as { name: string }).name).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new Response(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="clarity-${name}.json"` } });
  } catch { return new Response("Not found", { status: 404 }); }
}
