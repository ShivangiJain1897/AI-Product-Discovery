export function ago(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const day = Math.round(h / 24); if (day < 14) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
export const dateOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
