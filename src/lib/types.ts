export type EntityType =
  | "source" | "excerpt" | "observation" | "finding" | "opportunity" | "concept"
  | "assumption" | "hypothesis" | "experiment" | "decision" | "process_node"
  | "process_map" | "analysis" | "analysis_run" | "initiative";

export const ENTITY_TABLE: Record<EntityType, string> = {
  source: "sources", excerpt: "excerpts", observation: "observations", finding: "findings",
  opportunity: "opportunities", concept: "solution_concepts", assumption: "assumptions",
  hypothesis: "hypotheses", experiment: "experiments", decision: "decisions",
  process_node: "process_nodes", process_map: "process_maps", analysis: "analyses",
  analysis_run: "analysis_runs", initiative: "initiatives",
};

export const SOURCE_TYPES: Record<string, string> = {
  interview: "Interview", observation: "Observation", survey: "Survey response",
  support: "Support feedback", meeting: "Meeting note", process_doc: "Process document",
  event_log: "Operational event log", other: "Other",
};

export const LIFECYCLES = ["exploring", "building", "live", "retiring"] as const;
export const DECISION_TYPES: Record<string, string> = {
  investigate: "Investigate further", test: "Test a concept", proceed: "Proceed to delivery",
  refine: "Refine the approach", pause: "Pause", stop: "Stop",
};
export const INTERVENTIONS: Record<string, string> = {
  information: "Clearer information", policy: "Policy change", process: "Process simplification",
  workflow: "Workflow change", automation: "Automation", product_feature: "Product feature",
};
export const ASSUMPTION_CATEGORIES: Record<string, string> = {
  none: "Uncategorised", desirability: "Desirability", usability: "Usability",
  feasibility: "Feasibility", viability: "Viability", operational_fit: "Operational fit",
};
export const EXPERIMENT_METHODS: Record<string, string> = {
  interview: "Interviews", usability_test: "Usability test", prototype_test: "Prototype test",
  concierge: "Concierge test", pilot: "Operational pilot", controlled: "Controlled experiment", other: "Other",
};

export const ANALYSIS_TYPES: Record<string, { label: string; purpose: string; needsSources: boolean }> = {
  research_synthesis: { label: "Research synthesis", purpose: "Find themes, needs and contradictions across research", needsSources: true },
  problem_analysis: { label: "Problem analysis", purpose: "Clarify a problem, its context and possible contributing causes", needsSources: false },
  process_mapping: { label: "Process mapping", purpose: "Describe activities, actors, decisions and handoffs", needsSources: false },
  event_log: { label: "Event-log analysis", purpose: "Examine observed variants, durations and repeated activities", needsSources: true },
  opportunity_analysis: { label: "Opportunity analysis", purpose: "Compare problems worth addressing", needsSources: false },
  solution_comparison: { label: "Solution comparison", purpose: "Evaluate alternative approaches and their trade-offs", needsSources: false },
  assumption_analysis: { label: "Assumption analysis", purpose: "Find consequential, weakly supported assumptions", needsSources: false },
  future_state: { label: "Future-state comparison", purpose: "Compare a proposed process with its baseline", needsSources: false },
  experiment_analysis: { label: "Experiment analysis", purpose: "Interpret results against a hypothesis and criterion", needsSources: false },
  research_plan: { label: "User research plan", purpose: "Plan what to learn, from whom and how", needsSources: false },
  questionnaire: { label: "Questionnaire / interview guide", purpose: "Neutral questions for interviews or a survey", needsSources: false },
  market_analysis: { label: "Market analysis", purpose: "Segments, trends and gaps from sources you provide", needsSources: false },
  competitor_scan: { label: "Competitor scan", purpose: "Compare alternatives side by side", needsSources: false },
  rca: { label: "Root-cause analysis", purpose: "5 whys, fishbone and testable causes", needsSources: false },
  journey_map: { label: "User journey map", purpose: "Stages, feelings, pain points and opportunities", needsSources: false },
  solution_design: { label: "Solution design", purpose: "Options, trade-offs and a recommended direction", needsSources: false },
  requirements: { label: "Requirements & user stories", purpose: "User stories with acceptance criteria", needsSources: false },
  prd: { label: "PRD", purpose: "A product requirements document built from your records", needsSources: false },
  test_plan: { label: "Test plan", purpose: "Hypothesis, method and success criteria set in advance", needsSources: false },
  custom: { label: "Custom analysis", purpose: "Define your own question and desired output", needsSources: false },
};
