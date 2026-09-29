import { z } from "zod";

export const Ref = z.object({ sourceId: z.string(), quote: z.string().min(3) });
export type Ref = z.infer<typeof Ref>;

const str = z.string().default("");
const strs = z.array(z.string()).default([]);

export const SynthesisItem = z.object({
  statement: z.string().min(5), interpretation: str, limitations: str, followUp: str, segment: str,
  supporting: z.array(Ref).default([]), contradicting: z.array(Ref).default([]),
});
export const StepItem = z.object({
  tempId: z.string(), type: z.enum(["start", "activity", "decision", "end"]).default("activity"), name: z.string().min(1),
  description: str, actor: str, support: z.enum(["evidence", "inferred"]).default("inferred"), refs: z.array(Ref).default([]),
});
export const OpportunityItem = z.object({
  title: z.string().min(3), problem: str, segment: str, context: str, desiredOutcome: str, unknowns: str, findingIds: strs,
});
export const ConceptItem = z.object({
  title: z.string().min(3), description: str,
  interventionType: z.enum(["information", "policy", "process", "workflow", "automation", "product_feature"]).default("product_feature"),
  tradeoffs: str, opportunityId: z.string().optional(),
});
export const AssumptionItem = z.object({
  statement: z.string().min(5),
  category: z.enum(["none", "desirability", "usability", "feasibility", "viability", "operational_fit"]).default("none"),
  importance: z.enum(["high", "medium", "low", "unknown"]).default("unknown"), conceptId: z.string().optional(), opportunityId: z.string().optional(),
});
export const ExperimentItem = z.object({
  title: z.string().min(3), hypothesis: z.string().min(5),
  method: z.enum(["interview", "usability_test", "prototype_test", "concierge", "pilot", "controlled", "other"]).default("other"),
  target: str, successCriterion: str, assumptionIds: strs, conceptId: z.string().optional(), opportunityId: z.string().optional(),
});
export const ChallengeItem = z.object({
  targetType: z.enum(["finding", "opportunity"]), targetId: z.string(),
  alternativeExplanations: strs, missingEvidence: strs, evidenceThatWouldChangeView: strs, tooBroad: str,
});

export const ITEM_SCHEMAS = {
  synthesis: SynthesisItem, process_draft: StepItem, opportunities: OpportunityItem, concepts: ConceptItem,
  assumptions: AssumptionItem, experiment: ExperimentItem, challenge: ChallengeItem,
} as const;
export type Kind = keyof typeof ITEM_SCHEMAS;
export const KIND_LABEL: Record<Kind, string> = {
  synthesis: "Research synthesis", process_draft: "Draft process map", opportunities: "Opportunities", concepts: "Solution concepts",
  assumptions: "Assumptions to test", experiment: "Experiment design", challenge: "Challenge",
};

export const Envelope = z.object({
  title: z.string().default(""), summary: str,
  items: z.array(z.unknown()).default([]),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: str })).default([]),
  notes: z.object({ themes: strs, needs: strs, painPoints: strs, behaviors: strs, contradictions: strs, gaps: strs }).partial().default({}),
  assumptions: strs, uncertainties: strs, followUps: strs,
});

export type Proposal = {
  kind: Kind; mode: "live" | "demo"; title: string; summary: string;
  items: any[]; edges: { from: string; to: string; label: string }[];
  notes: Partial<Record<"themes" | "needs" | "painPoints" | "behaviors" | "contradictions" | "gaps", string[]>>;
  assumptions: string[]; uncertainties: string[]; followUps: string[];
};
export type Rejected = { index: number; reason: string; label: string };
