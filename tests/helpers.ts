import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb } from "@/lib/db";
import { execute } from "@/lib/commands";

export function freshDb() {
  closeDb();
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clarity-test-")), "t.db");
  process.env.CLARITY_DB_PATH = f;
  delete process.env.ANTHROPIC_API_KEY;
  return f;
}
export async function cmd<T = any>(action: string, args: Record<string, any>): Promise<T> {
  const r = await execute(action, args);
  if (!r.ok) throw new Error(`${action}: ${r.error.message}`);
  return r.data as T;
}
export async function fails(action: string, args: Record<string, any>) {
  const r = await execute(action, args);
  if (r.ok) throw new Error(`${action} should have failed`);
  return r.error;
}
