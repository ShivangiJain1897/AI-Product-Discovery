import { NextResponse } from "next/server";
import { readProposal } from "@/lib/ai";
import { all } from "@/lib/db";
import { entityHref } from "@/lib/routes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const pid = u.searchParams.get("pid") ?? "", id = u.searchParams.get("id") ?? "";
  try {
    const p = readProposal(pid, id);
    for (const v of Object.values(p.accepted_items) as any[]) if (v?.entityId) v.href = entityHref(pid, v.entityType, v.entityId, p.initiative_id);
    const targets = all("SELECT id, statement FROM findings WHERE product_id=? AND deleted_at IS NULL AND status='accepted' ORDER BY created_at DESC LIMIT 60", pid);
    return NextResponse.json({ ok: true, proposal: p, mergeTargets: targets });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 404 });
  }
}
