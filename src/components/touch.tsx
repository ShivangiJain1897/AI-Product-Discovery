"use client";
import { useEffect } from "react";
export function TouchProduct({ id }: { id: string }) {
  useEffect(() => { fetch("/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "product.touch", args: { id } }) }).catch(() => {}); }, [id]);
  return null;
}
