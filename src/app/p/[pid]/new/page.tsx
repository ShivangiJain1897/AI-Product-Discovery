import { get } from "@/lib/db";
import { NewTopic } from "@/components/topic-flow";
import type { TopicType } from "@/lib/catalog";
import { productKnowledge } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function NewTopicPage({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<{ type?: string; q?: string; mode?: string }> }) {
  const { pid } = await params; const sp = await searchParams;
  const legacy: Record<string, TopicType> = { question: "question", evidence: "problem", process: "problem" };
  const type = (["idea", "problem", "requirement", "question"].includes(sp.type ?? "") ? sp.type : legacy[sp.mode ?? ""] ?? "problem") as TopicType;
  void get;
  return <div className="px-6 py-8"><NewTopic pid={pid} initialType={type} initialText={sp.q ?? ""} knowledge={productKnowledge(pid)} /></div>;
}
