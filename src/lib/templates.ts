// Document-workbench templates: sections, adaptive intake questions, and deterministic "scaffold" generators.
// Pure module (no DB, no network) so it is client-safe and unit-testable.
// Scaffold generators NEVER invent facts: they restructure what the user and their records already say,
// and leave the rest as clearly-marked prompts.

export type SectionKind = "text" | "list" | "table";
export type SectionDef = { key: string; title: string; kind: SectionKind; help: string; columns?: string[]; rowLabels?: string[] };
export type Question = { key: string; label: string; kind: "text" | "choice"; options?: string[]; placeholder?: string; why: string };
export type TableValue = { columns: string[]; rows: string[][] };
export type SectionValue = string | string[] | TableValue;
export type Sections = Record<string, SectionValue>;

export type DocCtx = {
  topic: { type: string; text: string; question: string; affected: string; outcome: string; decision: string; constraints: string };
  product: { name: string; description: string; target_users: string; objectives: string; context: string };
  answers: Record<string, string>;
  findings: { id: string; statement: string; segment: string; strength: string }[];
  opportunities: { id: string; title: string; problem: string; segment: string; desired_outcome: string; unknowns: string }[];
  concepts: { id: string; title: string; description: string; intervention_type: string; tradeoffs: string; status: string }[];
  assumptions: { id: string; statement: string; category: string; importance: string; support: string; status: string }[];
  decisions: { id: string; statement: string; type: string; rationale: string; date: string }[];
  sources: { id: string; title: string; type: string; content: string }[];
  done: { type: string; title: string; sections?: Sections }[];
};
export type Generated = { sections: Sections; uncertainties: string[]; notes: string[] };

export type Template = {
  type: string; label: string; intro: string; sections: SectionDef[]; intake: Question[];
  usesRecords: boolean; usesSources: "none" | "optional" | "core";
  prefill: (ctx: DocCtx) => Record<string, string>;
  generate: (ctx: DocCtx) => Generated;
};

const ans = (c: DocCtx, k: string) => { const v = (c.answers[k] ?? "").trim(); return v && v.toLowerCase() !== "unknown" ? v : ""; };
export const topicLine = (c: DocCtx) => (c.topic.question || c.topic.text.split("\n")[0]).replace(/\s+/g, " ").trim().slice(0, 160);
const ref = (type: string, id: string) => `[[${type}:${id}]]`;
const audienceOf = (c: DocCtx) => ans(c, "audience") || c.topic.affected || c.product.target_users || "the people affected";
const strip = (s: string) => s.replace(/[.\s]+$/, "");
const sentence = (s: string) => { const t = s.trim(); return !t ? "" : /[.?!]$/.test(t) ? t : `${t}.`; };
const lower1 = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

// ---------------- generators ----------------
const research_plan = (c: DocCtx): Generated => {
  const t = c.topic.type, who = audienceOf(c), line = topicLine(c), decision = ans(c, "decision") || c.topic.decision;
  const budget = ans(c, "budget");
  const objectives = [
    `Understand ${lower1(strip(who))} and how they deal with this today: “${line}”`,
    decision ? `Give us enough evidence to decide: ${strip(decision)}` : "Agree what decision this research should inform (none is stated yet)",
    t === "idea" ? "Find out whether the underlying problem is real, frequent and painful enough to act on"
      : t === "requirement" ? "Confirm who needs this, why, and what happens if it is not delivered"
      : t === "problem" ? "Establish who is affected, how often, how badly, and what is driving it"
      : "Answer the question with evidence rather than opinion",
  ];
  const questions = t === "idea"
    ? ["Who has the problem this idea addresses, and in what situation?", "How do they cope today, and what does that cost them?", "What would make them switch, and what would stop them?", "Which assumptions must be true for this to work?", "What evidence would make us stop?"]
    : t === "requirement"
    ? ["Who asked for this, and what are they trying to achieve?", "What happens today when it is missing?", "Who else is affected, and is it the same for them?", "Is there a simpler way to meet the underlying need?", "What would ‘good enough’ look like?"]
    : ["Who is affected, and are all segments affected in the same way?", "How often does it happen, and how do we know?", "What is the impact when it happens?", "What do people do today to cope?", "What might be causing it (as hypotheses to test)?"];
  const who2 = strip(who);
  const rows = budget.startsWith("A few days")
    ? [["Interviews", "Fast, rich, reveals context", who2, "5", "Low"], ["Review of existing feedback or tickets", "Uses what you already have", "Support / sales / success", "All recent", "Low"]]
    : budget.startsWith("A month")
    ? [["Interviews", "Understand behaviour and reasons", who2, "8–12", "Medium"], ["Survey", "Check how widespread it is", who2, "50+", "Medium"], ["Observation or diary study", "See real behaviour, not reported behaviour", who2, "4–6", "High"], ["Analysis of usage or process data", "Ground the picture in what actually happened", "—", "All available", "Medium"]]
    : [["Interviews", "Understand behaviour and reasons", who2, "6–8", "Medium"], ["Review of existing feedback or tickets", "Cheap way to spot patterns", "Support / sales / success", "All recent", "Low"], ["Short survey", "Check how widespread it is", who2, "30+", "Low"]];
  return {
    sections: {
      objectives, questions,
      methods: { columns: ["Method", "Why this method", "Who", "How many", "Effort"], rows },
      recruitment: `Recruit from: ${who2}. Include people who do not like us as well as fans, and cover each segment you care about. Record a segment and a participant label for every session so evidence can later be counted by independent voices.`,
      biases: ["Ask about specific past behaviour, not hypothetical future behaviour", "Avoid describing your idea before you have heard their story", "Do not rely on people you already know or who volunteered eagerly", "Note what you saw and heard separately from what you concluded"],
      outputs: "Notes saved as evidence, a research synthesis with findings tied to quotes, and a decision record naming what changed your mind.",
    },
    uncertainties: ["Sample sizes are rules of thumb, not guarantees. Adjust to how varied your users are.", ...(budget ? [] : ["No time or budget was given, so a typical few-weeks plan is shown."])],
    notes: ["This plan restructures what you provided; it adds no facts about your users."],
  };
};

const BANK_INTERVIEW: { q: string; why: string; type: string }[] = [
  { q: "Tell me about the last time you ran into this.", why: "Anchors on real, recent behaviour", type: "Open" },
  { q: "What were you trying to get done?", why: "Goal behind the behaviour", type: "Open" },
  { q: "What happened next?", why: "Sequence of steps and workarounds", type: "Open" },
  { q: "What, if anything, made that harder than it needed to be?", why: "Pain points, unprompted", type: "Open" },
  { q: "How often does that happen, and how do you know?", why: "Frequency, and how reliable the answer is", type: "Open" },
  { q: "What have you tried in order to get around it?", why: "Existing alternatives and effort spent", type: "Open" },
  { q: "How much does it matter when it goes wrong? (1 = barely, 5 = a lot) Why?", why: "Severity", type: "Scale + open" },
  { q: "Who else is involved or affected?", why: "Stakeholders and handoffs", type: "Open" },
  { q: "If you could change one thing about this, what would it be?", why: "Priorities, after the story is told", type: "Open" },
  { q: "What did I not ask that I should have?", why: "Surfaces blind spots", type: "Open" },
];
const BANK_SURVEY: { q: string; why: string; type: string }[] = [
  { q: "How often do you run into this? (Daily / Weekly / Monthly / Rarely / Never)", why: "Frequency", type: "Single choice" },
  { q: "When it happens, how much of a problem is it? (1 = not at all, 5 = a serious problem)", why: "Severity", type: "Scale" },
  { q: "What do you do today when it happens? (choose all that apply, plus ‘other’)", why: "Current workarounds", type: "Multiple choice" },
  { q: "Describe the last time it happened.", why: "Concrete example in their words", type: "Open" },
  { q: "What is the hardest part?", why: "Pain points", type: "Open" },
  { q: "How would you describe your role?", why: "Segmenting the answers", type: "Single choice" },
  { q: "How long have you been doing this?", why: "Experience level", type: "Single choice" },
  { q: "May we contact you for a follow-up conversation?", why: "Recruit for interviews", type: "Yes / No" },
];
const questionnaire = (c: DocCtx): Generated => {
  const who = strip(audienceOf(c)), line = topicLine(c);
  const survey = ans(c, "format").toLowerCase().startsWith("survey");
  const n = ans(c, "length").startsWith("Short") ? 6 : ans(c, "length").startsWith("Long") ? 15 : 10;
  const bank = (survey ? BANK_SURVEY : BANK_INTERVIEW).slice();
  const extra = c.topic.type === "idea" ? [{ q: "What do you use today instead, and what would have to be true for you to switch?", why: "Alternatives and switching cost", type: "Open" }]
    : c.topic.type === "requirement" ? [{ q: "What happens today when this is missing?", why: "Impact of the gap", type: "Open" }] : [];
  const qs = [...bank.slice(0, Math.max(1, n - 1 - extra.length)), ...extra, bank[bank.length - 1]].slice(0, n);
  return {
    sections: {
      intro: survey
        ? `We are learning about how people deal with: “${line}”. It takes about ${Math.max(3, Math.round(n * 0.7))} minutes. There are no right or wrong answers. Answers are anonymous unless you choose to share contact details.`
        : `Thanks for making time. I’m trying to understand: “${line}”. I’m here to learn, not to test you, so there are no right or wrong answers. You can skip any question or stop at any time. Is it OK if I take notes? (Record only with explicit permission.)`,
      screener: [`Are you currently ${lower1(who)}?`, "When did you last run into this situation? (Aim for the last three months.)", "Do you work for a competitor or on our team? (If yes, thank and close.)"],
      questions: { columns: ["#", "Question", "Why we ask", "Type"], rows: qs.map((x, i) => [String(i + 1), x.q, x.why, x.type]) },
      closing: ["Is there anything else you think we should know?", "Who else should we talk to?", "May we contact you again? (Note the answer next to their participant label.)"],
      tips: survey
        ? ["Keep it short; every extra question loses respondents", "Put open questions after closed ones", "Test the survey with two people before sending", "Do not treat a survey as proof of why — only of how many"]
        : ["Ask ‘what happened’ before ‘what do you think’", "Stay silent after answers; people fill silence with the truth", "Never describe your idea before you have heard their story", "Record participant label and segment straight away"],
    },
    uncertainties: ["These are neutral starter questions. Adapt wording to how your users actually talk.", "Sequence matters: keep opinion questions until after the story is told."],
    notes: [],
  };
};

const CUE_MARKET = /\b(market|competitor|pricing|price|growth|segment|share|revenue|billion|million|adoption|trend|forecast|regulation|\d+(\.\d+)?\s?%|\$\s?\d)/i;
const market_analysis = (c: DocCtx): Generated => {
  const cands: string[] = [];
  for (const s of c.sources) for (const sent of s.content.replace(/\s+/g, " ").match(/[^.!?]+[.!?]/g) ?? []) {
    const t = sent.trim();
    if (t.length > 40 && t.length < 260 && CUE_MARKET.test(t) && cands.length < 8) cands.push(`Candidate excerpt to verify: “${t}” — ${s.title}`);
  }
  const focus = ans(c, "market") || topicLine(c);
  return {
    sections: {
      summary: `No market facts have been added yet. This is a structure to fill from sources you trust about: ${focus}.${cands.length ? ` ${cands.length} candidate excerpt(s) from your selected sources are listed under Trends for you to verify.` : " Select or add sources to pull candidate excerpts."}`,
      segments: { columns: ["Segment", "What they need", "Evidence of size or growth", "Source"], rows: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]] },
      trends: cands,
      opportunities: [],
      risks: [],
      gaps: ["How large is the reachable segment, and where does that number come from?", "Who are the alternatives customers use today (including doing nothing)?", "What would make customers switch, and what do they pay now?", "What regulation, cost or channel constraints apply?", "Which claims above come from a source, and which are your assumptions?"],
    },
    uncertainties: ["Nothing here is a market fact unless it cites a source you provided.", "Clarity does not browse the web or invent figures."],
    notes: [],
  };
};

const competitor_scan = (c: DocCtx): Generated => {
  const names = ans(c, "competitors").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const rows = (names.length ? names : ["", "", ""]).map((n) => [n, "", "", "", "", ""]);
  return {
    sections: {
      competitors: { columns: ["Competitor", "Positioning", "Strengths", "Weaknesses", "Pricing", "Source"], rows },
      differentiators: [],
      gaps: ["Where do customers say every option falls short?", "Which competitor strengths are hard for us to match?", "What do we do that nobody else does, and do customers care?"],
      implications: [],
    },
    uncertainties: ["Cells are empty on purpose. Add facts from sources you can cite; unsourced claims about competitors are the easiest way to mislead a decision."],
    notes: names.length ? [] : ["No competitors were named, so blank rows are shown."],
  };
};

const CAT_CUES: [string, RegExp][] = [
  ["Process", /(wait|delay|slow|handoff|hand off|manual|re-?enter|twice|queue|stuck|bottleneck|chase|follow.?up)/i],
  ["People", /(confus|unsure|not sure|did not know|don'?t know|training|understand|unclear)/i],
  ["Technology", /(system|tool|import|error|fail|bug|integrat|upload|login|app\b)/i],
  ["Policy", /(policy|rule|complian|approval|audit|requirement|regulat|sign.?off)/i],
  ["Data", /(status|visibility|no idea|tracking|report|record|spreadsheet|data)/i],
];
const CATS = ["People", "Process", "Technology", "Policy", "Data", "Environment"];
const rca = (c: DocCtx): Generated => {
  const symptom = ans(c, "symptom") || topicLine(c);
  const buckets = new Map<string, string[]>(CATS.map((k) => [k, []]));
  const hyp: string[][] = [];
  for (const f of c.findings.slice(0, 20)) {
    const cat = CAT_CUES.find(([, re]) => re.test(f.statement))?.[0];
    if (!cat) continue;
    buckets.get(cat)!.push(`Reported: ${strip(f.statement)} ${ref("finding", f.id)}`);
    hyp.push([strip(f.statement), "Hypothesis", `Reported in a finding (${f.strength} evidence) ${ref("finding", f.id)}`, `Look for cases where it did and did not happen; compare`]);
  }
  const pattern = ans(c, "pattern"), tried = ans(c, "tried");
  return {
    sections: {
      problem: `${sentence(symptom)}${pattern ? ` Pattern: ${strip(pattern)}.` : ""}${tried ? ` Already tried: ${strip(tried)}.` : ""}`,
      whys: [`Why does “${strip(symptom)}” happen? →`, "Why is that? →", "Why is that? →", "Why is that? →", "Why is that? →"],
      fishbone: { columns: ["Category", "Possible causes"], rows: CATS.map((k) => [k, (buckets.get(k) ?? []).join("\n")]) },
      hypotheses: { columns: ["Possible cause", "Status", "Evidence for / against", "How to test it"], rows: hyp.length ? hyp : [["", "Hypothesis", "", ""]] },
      needed: [
        "Data showing when and how often it happens (an event log or usage data, if available)",
        "Examples where it did NOT happen, to compare against",
        ...(c.done.some((d) => d.type === "event_log") ? [] : ["Process data has not been analysed yet"]),
      ],
      likely: "",
    },
    uncertainties: ["Causes are hypotheses until tested. A cause that fits the story is not proof.", "Fishbone entries come only from findings you already accepted, keyword-matched to a category; check each is in the right place."],
    notes: [],
  };
};

const STAGES = ["Discover", "Decide", "Get started", "Use", "Get help", "Continue"];
const DIMS = ["Goal", "Actions", "Touchpoints", "Thoughts", "Feeling", "Pain points", "Opportunities"];
const journey_map = (c: DocCtx): Generated => {
  const stages = ans(c, "stages").split(/[,;\n>]/).map((s) => s.trim()).filter(Boolean);
  const cols = stages.length ? stages : STAGES;
  return {
    sections: {
      persona: `${strip(audienceOf(c))}.`,
      scenario: ans(c, "scenario") || topicLine(c),
      map: { columns: ["", ...cols], rows: DIMS.map((d) => [d, ...cols.map(() => "")]) },
      pains: c.findings.slice(0, 12).map((f) => `${strip(f.statement)} ${ref("finding", f.id)}`),
      moments: [],
    },
    uncertainties: ["The grid is left for you to fill. A journey map with invented feelings is worse than none.", "Pain points listed below come from your accepted findings; place each in the stage where it occurs."],
    notes: [],
  };
};

const solution_design = (c: DocCtx): Generated => {
  const opts = c.concepts.length
    ? c.concepts.map((x) => [x.title, x.description || "", "", x.tradeoffs || "", `${ref("concept", x.id)}`])
    : [["Clearer information", "Explain expectations and status where uncertainty arises", "", "", ""], ["Process or policy change", "Remove or combine the steps that create the problem", "", "", ""], ["Workflow change", "Change who does what, and when", "", "", ""], ["Product feature or automation", "Only if the cause is repeated, stable work", "", "", ""]];
  const probs = c.opportunities.slice(0, 5).map((o) => `${strip(o.title)} ${ref("opportunity", o.id)}`);
  return {
    sections: {
      problem: `${topicLine(c)}${probs.length ? "\n\nLinked problems:\n" + probs.map((p) => `• ${p}`).join("\n") : ""}`,
      principles: [ans(c, "success") || c.topic.outcome ? `Success looks like: ${strip(ans(c, "success") || c.topic.outcome)}` : "Define what success looks like", ...(ans(c, "constraints") || c.topic.constraints ? [`Constraint: ${strip(ans(c, "constraints") || c.topic.constraints)}`] : [])],
      options: { columns: ["Option", "Description", "Pros", "Cons and trade-offs", "Related"], rows: opts },
      recommended: "",
      tradeoffs: [],
      questions: [...c.opportunities.filter((o) => o.unknowns).slice(0, 4).map((o) => `${strip(o.unknowns)} ${ref("opportunity", o.id)}`), ...c.assumptions.filter((a) => a.importance === "high" && !["supported", "refuted"].includes(a.status)).slice(0, 3).map((a) => `Unproven: ${strip(a.statement)} ${ref("assumption", a.id)}`)],
    },
    uncertainties: c.concepts.length ? ["Options come from your solution concepts. Pros are left blank for you to argue from evidence."] : ["No concepts exist yet, so the rows are prompts covering different kinds of response. AI or automation is one option among several."],
    notes: [],
  };
};

const requirements = (c: DocCtx): Generated => {
  const src = c.concepts.length ? c.concepts.filter((x) => x.status !== "dropped").map((x) => ({ want: x.title, ref: ref("concept", x.id), so: "" })) : c.opportunities.map((o) => ({ want: `Address: ${o.title}`, ref: ref("opportunity", o.id), so: o.desired_outcome }));
  const persona = strip(audienceOf(c));
  const rows = src.length ? src.slice(0, 12).map((s) => [persona, s.want, s.so, "", s.ref]) : [[persona, "", "", "", ""]];
  return {
    sections: {
      stories: { columns: ["As a…", "I want to…", "So that…", "Priority", "Source"], rows },
      acceptance: { columns: ["Story #", "Given", "When", "Then"], rows: rows.map((_, i) => [String(i + 1), "", "", ""]) },
      nfr: ["Consider: performance and availability expectations", "Consider: security, privacy and data retention", "Consider: accessibility", "Consider: auditability and compliance", "Consider: analytics needed to know whether it worked"],
      outscope: [],
      questions: c.opportunities.filter((o) => o.unknowns).slice(0, 5).map((o) => `${strip(o.unknowns)} ${ref("opportunity", o.id)}`),
    },
    uncertainties: ["Stories restate your concepts or opportunities; acceptance criteria are yours to write, and “Then” must be observable."],
    notes: [],
  };
};

const prd = (c: DocCtx): Generated => {
  const strong = c.findings.slice(0, 12);
  const latest = c.decisions[0];
  const goals = (c.topic.outcome || c.product.objectives)
    ? [[strip(c.topic.outcome || c.product.objectives), "", "", ""]] : [["", "", "", ""]];
  const req = c.done.find((d) => d.type === "requirements")?.sections?.stories as TableValue | undefined;
  const reqList = req ? req.rows.filter((r) => r[1]).map((r) => `As ${r[0]}, I want to ${lower1(r[1])}${r[2] ? `, so that ${lower1(r[2])}` : ""}${r[4] ? ` ${r[4]}` : ""}`)
    : c.concepts.filter((x) => x.status !== "dropped").map((x) => `${x.title}${x.description ? ` — ${strip(x.description)}` : ""} ${ref("concept", x.id)}`);
  return {
    sections: {
      overview: `${sentence(topicLine(c))}${c.topic.outcome ? `\n\nDesired outcome: ${strip(c.topic.outcome)}.` : ""}${c.topic.decision ? `\nDecision this informs: ${strip(c.topic.decision)}.` : ""}`,
      background: strong.map((f) => `${strip(f.statement)} (${f.strength} evidence${f.segment ? `, ${f.segment}` : ""}) ${ref("finding", f.id)}`),
      users: [c.topic.affected, c.product.target_users].filter(Boolean).map(strip).join(". ") || "",
      goals: { columns: ["Goal", "Metric", "Target", "Baseline and where it comes from"], rows: goals },
      scope: c.concepts.filter((x) => ["preferred", "considering"].includes(x.status)).map((x) => `${x.title} ${ref("concept", x.id)}`),
      outscope: c.concepts.filter((x) => x.status === "dropped").map((x) => `${x.title} (dropped) ${ref("concept", x.id)}`),
      requirements: reqList,
      solution: latest ? `${latest.statement}${latest.rationale ? `\n\nRationale: ${strip(latest.rationale)}.` : ""} ${ref("decision", latest.id)}` : "No decision has been recorded yet.",
      risks: [...c.assumptions.filter((a) => !["supported"].includes(a.status)).sort((a, b) => (a.importance === "high" ? -1 : 0) - (b.importance === "high" ? -1 : 0)).slice(0, 8).map((a) => `Assumption (${a.status}, importance ${a.importance}): ${strip(a.statement)} ${ref("assumption", a.id)}`), ...c.findings.filter((f) => f.strength === "weak" || f.strength === "unknown").slice(0, 4).map((f) => `Weakly supported: ${strip(f.statement)} ${ref("finding", f.id)}`)],
      questions: c.opportunities.filter((o) => o.unknowns).slice(0, 6).map((o) => `${strip(o.unknowns)} ${ref("opportunity", o.id)}`),
      decisions: c.decisions.slice(0, 6).map((d) => `${d.date}: ${strip(d.statement)} ${ref("decision", d.id)}`),
    },
    uncertainties: [
      ...(c.findings.length ? [] : ["No findings exist yet, so Background is empty. A PRD without evidence is an opinion — consider research first."]),
      "Targets and metrics are left blank: only you can commit to them.",
    ],
    notes: ["Assembled from your records; every cited item links back to its source. Nothing was written by a model in scaffold mode."],
  };
};

const test_plan = (c: DocCtx): Generated => {
  const asm = ans(c, "assumption") || c.assumptions.filter((a) => a.importance === "high" && !["supported", "refuted"].includes(a.status))[0]?.statement || "";
  const method = ans(c, "method") || "Prototype test";
  return {
    sections: {
      hypothesis: asm ? `If ${lower1(strip(asm))}, then we expect to observe behaviour that confirms it.` : "If …, then we expect to observe …",
      assumptions: c.assumptions.filter((a) => !["supported", "refuted"].includes(a.status)).slice(0, 5).map((a) => `${strip(a.statement)} ${ref("assumption", a.id)}`),
      method: `${method}. Choose the cheapest test that could show you are wrong.`,
      participants: ans(c, "participants") || `${strip(audienceOf(c))}. Say how many, and how you will recruit them.`,
      criteria: "",
      metrics: [],
      rules: { columns: ["If we see…", "Then we…"], rows: [["The success criterion is met", "Proceed to the next, larger test"], ["The criterion is not met", "Stop, or rethink the concept"], ["The result is inconclusive", "Fix the method and rerun before deciding"]] },
      timeline: [],
    },
    uncertainties: ["Write the success criterion BEFORE running the test, and do not change it afterwards. Negative and inconclusive results are valid outcomes."],
    notes: [],
  };
};

// ---------------- templates ----------------
const T = (x: Template) => x;
const AUD: Question = { key: "audience", label: "Who do you most need to hear from or design for?", kind: "text", placeholder: "e.g. small-business clients going through onboarding", why: "Shapes who to recruit and how questions are worded" };

export const TEMPLATES: Record<string, Template> = {
  research_plan: T({
    type: "research_plan", label: "User research plan", usesRecords: false, usesSources: "none",
    intro: "A plan for what to learn, from whom, and how — before you talk to anyone.",
    intake: [AUD, { key: "decision", label: "What decision should this research inform?", kind: "text", why: "Research without a decision to inform tends to produce reports nobody uses" }, { key: "budget", label: "How much time do you have?", kind: "choice", options: ["A few days", "A few weeks", "A month or more"], why: "Sets a realistic method mix" }],
    sections: [
      { key: "objectives", title: "Objectives", kind: "list", help: "What you want to learn" },
      { key: "questions", title: "Research questions", kind: "list", help: "The questions the research must answer" },
      { key: "methods", title: "Methods", kind: "table", help: "How you’ll find out", columns: ["Method", "Why this method", "Who", "How many", "Effort"] },
      { key: "recruitment", title: "Who to recruit", kind: "text", help: "Include people who don’t like you as well as fans" },
      { key: "biases", title: "Watch out for", kind: "list", help: "Common ways this research goes wrong" },
      { key: "outputs", title: "What you’ll produce", kind: "text", help: "" },
    ],
    prefill: (c) => ({ audience: c.topic.affected || c.product.target_users, decision: c.topic.decision }), generate: research_plan,
  }),
  questionnaire: T({
    type: "questionnaire", label: "Questionnaire / interview guide", usesRecords: false, usesSources: "none",
    intro: "Neutral, non-leading questions you can take straight into a conversation or a survey.",
    intake: [AUD, { key: "format", label: "Interview or survey?", kind: "choice", options: ["Interview guide", "Survey"], why: "Interviews explore why; surveys measure how many" }, { key: "length", label: "How long?", kind: "choice", options: ["Short (about 6 questions)", "Medium (about 10)", "Long (about 15)"], why: "Length drives completion and depth" }],
    sections: [
      { key: "intro", title: "Opening script", kind: "text", help: "Say this first" },
      { key: "screener", title: "Screening questions", kind: "list", help: "To be sure you’re talking to the right people" },
      { key: "questions", title: "Questions", kind: "table", help: "In this order", columns: ["#", "Question", "Why we ask", "Type"] },
      { key: "closing", title: "Closing", kind: "list", help: "" },
      { key: "tips", title: "Tips for running it", kind: "list", help: "" },
    ],
    prefill: (c) => ({ audience: c.topic.affected || c.product.target_users }), generate: questionnaire,
  }),
  market_analysis: T({
    type: "market_analysis", label: "Market analysis", usesRecords: false, usesSources: "optional",
    intro: "A structure for market understanding built only from sources you provide. Nothing is invented.",
    intake: [{ key: "market", label: "Which market or category?", kind: "text", placeholder: "e.g. AI customer-support assistants for mid-size banks", why: "Keeps the analysis on one market" }],
    sections: [
      { key: "summary", title: "Summary", kind: "text", help: "What the sources say, and what they don’t" },
      { key: "segments", title: "Segments", kind: "table", help: "", columns: ["Segment", "What they need", "Evidence of size or growth", "Source"] },
      { key: "trends", title: "Trends and candidate evidence", kind: "list", help: "Cite a source for each" },
      { key: "opportunities", title: "Opportunities", kind: "list", help: "" },
      { key: "risks", title: "Risks", kind: "list", help: "" },
      { key: "gaps", title: "What we still need to find out", kind: "list", help: "" },
    ],
    prefill: () => ({}), generate: market_analysis,
  }),
  competitor_scan: T({
    type: "competitor_scan", label: "Competitor scan", usesRecords: false, usesSources: "optional",
    intro: "A side-by-side view of alternatives, including doing nothing. Every cell should cite a source.",
    intake: [{ key: "competitors", label: "Which competitors or alternatives do you already know?", kind: "text", placeholder: "Comma-separated, e.g. Acme, Globex, spreadsheets", why: "Pre-fills the rows. Leave blank to add later." }],
    sections: [
      { key: "competitors", title: "Competitors", kind: "table", help: "", columns: ["Competitor", "Positioning", "Strengths", "Weaknesses", "Pricing", "Source"] },
      { key: "differentiators", title: "Where we could differ", kind: "list", help: "" },
      { key: "gaps", title: "Gaps to look into", kind: "list", help: "" },
      { key: "implications", title: "Implications for us", kind: "list", help: "" },
    ],
    prefill: () => ({}), generate: competitor_scan,
  }),
  rca: T({
    type: "rca", label: "Root-cause analysis", usesRecords: true, usesSources: "optional",
    intro: "Work from the symptom to testable causes. Causes stay hypotheses until you test them.",
    intake: [{ key: "symptom", label: "What exactly is going wrong? (Measurable if you can)", kind: "text", why: "A vague symptom produces vague causes" }, { key: "pattern", label: "When does it happen, and how often?", kind: "text", why: "Patterns point at causes" }, { key: "tried", label: "What has already been tried?", kind: "text", why: "Avoids re-proposing failed fixes" }],
    sections: [
      { key: "problem", title: "Problem statement", kind: "text", help: "" },
      { key: "whys", title: "5 whys", kind: "list", help: "Keep asking why, each answer becoming the next question" },
      { key: "fishbone", title: "Fishbone: possible causes by category", kind: "table", help: "", columns: ["Category", "Possible causes"] },
      { key: "hypotheses", title: "Cause hypotheses", kind: "table", help: "Each must say how to test it", columns: ["Possible cause", "Status", "Evidence for / against", "How to test it"] },
      { key: "needed", title: "Evidence still needed", kind: "list", help: "" },
      { key: "likely", title: "Most likely cause (once tested)", kind: "text", help: "Leave blank until evidence supports it" },
    ],
    prefill: (c) => ({ symptom: c.topic.question || c.topic.text.split("\n")[0] }), generate: rca,
  }),
  journey_map: T({
    type: "journey_map", label: "User journey map", usesRecords: true, usesSources: "optional",
    intro: "How one kind of person moves through a goal — stage by stage, including how it feels.",
    intake: [{ ...AUD, label: "Whose journey is this?" }, { key: "scenario", label: "What are they trying to achieve?", kind: "text", why: "A journey needs one goal" }, { key: "stages", label: "Stages (optional, comma-separated)", kind: "text", placeholder: "Discover, Decide, Get started, Use, Get help", why: "Leave blank for a sensible default set" }],
    sections: [
      { key: "persona", title: "Who", kind: "text", help: "" },
      { key: "scenario", title: "Scenario", kind: "text", help: "" },
      { key: "map", title: "Journey", kind: "table", help: "Fill each stage from evidence, not imagination" },
      { key: "pains", title: "Pain points from your findings", kind: "list", help: "Place each in the stage where it happens" },
      { key: "moments", title: "Moments that matter", kind: "list", help: "Where the experience is won or lost" },
    ],
    prefill: (c) => ({ audience: c.topic.affected || c.product.target_users, scenario: c.topic.question }), generate: journey_map,
  }),
  solution_design: T({
    type: "solution_design", label: "Solution design", usesRecords: true, usesSources: "none",
    intro: "Options and honest trade-offs before you commit — information, process and policy as well as features.",
    intake: [{ key: "success", label: "What would success look like?", kind: "text", why: "Options are judged against it" }, { key: "constraints", label: "What constraints are fixed?", kind: "text", why: "Filters options early" }],
    sections: [
      { key: "problem", title: "Problem", kind: "text", help: "" },
      { key: "principles", title: "Design principles and constraints", kind: "list", help: "" },
      { key: "options", title: "Options", kind: "table", help: "", columns: ["Option", "Description", "Pros", "Cons and trade-offs", "Related"] },
      { key: "recommended", title: "Recommended direction", kind: "text", help: "Your call — say why" },
      { key: "tradeoffs", title: "Trade-offs we are accepting", kind: "list", help: "" },
      { key: "questions", title: "Open questions", kind: "list", help: "" },
    ],
    prefill: (c) => ({ success: c.topic.outcome, constraints: c.topic.constraints }), generate: solution_design,
  }),
  requirements: T({
    type: "requirements", label: "Requirements & user stories", usesRecords: true, usesSources: "none",
    intro: "User stories with observable acceptance criteria, traced to the concepts and opportunities behind them.",
    intake: [AUD],
    sections: [
      { key: "stories", title: "User stories", kind: "table", help: "", columns: ["As a…", "I want to…", "So that…", "Priority", "Source"] },
      { key: "acceptance", title: "Acceptance criteria", kind: "table", help: "“Then” must be something you can observe", columns: ["Story #", "Given", "When", "Then"] },
      { key: "nfr", title: "Non-functional considerations", kind: "list", help: "Delete what doesn’t apply" },
      { key: "outscope", title: "Out of scope", kind: "list", help: "" },
      { key: "questions", title: "Open questions", kind: "list", help: "" },
    ],
    prefill: (c) => ({ audience: c.topic.affected || c.product.target_users }), generate: requirements,
  }),
  prd: T({
    type: "prd", label: "PRD", usesRecords: true, usesSources: "none",
    intro: "A product requirements document assembled from your findings, concepts, assumptions and decisions. Every cited line links back to its source.",
    intake: [],
    sections: [
      { key: "overview", title: "Overview", kind: "text", help: "" },
      { key: "background", title: "Background and evidence", kind: "list", help: "" },
      { key: "users", title: "Users", kind: "text", help: "" },
      { key: "goals", title: "Goals and success metrics", kind: "table", help: "Only you can commit to targets", columns: ["Goal", "Metric", "Target", "Baseline and where it comes from"] },
      { key: "scope", title: "In scope", kind: "list", help: "" },
      { key: "outscope", title: "Out of scope", kind: "list", help: "" },
      { key: "requirements", title: "Requirements", kind: "list", help: "" },
      { key: "solution", title: "Solution direction", kind: "text", help: "" },
      { key: "risks", title: "Risks and assumptions", kind: "list", help: "" },
      { key: "questions", title: "Open questions", kind: "list", help: "" },
      { key: "decisions", title: "Decisions so far", kind: "list", help: "" },
    ],
    prefill: () => ({}), generate: prd,
  }),
  test_plan: T({
    type: "test_plan", label: "Test plan", usesRecords: true, usesSources: "none",
    intro: "Decide how you’ll be proved wrong — and what you’ll do about each result — before you run anything.",
    intake: [{ key: "assumption", label: "Which assumption are you testing?", kind: "text", why: "One test, one main assumption" }, { key: "method", label: "How will you test it?", kind: "choice", options: ["Interviews", "Prototype test", "Concierge test", "Operational pilot", "Controlled experiment"], why: "Prefer the cheapest test that could prove you wrong" }, { key: "participants", label: "Who will take part, and how many?", kind: "text", why: "" }],
    sections: [
      { key: "hypothesis", title: "Hypothesis", kind: "text", help: "" },
      { key: "assumptions", title: "Assumptions this addresses", kind: "list", help: "" },
      { key: "method", title: "Method", kind: "text", help: "" },
      { key: "participants", title: "Participants", kind: "text", help: "" },
      { key: "criteria", title: "Success criterion (set before running)", kind: "text", help: "Then don’t change it" },
      { key: "metrics", title: "What you’ll measure", kind: "list", help: "" },
      { key: "rules", title: "Decision rules", kind: "table", help: "", columns: ["If we see…", "Then we…"] },
      { key: "timeline", title: "Timeline", kind: "list", help: "" },
    ],
    prefill: (c) => ({ assumption: c.assumptions.filter((a) => a.importance === "high" && !["supported", "refuted"].includes(a.status))[0]?.statement ?? "" }), generate: test_plan,
  }),
};

export const DOC_TYPES = Object.keys(TEMPLATES);
export const isDocType = (t: string) => t in TEMPLATES;

/** Which questions still need asking? Anything already known (from the topic, product or earlier answers) is prefilled and skipped. */
export function intakeStatus(t: Template, ctx: DocCtx) {
  const pre = t.prefill(ctx);
  return t.intake.map((q) => {
    const answered = (ctx.answers[q.key] ?? "").trim();
    const known = (pre[q.key] ?? "").trim();
    return { q, answer: answered, prefilled: !answered && known ? known : "", needsAsking: !answered && !known };
  });
}

export function emptySections(t: Template): Sections {
  return Object.fromEntries(t.sections.map((s) => [s.key, s.kind === "text" ? "" : s.kind === "list" ? [] : { columns: s.columns ?? [], rows: [] }])) as Sections;
}
export function isEmptyValue(v: SectionValue | undefined): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  return v.rows.length === 0 || v.rows.every((r) => r.every((c) => !c.trim()));
}

/** Markdown export. [[type:id]] references are rendered through `label`. */
export type TemplateLite = Pick<Template, "type" | "label" | "intro" | "sections" | "intake" | "usesRecords" | "usesSources">;
export const liteOf = (t: Template): TemplateLite => ({ type: t.type, label: t.label, intro: t.intro, sections: t.sections, intake: t.intake, usesRecords: t.usesRecords, usesSources: t.usesSources });

export function docToMarkdown(t: Pick<Template, "sections">, title: string, sections: Sections, label: (tok: string) => string = (x) => x): string {
  const fix = (s: string) => s.replace(/\[\[([a-z_]+:[A-Za-z0-9_]+)\]\]/g, (_, tok) => label(tok));
  const out = [`# ${title}`];
  for (const s of t.sections) {
    const v = sections[s.key];
    out.push(`## ${s.title}`);
    if (isEmptyValue(v)) { out.push("_Not filled in yet._"); continue; }
    if (typeof v === "string") out.push(fix(v));
    else if (Array.isArray(v)) out.push(v.map((x) => `- ${fix(x)}`).join("\n"));
    else {
      const esc = (x: string) => fix(x).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
      out.push(`| ${v.columns.map((c) => c || " ").join(" | ")} |`, `| ${v.columns.map(() => "---").join(" | ")} |`, ...v.rows.map((r) => `| ${v.columns.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`));
    }
  }
  return out.join("\n\n") + "\n";
}
