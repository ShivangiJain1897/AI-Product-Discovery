import { NextResponse } from "next/server";
import { execute } from "@/lib/commands";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { action?: string; args?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: { message: "Bad request", code: "bad_request" } }, { status: 400 }); }
  if (!body.action) return NextResponse.json({ ok: false, error: { message: "Missing action", code: "bad_request" } }, { status: 400 });
  const res = await execute(body.action, body.args ?? {});
  return NextResponse.json(res, { status: res.ok ? 200 : res.error.code === "server" ? 500 : 422 });
}
