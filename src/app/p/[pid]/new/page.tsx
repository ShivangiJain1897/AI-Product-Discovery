import { NewDiscoveryForm } from "@/components/initiative";

export const dynamic = "force-dynamic";

export default async function NewDiscovery({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<{ mode?: string; q?: string }> }) {
  const { pid } = await params; const sp = await searchParams;
  return <div className="px-5 py-10"><NewDiscoveryForm pid={pid} mode={["question", "evidence", "process"].includes(sp.mode ?? "") ? sp.mode! : "question"} q={sp.q ?? ""} /></div>;
}
