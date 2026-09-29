export type FieldSpec = { key: string; label: string; kind: "text" | "area" | "select" | "date"; options?: [string, string][]; hint?: string; rows?: number; required?: boolean; placeholder?: string };

const opt = (o: Record<string, string>): [string, string][] => Object.entries(o);

export const OPP_FIELDS: FieldSpec[] = [
  { key: "title", label: "Short name", kind: "text", required: true },
  { key: "problem", label: "Problem statement", kind: "area", hint: "One user, one situation, one problem. Describe the problem, not a solution.", rows: 3 },
  { key: "segment", label: "Affected user or segment", kind: "text" },
  { key: "context", label: "Context in which it occurs", kind: "text" },
  { key: "desired_outcome", label: "Desired outcome", kind: "text" },
  { key: "frequency", label: "Known frequency or reach", kind: "text", hint: "Leave blank if unknown — don’t guess." },
  { key: "severity", label: "Severity or impact", kind: "text" },
  { key: "unknowns", label: "What remains uncertain", kind: "area", rows: 2 },
];
export const CONCEPT_FIELDS: FieldSpec[] = [
  { key: "title", label: "Concept", kind: "text", required: true },
  { key: "description", label: "How would it respond to the opportunity?", kind: "area", rows: 3 },
  { key: "intervention_type", label: "Kind of intervention", kind: "select", options: opt({ information: "Clearer information", policy: "Policy change", process: "Process simplification", workflow: "Workflow change", automation: "Automation", product_feature: "Product feature" }) },
  { key: "tradeoffs", label: "Trade-offs and risks", kind: "area", rows: 2 },
  { key: "status", label: "Status", kind: "select", options: opt({ considering: "Considering", preferred: "Preferred", dropped: "Dropped" }) },
];
export const ASSUMPTION_FIELDS: FieldSpec[] = [
  { key: "statement", label: "What must be true?", kind: "area", rows: 2, required: true },
  { key: "category", label: "Kind of risk (optional)", kind: "select", options: opt({ none: "Uncategorised", desirability: "Desirability — do people want it?", usability: "Usability — can they use it?", feasibility: "Feasibility — can we build and run it?", viability: "Viability — does it support the business?", operational_fit: "Operational fit — can the organisation adopt it?" }) },
  { key: "importance", label: "How consequential if wrong?", kind: "select", options: opt({ unknown: "Not judged yet", high: "High", medium: "Medium", low: "Low" }) },
  { key: "support", label: "How well supported today?", kind: "select", options: opt({ unknown: "Unknown", none: "No support", weak: "Weak", moderate: "Moderate", strong: "Strong" }) },
  { key: "status", label: "Status", kind: "select", options: opt({ untested: "Untested", testing: "Being tested", supported: "Supported", refuted: "Refuted", inconclusive: "Inconclusive" }) },
];
export const EXPERIMENT_NEW_FIELDS: FieldSpec[] = [
  { key: "title", label: "Name", kind: "text", required: true },
  { key: "hypothesis", label: "Hypothesis", kind: "area", rows: 2, hint: "If we do X, we expect Y." },
  { key: "method", label: "Method", kind: "select", options: opt({ interview: "Interviews", usability_test: "Usability test", prototype_test: "Prototype test", concierge: "Concierge test", pilot: "Operational pilot", controlled: "Controlled experiment", other: "Other" }) },
  { key: "target", label: "Target participants or dataset", kind: "text" },
  { key: "success_criterion", label: "Success criterion — decided before you run it", kind: "area", rows: 2, hint: "It locks when the experiment starts, so results can’t quietly move the goalposts." },
];
export const DECISION_FIELDS: FieldSpec[] = [
  { key: "decision_type", label: "What kind of decision?", kind: "select", options: opt({ investigate: "Investigate further", test: "Test a concept", proceed: "Proceed to delivery", refine: "Refine the approach", pause: "Pause", stop: "Stop" }) },
  { key: "statement", label: "Decision", kind: "area", rows: 2, required: true },
  { key: "rationale", label: "Rationale", kind: "area", rows: 3 },
  { key: "alternatives", label: "Alternatives considered", kind: "area", rows: 2 },
  { key: "risks", label: "Contradictory evidence and unresolved risks", kind: "area", rows: 2 },
  { key: "expected_outcome", label: "Expected outcome", kind: "text" },
  { key: "next_action", label: "Next action", kind: "text" },
  { key: "decided_on", label: "Date", kind: "date" },
];
