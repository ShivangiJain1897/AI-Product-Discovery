import fs from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

// node:sqlite ships with Node >= 22.13 (no native build step needed).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

const g = globalThis as unknown as { __clarityDb?: DB; __clarityDbPath?: string };

function open(file: string): DB {
  const req = (process as unknown as { getBuiltinModule: (n: string) => any }).getBuiltinModule("node:sqlite");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new req.DatabaseSync(file);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  d.exec(SCHEMA);
  migrate(d);
  return d;
}

/** Additive migrations for databases created by earlier versions. */
function migrate(d: DB) {
  const has = (table: string, col: string) => (d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has("initiatives", "topic_type")) d.exec("ALTER TABLE initiatives ADD COLUMN topic_type TEXT NOT NULL DEFAULT 'question'");
  if (!has("initiatives", "topic_text")) d.exec("ALTER TABLE initiatives ADD COLUMN topic_text TEXT NOT NULL DEFAULT ''");
  if (!has("analyses", "plan_order")) d.exec("ALTER TABLE analyses ADD COLUMN plan_order INTEGER");
}

export function dbPath() {
  return process.env.CLARITY_DB_PATH || path.join(process.cwd(), "data", "clarity.db");
}

export function db(): DB {
  const file = dbPath();
  if (!g.__clarityDb || g.__clarityDbPath !== file) {
    g.__clarityDb = open(file);
    g.__clarityDbPath = file;
  }
  return g.__clarityDb;
}

export function closeDb() {
  if (g.__clarityDb) g.__clarityDb.close();
  g.__clarityDb = undefined;
}

// node:sqlite returns null-prototype rows; copy them so they can cross the server/client boundary.
export function all<T = Record<string, any>>(sql: string, ...params: unknown[]): T[] {
  return (db().prepare(sql).all(...params) as object[]).map((r) => ({ ...r })) as T[];
}
export function get<T = Record<string, any>>(sql: string, ...params: unknown[]): T | undefined {
  const r = db().prepare(sql).get(...params) as object | undefined;
  return r ? ({ ...r } as T) : undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).run(...params);
}

let txDepth = 0;
export function tx<T>(fn: () => T): T {
  const d = db();
  if (txDepth > 0) return fn();
  d.exec("BEGIN IMMEDIATE");
  txDepth++;
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    txDepth--;
  }
}

export const now = () => new Date().toISOString();
export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
export const j = (v: unknown) => JSON.stringify(v ?? null);
export function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
