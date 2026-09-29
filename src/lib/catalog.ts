// The catalog of things a product manager does. Pure data + readiness rules (client-safe).

export type TopicType = "idea" | "problem" | "requirement" | "question";
export const TOPIC_TYPES: Record<TopicType, { label: string; icon: string; blurb: string; placeholder: string; examples: string[] }> = {
  idea: { label: "Idea", icon: "bulb", blurb: "Something we could build or try", placeholder: "e.g. A chat assistant that answers clients’ onboarding questions", examples: ["A chat assistant that answers clients’ onboarding questions", "Let teams import their old notes in one click"] },
  problem: { label: "Problem", icon: "alert", blurb: "Something that isn’t working", placeholder: "e.g. New clients wait weeks to be onboarded and we don’t know why", examples: ["New clients wait weeks to be onboarded", "Users abandon setup before creating anything"] },
  requirement: { label: "Requirement", icon: "check", blurb: "Something we’ve been asked for", placeholder: "e.g. Compliance needs an audit trail for every document check", examples: ["Compliance needs an audit trail for every document check", "Enterprise customers want single sign-on"] },
  question: { label: "Question", icon: "help", blurb: "Something we need to understand", placeholder: "e.g. Why do trial users stop using the product in week two?", examples: ["Why do trial users stop in week two?", "Is this customer problem important enough to address?"] },
};

export type Group = "understand" | "diagnose" | "design" | "validate";
export const GROUPS: Record<Group, { label: string; blurb: string }> = {
  understand: { label: "Understand", blurb: "Learn about people, the market and what is already known" },
  diagnose: { label: "Diagnose", blurb: "Find out what is really going on and why" },
  design: { label: "Design", blurb: "Shape a response and describe what to build" },
  validate: { label: "Prioritise & validate", blurb: "Decide what matters and test what you’re unsure about" },
};

export type CatalogItem = {
  key: string; label: string; group: Group; icon: string; produces: string; needs: string;
  doc: boolean; suggestedFor: TopicType[];
};

export const CATALOG: CatalogItem[] = [
  { key: "research_plan", label: "User research plan", group: "understand", icon: "compass", doc: true, suggestedFor: ["idea", "problem", "requirement", "question"], produces: "Objectives, research questions and methods", needs: "Nothing to start" },
  { key: "questionnaire", label: "Questionnaire / interview guide", group: "understand", icon: "list", doc: true, suggestedFor: ["idea", "problem", "question"], produces: "Neutral questions for interviews or a survey", needs: "Nothing to start" },
  { key: "voc", label: "Voice of the customer", group: "understand", icon: "users", doc: true, suggestedFor: ["idea", "problem", "requirement", "question"], produces: "Customer pains, needs and workarounds in their own words", needs: "Interviews, tickets, reviews or survey comments" },
  { key: "research_synthesis", label: "Synthesize research", group: "understand", icon: "layers", doc: false, suggestedFor: ["problem", "question"], produces: "Themes and findings, tied to exact quotes", needs: "Interview notes, tickets or feedback" },
  { key: "market_analysis", label: "Market analysis", group: "understand", icon: "chart", doc: true, suggestedFor: ["idea"], produces: "Segments, trends and gaps from sources you provide", needs: "Sources help; none are invented" },
  { key: "competitor_scan", label: "Competitor scan", group: "understand", icon: "compare", doc: true, suggestedFor: ["idea"], produces: "A side-by-side table and differentiators", needs: "Competitor names; sources help" },
  { key: "rca", label: "Root-cause analysis", group: "diagnose", icon: "tree", doc: true, suggestedFor: ["problem", "question"], produces: "5 whys, fishbone and testable causes", needs: "A clear symptom" },
  { key: "event_log", label: "Process mining", group: "diagnose", icon: "pulse", doc: false, suggestedFor: ["problem"], produces: "Variants, durations, repeats and handoffs from real data", needs: "An event-log CSV" },
  { key: "process_mapping", label: "Process map", group: "diagnose", icon: "flow", doc: false, suggestedFor: ["problem", "requirement"], produces: "An editable map of how work happens", needs: "Optional: a process document" },
  { key: "problem_analysis", label: "Frame the problem", group: "diagnose", icon: "target", doc: false, suggestedFor: ["problem", "question"], produces: "Problem, symptoms and causes kept as hypotheses", needs: "Nothing to start" },
  { key: "journey_map", label: "User journey map", group: "design", icon: "route", doc: true, suggestedFor: ["problem", "idea"], produces: "Stages, feelings, pain points and opportunities", needs: "Who the user is; research helps" },
  { key: "solution_design", label: "Solution design", group: "design", icon: "puzzle", doc: true, suggestedFor: ["problem", "idea", "requirement"], produces: "Options, trade-offs and a recommended direction", needs: "A defined problem helps" },
  { key: "requirements", label: "Requirements & user stories", group: "design", icon: "checklist", doc: true, suggestedFor: ["requirement", "idea"], produces: "User stories with acceptance criteria", needs: "Opportunities or concepts help" },
  { key: "prd", label: "PRD", group: "design", icon: "file", doc: true, suggestedFor: ["idea", "problem", "requirement"], produces: "A product requirements document built from your records", needs: "Stronger after research and design" },
  { key: "opportunity_analysis", label: "Prioritise opportunities", group: "validate", icon: "sort", doc: false, suggestedFor: ["problem", "question"], produces: "A transparent comparison table", needs: "Opportunities recorded" },
  { key: "assumption_analysis", label: "Assumption map", group: "validate", icon: "flag", doc: false, suggestedFor: ["idea", "requirement"], produces: "The risky, unproven assumptions to test first", needs: "Assumptions recorded" },
  { key: "test_plan", label: "Test plan", group: "validate", icon: "flask", doc: true, suggestedFor: ["idea", "requirement"], produces: "Hypothesis, method and success criteria set in advance", needs: "An assumption to test" },
];
export const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map((c) => [c.key, c])) as Record<string, CatalogItem>;

export type Knowledge = { sources: number; csv: number; findings: number; opportunities: number; concepts: number; assumptions: number };
export type Readiness = { state: "ready" | "better" | "needs"; note: string };

export function readiness(key: string, k: Knowledge): Readiness {
  switch (key) {
    case "research_synthesis": return k.sources - k.csv > 0 ? { state: "ready", note: `${k.sources - k.csv} source(s) available` } : { state: "needs", note: "Needs notes, transcripts or feedback — you can add them next" };
    case "voc": return k.sources - k.csv > 0 ? { state: "ready", note: `${k.sources - k.csv} source(s) available` } : { state: "needs", note: "Needs customer material — you can add it next" };
    case "event_log": return k.csv > 0 ? { state: "ready", note: `${k.csv} CSV available` } : { state: "needs", note: "Needs an event-log CSV — you can add it next" };
    case "opportunity_analysis": return k.opportunities > 0 ? { state: "ready", note: `${k.opportunities} opportunit${k.opportunities === 1 ? "y" : "ies"}` } : { state: "needs", note: "Needs opportunities first" };
    case "assumption_analysis": return k.assumptions > 0 ? { state: "ready", note: `${k.assumptions} assumption(s)` } : { state: "needs", note: "Needs assumptions first" };
    case "prd": return k.findings + k.opportunities + k.concepts > 0 ? { state: "ready", note: "Will cite your findings and decisions" } : { state: "better", note: "Better after research or design — it can only assemble what exists" };
    case "requirements": case "solution_design": return k.opportunities + k.concepts > 0 ? { state: "ready", note: "Will start from your opportunities" } : { state: "better", note: "Works better once a problem is defined" };
    case "journey_map": return k.findings > 0 ? { state: "ready", note: "Will bring in your pain-point findings" } : { state: "better", note: "Better with research — otherwise you fill it in" };
    case "market_analysis": case "competitor_scan": return k.sources > 0 ? { state: "ready", note: "Can use sources you select" } : { state: "better", note: "Better with sources you trust — nothing is invented" };
    default: return { state: "ready", note: "Can start now" };
  }
}

/** Follow-on suggestions shown when a piece of work is done. */
export const NEXT: Record<string, string[]> = {
  research_plan: ["questionnaire", "voc"],
  voc: ["research_synthesis", "journey_map", "rca"],
  questionnaire: ["voc", "research_synthesis"],
  research_synthesis: ["rca", "journey_map", "opportunity_analysis"],
  market_analysis: ["competitor_scan", "solution_design"],
  competitor_scan: ["solution_design", "prd"],
  rca: ["solution_design", "test_plan", "journey_map"],
  event_log: ["rca", "process_mapping", "solution_design"],
  process_mapping: ["solution_design", "requirements"],
  problem_analysis: ["rca", "research_plan"],
  journey_map: ["solution_design", "requirements"],
  solution_design: ["requirements", "test_plan", "prd"],
  requirements: ["prd", "test_plan"],
  test_plan: ["prd"],
  opportunity_analysis: ["solution_design", "requirements"],
  assumption_analysis: ["test_plan"],
  prd: [],
};
