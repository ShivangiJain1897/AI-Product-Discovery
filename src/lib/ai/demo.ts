// DEMO AI mode. No model is called. These are deterministic, keyword- and template-based
// samples so the proposal → review → accept workflow can be exercised without an API key.
// Everything produced here is labelled "Demo" in the UI and is never presented as model analysis.
import { all, get } from "../db";
import { findingStrength } from "../strength";
import type { Ctx } from "./context";
import type { Kind, Proposal } from "./schemas";

const TOPICS: { key: string; label: string; cues: RegExp }[] = [
  { key: "delay", label: "waiting, delays and slow turnaround", cues: /\b(wait(ed|ing)?|delay(s|ed)?|slow(er|ly)?|days|weeks|took (a )?(long|forever)|stuck|backlog|turnaround|takes? (too )?long)\b/i },
  { key: "confusion", label: "unclear information and confusion", cues: /\b(confus\w*|unclear|not sure|unsure|didn'?t (know|understand)|don'?t know|hard to (find|understand)|no idea|documentation|instructions?|what (happens|to do) next)\b/i },
  { key: "manual", label: "manual work and re-entering information", cues: /\b(manual(ly)?|spreadsheet|re-?enter\w*|re-?type\w*|copy(ing)?|paste|twice|duplicate\w*|again and again|rework)\b/i },
  { key: "handoff", label: "handoffs and chasing follow-ups", cues: /\b(hand(ed)? ?off|handoff|chase|chasing|follow(ing)?[- ]up|forward(ed)?|another team|back and forth|ping(ed)?|email(s|ed)?|no one owns|nobody owns)\b/i },
  { key: "trust", label: "trust, risk and compliance concerns", cues: /\b(trust|worr(y|ied)|risk(y)?|security|compliance|afraid|concern(ed|s)?|privacy|audit)\b/i },
  { key: "setup", label: "setup and getting-started friction", cues: /\b(set ?up|onboard\w*|getting started|first time|integrat\w*|connect(ing)?|import(ing)?|invite|configure|sign ?up)\b/i },
  { key: "value", label: "reasons for using (or leaving) the product", cues: /\b(useful|worth|benefit|goal|expected|expectation|value|pointless|gave up|abandon\w*|stopped using|didn'?t see (the )?point)\b/i },
  { key: "works", label: "things that work well", cues: /\b(love[ds]?|easy|easier|helpful|great|smooth|works? well|liked|enjoy\w*|clear(er)?|intuitive)\b/i },
];

export type Sentence = { text: string; sourceId: string };

export function sentencesOf(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\n+/)) {
    const cleaned = line.replace(/^\s*([-*•]|\d+[.)])\s+/, "");
    const parts = cleaned.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
    for (let p of parts) {
      p = p.trim().replace(/^(?:(?:Q|A|P\d+|Participant(?: \w+)?|Interviewer|Me|Them|R\d*)\s*[:\-]\s*)/i, "").trim();
      if (p.length >= 35 && p.length <= 320 && !/^#+\s/.test(p) && !/\?$/.test(p)) out.push(p);
    }
  }
  return out;
}

export function demoSynthesis(ctx: Ctx): Proposal {
  const texts = ctx.sources.filter((s) => s.kind === "text");
  const groups = new Map<string, { sourceId: string; quote: string }[]>();
  const seen = new Set<string>();
  const unmatched: string[] = [];
  for (const s of texts) {
    let matched = 0;
    for (const sent of sentencesOf(s.content)) {
      const hits = TOPICS.map((t) => ({ t, n: (sent.match(new RegExp(t.cues.source, "gi")) ?? []).length })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
      if (!hits.length) continue;
      const k = `${s.id}|${sent}`;
      if (seen.has(k) || !s.content.includes(sent)) continue;
      seen.add(k); matched++;
      const g = groups.get(hits[0].t.key) ?? []; g.push({ sourceId: s.id, quote: sent }); groups.set(hits[0].t.key, g);
    }
    if (!matched) unmatched.push(s.title);
  }
  const voiceOf = (id: string) => { const s = ctx.sources.find((x) => x.id === id)!; return s.participant ? `p:${s.participant}` : `s:${s.id}`; };
  const ranked = [...groups].map(([key, refs]) => ({ key, refs, voices: new Set(refs.map((r) => voiceOf(r.sourceId))).size }))
    .sort((a, b) => b.voices - a.voices || b.refs.length - a.refs.length).slice(0, 6);
  const items = ranked.filter((g) => g.key !== "works" || true).map((g) => {
    const t = TOPICS.find((x) => x.key === g.key)!;
    const refs = g.refs.slice(0, 5);
    const segs = [...new Set(refs.map((r) => ctx.sources.find((s) => s.id === r.sourceId)!.segment).filter(Boolean))];
    return {
      statement: g.key === "works" ? `Some participants describe things that work well around ${t.label}.` : `Some participants describe ${t.label}.`,
      interpretation: "DEMO: grouped by keyword, not interpreted by a model. Read the excerpts and write your own interpretation before accepting.",
      limitations: `Keyword matching can miss context, irony and negation. ${g.voices === 1 ? "Only one voice is behind this group. " : ""}${segs.length === 1 ? `All excerpts come from one segment (${segs[0]}).` : ""}`.trim(),
      followUp: "How often does this happen, and what did the person do about it? Who does it not affect?",
      segment: segs.length === 1 ? segs[0] : "",
      supporting: refs, contradicting: [],
    };
  });
  const segments = [...new Set(texts.map((s) => s.segment).filter(Boolean))];
  const gaps: string[] = [];
  for (const seg of segments) if (!items.some((i) => i.segment === seg || i.supporting.some((r) => ctx.sources.find((s) => s.id === r.sourceId)?.segment === seg)))
    gaps.push(`No excerpts matched for segment “${seg}”.`);
  if (unmatched.length) gaps.push(`No keyword pattern found in: ${unmatched.join(", ")}.`);
  return {
    kind: "synthesis", mode: "demo", title: "Candidate findings (demo keyword grouping)",
    summary: `Grouped ${seen.size} sentences from ${texts.length} source(s) into ${items.length} candidate theme(s) using a fixed keyword list.`,
    items, edges: [],
    notes: {
      themes: ranked.map((g) => `${TOPICS.find((t) => t.key === g.key)!.label} — ${g.refs.length} excerpt(s), ${g.voices} voice(s)`),
      gaps, contradictions: ["Demo mode does not look for contradictions. Read the sources for statements that disagree."],
    },
    assumptions: ["Sentences that contain a cue word are relevant to that theme.", "Each participant label identifies one independent voice."],
    uncertainties: ["Keyword matching is not comprehension; themes may be mis-assigned.", "A live model would interpret meaning and find contradictions."],
    followUps: ["Accept only the groups you would defend; edit the wording; then look for evidence that disagrees."],
  };
}

const STEP_LINE = /^\s*(?:step\s*)?(\d+)[.):]\s+(.+)$|^\s*[-*•]\s+(.+)$/i;
export function demoProcessDraft(ctx: Ctx): Proposal {
  const items: any[] = []; const edges: { from: string; to: string; label: string }[] = [];
  const steps: { text: string; sourceId: string }[] = [];
  for (const s of ctx.sources.filter((x) => x.kind === "text")) {
    for (const line of s.content.split("\n")) {
      const m = line.match(STEP_LINE);
      if (m) steps.push({ text: (m[2] ?? m[3]).trim(), sourceId: s.id });
    }
  }
  const startId = "t_start", endId = "t_end";
  items.push({ tempId: startId, type: "start", name: "Start", description: "", actor: "", support: "inferred", refs: [] });
  let prev = startId;
  steps.slice(0, 30).forEach((st, i) => {
    let actor = ""; let name = st.text;
    const m1 = name.match(/^\[([^\]]{2,30})\]\s*(.+)$/); const m2 = name.match(/^(.{2,30}?)\s*(?:—|–| - |:)\s+(.+)$/);
    const m3 = name.match(/^(.+?)\s*\(([A-Z][\w &/-]{1,28})\)\.?$/);
    if (m1) { actor = m1[1]; name = m1[2]; }
    else if (m3) { name = m3[1]; actor = m3[2]; }
    else if (m2 && /^[A-Z][\w &/-]*$/.test(m2[1]) && m2[1].split(" ").length <= 3) { actor = m2[1]; name = m2[2]; }
    const isDecision = /^(if|when|check whether|decide|is |does |are )/i.test(name) || /\?\s*$/.test(name);
    const id = `t_${i + 1}`;
    items.push({
      tempId: id, type: isDecision ? "decision" : "activity", name: name.replace(/[.;]$/, "").slice(0, 120), actor,
      description: isDecision ? "Branches are not stated in the source. Add them and label each one." : "",
      support: "evidence", refs: [{ sourceId: st.sourceId, quote: st.text }],
    });
    edges.push({ from: prev, to: id, label: isDecision ? "" : "" });
    prev = id;
  });
  items.push({ tempId: endId, type: "end", name: "End", description: "", actor: "", support: "inferred", refs: [] });
  if (steps.length) edges.push({ from: prev, to: endId, label: "" });
  return {
    kind: "process_draft", mode: "demo", title: "Draft process from listed steps (demo)",
    summary: steps.length ? `Read ${steps.length} numbered or bulleted step(s) in order.` : "No numbered or bulleted steps found.",
    items: steps.length ? items : [], edges: steps.length ? edges : [], notes: {},
    assumptions: ["The listed order is the order work actually happens.", "Each list line is one activity."],
    uncertainties: [
      "Steps are marked “supported by evidence” only because they appear in a source; whether people really work this way must be confirmed.",
      "Start and end are inferred. Decision branches, loops and actors are not inferred beyond what the text states.",
      ...(steps.length ? [] : ["Demo mode reads numbered or bulleted lists only. A live model can read prose."]),
    ],
    followUps: ["Confirm the sequence with the people who do the work, then add branches and loops."],
  };
}

export function demoOpportunities(ctx: Ctx): Proposal {
  const ids = (ctx.scope.extra?.findingIds as string[] | undefined) ?? [];
  const fs = (ids.length ? ids.map((id) => get<any>("SELECT * FROM findings WHERE id=? AND product_id=? AND deleted_at IS NULL", id, ctx.productId)).filter(Boolean)
    : all<any>("SELECT * FROM findings WHERE product_id=? AND (initiative_id IS ? OR ?) AND deleted_at IS NULL AND status='accepted' ORDER BY created_at LIMIT 8",
        ctx.productId, ctx.scope.initiativeId ?? null, ctx.scope.initiativeId ? 0 : 1).filter((f: any) => !ctx.scope.initiativeId || f.initiative_id === ctx.scope.initiativeId));
  return {
    kind: "opportunities", mode: "demo", title: "Opportunity starters from accepted findings (demo)",
    summary: "One starter per finding. These restate findings as problems; they are not new analysis.",
    items: fs.map((f: any) => ({
      title: f.statement.replace(/^Some participants describe /i, "Address: ").replace(/\.$/, "").slice(0, 100),
      problem: f.statement, segment: f.segment, context: "", desiredOutcome: "",
      unknowns: "How often this happens, how severe it is, who is affected, and what is causing it are not yet established.", findingIds: [f.id],
    })),
    edges: [], notes: {},
    assumptions: ["Each finding describes a problem worth considering."],
    uncertainties: ["A finding is an observation, not necessarily a problem worth solving. Check severity and reach."],
    followUps: ["Merge overlapping opportunities, then separate symptoms from potential causes."],
  };
}

export function demoConcepts(ctx: Ctx): Proposal {
  const opp = get<any>("SELECT * FROM opportunities WHERE id=? AND product_id=?", ctx.scope.targetId, ctx.productId);
  const p = (opp?.title ?? "this problem").replace(/^Address: /, "");
  const t = [
    ["information", "Make it clear what happens next", `Explain expectations and status at the moment it matters, so uncertainty about “${p}” shrinks without changing how work is done.`, "Cheap and reversible. Does not remove underlying delays or rework."],
    ["process", "Simplify the process behind it", `Remove, combine or reorder the steps that create “${p}”.`, "Often the biggest effect. Needs process owners' agreement and may touch controls."],
    ["policy", "Change the rule or policy that forces it", `Relax or clarify a requirement that drives “${p}”.`, "Fast if the rule is internal. Check compliance and risk implications first."],
    ["workflow", "Change who does what, and when", `Move ownership or timing of work to a different person, team or moment.`, "No build required. Depends on capacity and willingness to change roles."],
    ["automation", "Automate a repetitive part", `Automate the repeated, rule-based portion of the work behind “${p}”. Only worthwhile if that work is genuinely repeated and stable.`, "Adds build and maintenance cost; automating a broken process can lock it in."],
    ["product_feature", "Add or change a product capability", `Give users a new or improved capability that addresses “${p}” directly.`, "Highest cost. Test demand and usability before committing."],
  ] as const;
  return {
    kind: "concepts", mode: "demo", title: "Alternative approaches to consider (demo templates)",
    summary: "Six distinct intervention types. They are prompts, not recommendations; AI or automation is one option among several.",
    items: t.map(([interventionType, title, description, tradeoffs]) => ({ title, description, interventionType, tradeoffs, opportunityId: opp?.id })),
    edges: [], notes: {}, assumptions: ["The opportunity is understood well enough to consider responses."],
    uncertainties: ["Templates are generic. Whether any fits depends on the cause, which may not be established."],
    followUps: ["Pick two or three that differ most and list what would have to be true for each."],
  };
}

export function demoAssumptions(ctx: Ctx): Proposal {
  const c = get<any>("SELECT * FROM solution_concepts WHERE id=? AND product_id=?", ctx.scope.targetId, ctx.productId);
  const n = c?.title ?? "this concept";
  const cat = [
    ["desirability", `The people affected want “${n}” enough to change how they work.`],
    ["usability", `People can understand and use “${n}” without help.`],
    ["feasibility", `We can build and operate “${n}” with the time and skills available.`],
    ["viability", `“${n}” moves the business outcome enough to justify its cost.`],
    ["operational_fit", `The organisation can adopt and sustain “${n}” alongside existing work.`],
  ] as const;
  return {
    kind: "assumptions", mode: "demo", title: "Assumptions to consider (demo templates)",
    summary: "One prompt per category. Keep only those that are consequential for this concept.",
    items: cat.map(([category, statement]) => ({ statement, category, importance: "unknown", conceptId: c?.id })),
    edges: [], notes: {}, assumptions: [], uncertainties: ["Importance and current support are left unknown for you to judge."], followUps: ["Rate importance, then design the cheapest test for the highest-importance, weakest-support assumption."],
  };
}

export function demoExperiment(ctx: Ctx): Proposal {
  const a = get<any>("SELECT * FROM assumptions WHERE id=? AND product_id=?", ctx.scope.targetId, ctx.productId);
  const cat = a?.category ?? "none";
  const method = ({ desirability: "concierge", usability: "prototype_test", feasibility: "pilot", viability: "interview", operational_fit: "pilot", none: "interview" } as Record<string, string>)[cat] as any;
  return {
    kind: "experiment", mode: "demo", title: "Low-cost test outline (demo template)",
    summary: "A starting outline. The success criterion is deliberately left for you to define before running.",
    items: [{
      title: `Test: ${(a?.statement ?? "assumption").slice(0, 70)}`,
      hypothesis: `If ${a?.statement?.replace(/\.$/, "") ?? "the assumption holds"}, then we expect to observe behaviour that confirms it.`,
      method, target: "Define who (and how many) before recruiting.", successCriterion: "", assumptionIds: a ? [a.id] : [],
    }],
    edges: [], notes: {}, assumptions: [], uncertainties: ["Sample size and threshold are unspecified; a test without a pre-set criterion cannot be interpreted honestly."],
    followUps: ["Write the success criterion, then lock it before you run the test."],
  };
}

export function demoChallenge(ctx: Ctx): Proposal {
  const type = (ctx.scope.targetType as "finding" | "opportunity") ?? "finding";
  const id = ctx.scope.targetId!;
  const alt: string[] = [], missing: string[] = [], change: string[] = [];
  let tooBroad = "";
  if (type === "finding") {
    const f = get<any>("SELECT * FROM findings WHERE id=? AND product_id=?", id, ctx.productId);
    const s = findingStrength(id);
    if (s.independent < 2) missing.push(`Only ${s.independent} independent voice supports this. Find at least one more.`);
    if (!s.contradicting) missing.push("No contradicting excerpt has been sought. Look for people who behave or feel differently.");
    if (s.segments.length <= 1) missing.push(`Evidence covers ${s.segments.length ? `one segment (${s.segments[0]})` : "no recorded segment"}. Check other segments.`);
    alt.push("The behaviour may be a symptom of an earlier problem (for example missing information upstream).", "People with this experience may be over-represented in who agreed to be interviewed.", "The pain may be tolerated and not actually change what people do.");
    change.push("Observed behaviour that contradicts what people said.", "A segment with the same conditions that does not report this.");
    if ((f?.statement ?? "").length > 160) tooBroad = "The statement is long and may combine several claims. Consider splitting it.";
  } else {
    const o = get<any>("SELECT * FROM opportunities WHERE id=? AND product_id=?", id, ctx.productId);
    if (!o?.frequency) missing.push("How often this happens is not stated.");
    if (!o?.severity) missing.push("How severe it is when it happens is not stated.");
    if (!o?.segment) missing.push("The affected segment is not named.");
    alt.push("This may be a symptom; ask what happens just before it.", "The cause may sit in another team's process rather than in this product.");
    change.push("Evidence that few people are affected or that the impact is minor.");
    if ((o?.problem ?? "").split(/\s+/).length > 40 || /\band\b.*\band\b/.test(o?.title ?? "")) tooBroad = "The problem may bundle several problems. Try one sentence about one user in one situation.";
  }
  return {
    kind: "challenge", mode: "demo", title: `Challenge this ${type} (demo checklist)`,
    summary: "A checklist derived from the record's own gaps plus general alternative explanations. It is not an analysis of your evidence.",
    items: [{ targetType: type, targetId: id, alternativeExplanations: alt, missingEvidence: missing, evidenceThatWouldChangeView: change, tooBroad }],
    edges: [], notes: {}, assumptions: [], uncertainties: ["Alternative explanations are generic prompts."], followUps: ["Pick one alternative explanation and decide what evidence would separate it from the current view."],
  };
}

export function demoProposal(kind: Kind, ctx: Ctx): Proposal {
  switch (kind) {
    case "synthesis": return demoSynthesis(ctx);
    case "process_draft": return demoProcessDraft(ctx);
    case "opportunities": return demoOpportunities(ctx);
    case "concepts": return demoConcepts(ctx);
    case "assumptions": return demoAssumptions(ctx);
    case "experiment": return demoExperiment(ctx);
    case "challenge": return demoChallenge(ctx);
  }
}

// ---------- discovery plan (initiative creation) ----------
export type Plan = {
  mode: "demo" | "live"; refinedQuestion: string; known: string[]; unknowns: string[]; firstActivity: string; evidenceToCollect: string[];
};
export function demoPlan(i: { question: string; affected: string; outcome: string; decision: string; constraints: string; mode: string }): Plan {
  const q = i.question.trim().replace(/\?*$/, "?");
  const parts = [q];
  const ctxBits = [i.affected && `for ${i.affected}`, i.outcome && `so that ${i.outcome}`, i.decision && `to inform: ${i.decision}`].filter(Boolean);
  const refined = ctxBits.length ? `${q.replace(/\?$/, "")} — ${ctxBits.join(", ")}?` : parts[0];
  const lower = q.toLowerCase();
  const known = [i.affected && `Affected: ${i.affected}`, i.outcome && `Outcome that matters: ${i.outcome}`, i.decision && `Decision to inform: ${i.decision}`, i.constraints && `Constraints: ${i.constraints}`].filter(Boolean) as string[];
  const unknowns = [
    !i.affected && "Who exactly is affected, and whether all segments experience it the same way.",
    !i.outcome && "Which outcome would tell us the problem is solved.",
    !i.decision && "What decision this work should inform, and by when.",
    "How often this happens and how severe it is.",
    /\bwhy\b/.test(lower) ? "What is causing it (causes stay hypotheses until tested)." : "What people do today to cope with it.",
  ].filter(Boolean) as string[];
  const ev = [/long|slow|delay|time|takes|days|weeks/.test(lower) && "An event log or timestamps showing how long each stage takes (CSV).",
    "3–5 conversations with people who experienced it recently (notes or transcripts).",
    /process|workflow|handoff|onboard|approval/.test(lower) && "A process document, or a walkthrough with someone who does the work.",
    "Any support tickets, survey responses or feedback that mention it."].filter(Boolean) as string[];
  const first = i.mode === "process" ? "Sketch the current process as you understand it, then mark which steps you have evidence for."
    : i.mode === "evidence" ? "Add your evidence, then run a synthesis to see candidate themes."
    : "Add the evidence you already have (even rough notes), then look for what is missing.";
  return { mode: "demo", refinedQuestion: refined, known, unknowns, firstActivity: first, evidenceToCollect: ev };
}
