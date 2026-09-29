"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";

export type SaveState = { status: "idle" | "saving" | "saved" | "failed"; message?: string };
let state: SaveState = { status: "idle" };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
function set(s: SaveState) { state = s; subs.forEach((f) => f()); }
const SERVER_STATE: SaveState = { status: "idle" };
export function useSaveState(): SaveState { return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => SERVER_STATE); }

export type Result<T = any> = { ok: true; data: T } | { ok: false; error: { message: string; code: string } };

export async function rpc<T = any>(action: string, args: Record<string, unknown>): Promise<Result<T>> {
  clearTimeout(timer);
  set({ status: "saving" });
  try {
    const res = await fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, args }) });
    const body = (await res.json()) as Result<T>;
    if (body.ok) { set({ status: "saved" }); timer = setTimeout(() => set({ status: "idle" }), 2500); }
    else set({ status: "failed", message: body.error.message });
    return body;
  } catch {
    set({ status: "failed", message: "Could not reach the server. Your change was not saved." });
    return { ok: false, error: { message: "Could not reach the server. Your change was not saved.", code: "network" } };
  }
}

/** Run a command, refresh server data on success, expose pending + error state. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T = any>(action: string, args: Record<string, unknown>, opts: { refresh?: boolean } = {}): Promise<Result<T>> => {
    setPending(true); setError(null);
    const r = await rpc<T>(action, args);
    setPending(false);
    if (!r.ok) setError(r.error.message);
    else if (opts.refresh !== false) router.refresh();
    return r;
  }, [router]);
  return { run, pending, error, setError, router };
}
