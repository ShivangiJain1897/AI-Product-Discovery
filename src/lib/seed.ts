import { all, get, run, tx } from "./db";
import { execute } from "./commands";
import { fmtDuration, pct, type Analysis } from "./eventlog";
import { A_INTERVIEWS, A_SOP, B_SOURCES } from "./seed-data";
import { createExcerpt, linkExcerptToFinding } from "./evidence";
import { link } from "./links";
import { insertNode, addEdge, upsertChange, saveScenario, loadMap, cloneAsFuture, updateNode, deleteNode, addNode, createMap } from "./process";
import type { EntityType } from "./types";

async function cmd<T = any>(action: string, args: Record<string, any>): Promise<T> {
  const r = await execute(action, args);
  if (!r.ok) throw new Error(`seed ${action}: ${r.error.message}`);
  return r.data as T;
}

export function demoLoaded() { return !!get("SELECT 1 x FROM products WHERE is_demo=1"); }

// ---------- deterministic synthetic event log ----------
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const TEAM: Record<string, string> = {
  "Application Received": "Sales", "Documents Requested": "Relationship Manager", "Documents Received": "Client", "Document Check": "Operations",
  "Missing Documents Chase": "Relationship Manager", "KYC Review": "Compliance", "Additional Info Request": "Compliance", "Account Setup": "Operations",
  "Welcome Call": "Relationship Manager", "Onboarding Complete": "Operations",
};
const HAPPY = ["Application Received", "Documents Requested", "Documents Received", "Document Check", "KYC Review", "Account Setup", "Welcome Call", "Onboarding Complete"];
const CHASE = ["Application Received", "Documents Requested", "Documents Received", "Document Check", "Missing Documents Chase", "Documents Received", "Document Check", "KYC Review", "Account Setup", "Welcome Call", "Onboarding Complete"];
const KYC2 = ["Application Received", "Documents Requested", "Documents Received", "Document Check", "KYC Review", "Additional Info Request", "KYC Review", "Account Setup", "Welcome Call", "Onboarding Complete"];
const BOTH = ["Application Received", "Documents Requested", "Documents Received", "Document Check", "Missing Documents Chase", "Documents Received", "Document Check", "KYC Review", "Additional Info Request", "KYC Review", "Account Setup", "Welcome Call", "Onboarding Complete"];
const NOCALL = ["Application Received", "Documents Requested", "Documents Received", "Document Check", "KYC Review", "Account Setup", "Onboarding Complete"];
const MEDIAN_H: Record<string, number> = {
  "Application Received>Documents Requested": 2, "Documents Requested>Documents Received": 60, "Documents Received>Document Check": 20,
  "Document Check>KYC Review": 30, "Document Check>Missing Documents Chase": 26, "Missing Documents Chase>Documents Received": 90,
  "KYC Review>Additional Info Request": 40, "Additional Info Request>KYC Review": 96, "KYC Review>Account Setup": 28,
  "Account Setup>Welcome Call": 48, "Welcome Call>Onboarding Complete": 6, "Account Setup>Onboarding Complete": 8,
};

export function generateEventLogCsv(nCases = 120) {
  const rnd = mulberry32(42);
  const norm = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const fmt = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  const start = Date.UTC(2025, 0, 6, 8, 0, 0);
  const rows: { ts: number; case: string; act: string; team: string }[] = [];
  for (let i = 0; i < nCases; i++) {
    const r = rnd();
    const seq = r < 0.4 ? HAPPY : r < 0.7 ? CHASE : r < 0.85 ? KYC2 : r < 0.95 ? BOTH : NOCALL;
    let t = start + Math.floor(i / 3) * 86400000 + Math.floor(rnd() * 8) * 3600000 + Math.floor(rnd() * 60) * 60000;
    const cid = `C${String(1001 + i)}`;
    seq.forEach((act, k) => {
      if (k > 0) { const med = MEDIAN_H[`${seq[k - 1]}>${act}`]; t += Math.round(med * Math.exp(0.5 * norm()) * 3600000 / 60000) * 60000; }
      rows.push({ ts: t, case: cid, act, team: TEAM[act] });
    });
  }
  rows.sort((a, b) => a.ts - b.ts || a.case.localeCompare(b.case));
  const lines = ["case_id,activity,timestamp,team"];
  const out = rows.map((r) => `${r.case},${r.act},${fmt(r.ts)},${r.team}`);
  // Deliberate data-quality issues so the validation step has something honest to show:
  out.splice(30, 0, out[29], out[50 + 1]);          // two exact duplicates (of rows 30 and 52)
  out.splice(200, 0, out[199]);                      // a third duplicate
  out.splice(90, 0, `${rows[80].case},Status Note Added,TBD,Operations`, `${rows[140].case},Status Note Added,,Operations`); // unparseable + missing timestamp
  out.push("C9999,Application Received,2025-03-01 09:00:00,Sales"); // one single-event case
  return lines.concat(out).join("\n") + "\n";
}

// ---------- helpers ----------
async function addSource(productId: string, initiativeId: string | null, s: { title: string; type: string; participant?: string; segment?: string; date?: string; content: string; filename?: string; tags?: string[] }) {
  const r = await cmd("source.create", { productId, initiativeId, title: s.title, sourceType: s.type, participant: s.participant ?? "", segment: s.segment ?? "", date: s.date, content: s.content, filename: s.filename, tags: s.tags ?? [] });
  run("UPDATE sources SET synthetic=1, is_demo=1 WHERE id=?", r.id);
  return r.id as string;
}
function ex(productId: string, sourceId: string, needle: string) {
  const s = get<any>("SELECT content FROM sources WHERE id=?", sourceId)!;
  const i = s.content.indexOf(needle);
  if (i < 0) throw new Error(`seed: excerpt not found: ${needle}`);
  return createExcerpt(productId, sourceId, i, i + needle.length);
}

export async function loadDemos() {
  if (demoLoaded()) return { skipped: true };
  const saved = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; // seed always uses deterministic demo mode
  try {
    await seedA();
    await seedB();
  } finally { if (saved) process.env.ANTHROPIC_API_KEY = saved; }
  run("UPDATE products SET is_demo=1 WHERE id IN (SELECT DISTINCT product_id FROM initiatives WHERE is_demo=1)");
  return { skipped: false };
}

// =====================================================================================
// Demo A — client onboarding (process-enabled)
// =====================================================================================
async function seedA() {
  const { id: P } = await cmd("product.create", { name: "Client Onboarding Service", description: "How new business clients are onboarded: application through to an active account. Demo product with synthetic data." });
  await cmd("product.update", { id: P, lifecycle: "live", target_users: "New small and mid-market business clients; relationship managers, operations analysts and compliance reviewers who onboard them.", objectives: "Shorten and de-risk client onboarding without weakening compliance controls.", context: "Regulated financial services. Three teams touch every case. All content in this demo is synthetic." });
  run("UPDATE products SET is_demo=1 WHERE id=?", P);

  const { id: I } = await cmd("initiative.create", {
    productId: P, title: "Why does client onboarding take so long?", mode: "process",
    question: "Why does client onboarding take so long, and where does avoidable work happen?",
    affected: "New business clients, relationship managers, operations and compliance staff", outcome: "Onboarding completes faster and with fewer repeated requests",
    decision: "Which onboarding improvement to pilot first", constraints: "Compliance controls cannot be weakened. No new core-system integration this half-year.",
  });
  run("UPDATE initiatives SET is_demo=1 WHERE id=?", I.id ?? I);
  const iid = I as string;
  await cmd("initiative.refined", { productId: P, id: iid, action: "accept" });
  await cmd("initiative.update", { productId: P, id: iid, fields: { scope: "Application through to “Onboarding Complete” for business clients. Out of scope: account servicing after onboarding." } });

  const S: Record<string, string> = {};
  for (const s of A_INTERVIEWS) S[s.key] = await addSource(P, iid, { title: s.title, type: "interview", participant: s.participant, segment: s.segment, date: s.date, content: s.content, tags: ["onboarding", "synthetic"] });
  S.sop = await addSource(P, iid, { title: A_SOP.title, type: "process_doc", date: A_SOP.date, content: A_SOP.content, filename: "onboarding-sop.md", tags: ["process"] });
  const csv = generateEventLogCsv(120);
  S.log = await addSource(P, iid, { title: "Onboarding event log, Jan–Jun 2025 (synthetic)", type: "event_log", date: "2025-06-30", content: csv, filename: "onboarding-events.csv", tags: ["event-log", "synthetic"] });

  // --- event-log analysis (deterministic) ---
  const mapping = { caseId: "case_id", activity: "activity", timestamp: "timestamp", actor: "team" };
  const options = { endActivity: "Onboarding Complete", duplicates: "exclude", singleEventCases: "exclude", dateOrder: "mdy" };
  const elRun = await cmd("eventlog.run", { productId: P, sourceId: S.log, initiativeId: iid, title: "Where does onboarding time go?", question: "Which observed patterns in the onboarding log deserve a closer look?", mapping, options });
  const elRunRow = get<any>("SELECT results FROM analysis_runs WHERE id=?", elRun.runId)!;
  const res: Analysis = JSON.parse(elRunRow.results).detail;
  const chaseRepeat = res.repeats.find((r) => r.activity === "Document Check")!;
  const topGap = res.gaps.filter((g) => g.count >= 20)[0];
  const reqRecv = res.gaps.find((g) => g.from === "Documents Requested" && g.to === "Documents Received")!;
  const kycRepeat = res.repeats.find((r) => r.activity === "KYC Review")!;

  // --- findings from interviews (manual, traceable) ---
  const f1 = (await cmd("finding.create", { productId: P, initiativeId: iid, statement: "Clients are unsure which documents are acceptable, so they send the wrong or extra files and are asked again.", interpretation: "The request email lists document names but not examples of what counts, so clients guess.", limitations: "Two clients and one relationship manager. Clients were recent and self-selected; larger or corporate clients may differ.", followUp: "What proportion of document requests are repeated, and for which document types?", segment: "Clients",
    excerpts: [{ id: ex(P, S.cl1, "I was not sure whether a bank statement or a utility bill counted as proof of address"), relation: "supports" }, { id: ex(P, S.cl2, "I was not sure which documents were needed, so I uploaded everything I could find"), relation: "supports" }, { id: ex(P, S.rm1, "they are not sure which documents count as proof of address"), relation: "supports" }] })).id;
  const f2 = (await cmd("finding.create", { productId: P, initiativeId: iid, statement: "Operations re-checks documents and cases because there is no shared status showing what has already been reviewed.", interpretation: "Status lives in spreadsheets and inboxes, so each team re-establishes it.", limitations: "Two operations analysts; both report from their own role.", followUp: "How much of a typical analyst's day is spent re-checking?", segment: "Operations",
    excerpts: [{ id: ex(P, S.ops1, "nothing tells me the file was already reviewed. There is no single status I can trust"), relation: "supports" }, { id: ex(P, S.ops2, "Nobody owns the case end to end, so when a case stalls everyone assumes someone else is following up"), relation: "supports" }, { id: ex(P, S.cl1, "After I uploaded my files I had no idea what was happening"), relation: "supports" }] })).id;
  const f3 = (await cmd("finding.create", { productId: P, initiativeId: iid, statement: "Compliance sometimes needs extra source-of-funds information late in its review, which sends the case back to the client.", interpretation: "The application form does not collect source of funds, so the question surfaces only during KYC.", limitations: "A single compliance reviewer. Not corroborated by other interviews; the event log shows the pattern but not its cause.", followUp: "Which cases need it, and could it be known at application?", segment: "Compliance",
    excerpts: [{ id: ex(P, S.cmp1, "I discover, late in the review, that I need an additional explanation for the source of funds"), relation: "supports" }, { id: ex(P, S.rm1, "Honestly I think compliance is the bottleneck"), relation: "contradicts" }, { id: ex(P, S.ops2, "When the file is complete, their review usually takes a day"), relation: "contradicts" }] })).id;
  // --- findings from operational data (metric references preserved) ---
  const f4 = (await cmd("eventlog.derive", { productId: P, runId: elRun.runId, as: "finding", metric: "repeats", key: "Document Check", label: "Cases with a repeated Document Check", value: `${chaseRepeat.cases} of ${res.counts.cases} (${pct(chaseRepeat.share)})`,
    statement: `In the log, ${chaseRepeat.cases} of ${res.counts.cases} cases (${pct(chaseRepeat.share)}) contain more than one Document Check.`,
    interpretation: "This is consistent with documents being sent back and re-checked (finding on unclear requirements), but the log does not record why a case was re-checked.", limitations: "A repeated activity is a pattern to explain, not confirmed rework. Only recorded events are visible.", initiativeId: iid })).id;
  const f5 = (await cmd("eventlog.derive", { productId: P, runId: elRun.runId, as: "finding", metric: "transition_gap", key: `${reqRecv.from}→${reqRecv.to}`, label: `Median gap ${reqRecv.from} → ${reqRecv.to}`, value: fmtDuration(reqRecv.median),
    statement: `The recorded gap between “Documents Requested” and “Documents Received” has a median of ${fmtDuration(reqRecv.median)} (n=${reqRecv.count}), one of the longest between recorded steps.`,
    interpretation: "Much of the elapsed time sits on the client side of the process. The log cannot tell us whether clients were waiting, confused or simply busy.", limitations: "Elapsed time between events is not verified waiting time.", initiativeId: iid })).id;
  void topGap; void kycRepeat;

  // --- opportunities ---
  const o1 = (await cmd("entity.create", { productId: P, initiativeId: iid, type: "opportunity", data: { title: "Clients do not know what to submit, which triggers repeated document requests", problem: "Clients cannot tell which documents are acceptable, so files arrive wrong or incomplete and the case loops back through checking and chasing.", segment: "New business clients", context: "Between the document request email and the first Document Check", desired_outcome: "Most cases pass the first Document Check", frequency: `${chaseRepeat.cases} of ${res.counts.cases} logged cases (${pct(chaseRepeat.share)}) contain a repeated Document Check`, severity: "Adds a full loop of chasing and re-checking to the case", unknowns: "Why each case looped; whether unclear requirements or document quality is the main cause; how clients experience the delay." }, links: [{ type: "finding", id: f1, relation: "informs", direction: "in" }, { type: "finding", id: f4, relation: "informs", direction: "in" }, { type: "finding", id: f5, relation: "informs", direction: "in" }] })).id;
  const o2 = (await cmd("entity.create", { productId: P, initiativeId: iid, type: "opportunity", data: { title: "Nobody can see document and case status across teams", problem: "Each team keeps its own record of what has been checked or requested, so work is repeated and stalled cases go unnoticed.", segment: "Operations and relationship managers", context: "After documents are submitted", desired_outcome: "Anyone can see, in one place, what has been received and reviewed", frequency: "Reported by both operations analysts and one relationship manager", severity: "Re-checking and follow-up effort; clients left without updates", unknowns: "How much analyst time is spent re-checking; which system could host a shared status." }, links: [{ type: "finding", id: f2, relation: "informs", direction: "in" }] })).id;
  const o3 = (await cmd("entity.create", { productId: P, initiativeId: iid, type: "opportunity", data: { title: "Compliance questions arrive late and send cases back", problem: "Source-of-funds information is requested during KYC instead of at application.", segment: "Cases needing extra information", context: "During KYC review", desired_outcome: "Compliance has what it needs when the review starts", frequency: `${kycRepeat.cases} of ${res.counts.cases} logged cases (${pct(kycRepeat.share)}) contain more than one KYC Review`, severity: "Adds a client round-trip late in the process", unknowns: "Whether repeated KYC Review always means an information request; single-interview evidence only." }, links: [{ type: "finding", id: f3, relation: "informs", direction: "in" }] })).id;

  // --- solution concepts ---
  const mkC = async (o: string, d: any) => (await cmd("entity.create", { productId: P, initiativeId: iid, type: "concept", data: d, links: [{ type: "opportunity", id: o, relation: "addressed_by", direction: "in" }] })).id as string;
  const c1 = await mkC(o1, { title: "Document checklist with examples at application", description: "Show, at the moment of application and in the request email, exactly which documents are accepted, with examples.", intervention_type: "information", tradeoffs: "Cheap and reversible. Does not catch wrong files that are still submitted.", status: "preferred" });
  const c2 = await mkC(o1, { title: "Upload pre-check for completeness", description: "When a client uploads, check that every required document type is present and legible before the case enters operations.", intervention_type: "product_feature", tradeoffs: "Needs build effort; only checks presence and legibility, not validity." });
  const c3 = await mkC(o1, { title: "Accept certified digital copies as proof of address", description: "Relax the policy so more document types qualify, reducing rejections.", intervention_type: "policy", tradeoffs: "Fast to change if compliance agrees; must be reviewed for audit risk." });
  const c4 = await mkC(o2, { title: "Shared case status board", description: "One status per case and document visible to relationship managers, operations and the client.", intervention_type: "workflow", tradeoffs: "Depends on where the status of record lives." });
  const c5 = await mkC(o2, { title: "Automatic document classification", description: "Automatically classify uploaded documents and flag mismatches.", intervention_type: "automation", tradeoffs: "Compliance is concerned about audit risk from wrong passes; accuracy is unproven." });
  void c3; void c4; void o3;

  // --- assumptions ---
  const mkA = async (concept: string, d: any) => (await cmd("entity.create", { productId: P, initiativeId: iid, type: "assumption", data: d, links: [{ type: "concept", id: concept, relation: "relies_on", direction: "in" }] })).id as string;
  const a1 = await mkA(c1, { statement: "Clients re-submit documents mainly because they are unsure what is required, not because of carelessness.", category: "desirability", importance: "high", support: "weak", status: "testing" });
  const a2 = await mkA(c4, { statement: "Analysts re-check because status is invisible, not because they distrust each other's checks.", category: "operational_fit", importance: "high", support: "weak", status: "untested" });
  const a3 = await mkA(c5, { statement: "Document classification can be accurate enough that compliance accepts it without added manual review.", category: "feasibility", importance: "high", support: "unknown", status: "untested" });
  void a2;

  // --- experiment (completed) ---
  const e1 = (await cmd("entity.create", { productId: P, initiativeId: iid, type: "experiment", data: { title: "Checklist prototype test with recent clients", hypothesis: "If clients see a checklist with examples, they can identify the correct documents without help.", method: "prototype_test", target: "5 clients onboarded in the last 6 months (synthetic panel)", success_criterion: "At least 4 of 5 participants list every required document correctly without help." }, links: [{ type: "assumption", id: a1, relation: "tested_by", direction: "out" }, { type: "concept", id: c1, relation: "tested_by", direction: "out" }] })).id;
  await cmd("entity.update", { productId: P, type: "experiment", id: e1, data: { status: "completed", results: "4 of 5 participants listed every required document correctly. One participant omitted proof of address and said the example looked like a different document type.", interpretation: "The criterion was met, so a checklist with examples looks promising for clients who read it. The example for proof of address needs work.", limitations: "Five participants, recruited by relationship managers; all had already been through onboarding once, so they are not naive users.", next_action: "Improve the proof-of-address example, then pilot the checklist with new applicants.", outcome: "supported" } });
  await cmd("link.add", { productId: P, fromType: "experiment", fromId: e1, toType: "assumption", toId: a1, relation: "informs" });
  run("UPDATE assumptions SET status='testing' WHERE id=?", a1);

  // --- process: current-state map from the SOP ---
  const mapId = await buildCurrentMap(P, iid, S, [o1, o2, o3]);
  const fut = await buildFutures(P, iid, mapId, res, [o1, o2], [a1, a3]);
  void fut;

  // --- decision ---
  await cmd("entity.create", { productId: P, initiativeId: iid, type: "decision", data: { decision_type: "refine", statement: "Pilot the document checklist with examples first; do not automate document classification yet.", rationale: `The strongest evidence points to unclear requirements at the start (three independent voices, plus ${chaseRepeat.cases} of ${res.counts.cases} logged cases with a repeated Document Check). A checklist is cheap and the prototype test met its criterion. Automation depends on an assumption nobody has tested and on compliance's audit concern.`, alternatives: "Automate document classification now; build a shared status board first; do nothing until more data.", risks: "The source-of-funds finding rests on one compliance reviewer and remains uncorroborated. The prototype panel had prior experience of onboarding. The log shows repeats, not their cause.", expected_outcome: "Fewer cases looping back through Document Check after the pilot.", next_action: "Fix the proof-of-address example, define how pilot cases will be compared, then run the pilot." },
    links: [{ type: "finding", id: f1, relation: "informs", direction: "in" }, { type: "finding", id: f4, relation: "informs", direction: "in" }, { type: "opportunity", id: o1, relation: "informs", direction: "in" }, { type: "experiment", id: e1, relation: "informs", direction: "in" }, { type: "analysis_run", id: elRun.runId, relation: "informs", direction: "in" }] });

  // --- other analyses ---
  await cmd("analysis.create", { productId: P, initiativeId: iid, type: "research_synthesis", title: "Interview synthesis: onboarding pain points", question: "What do clients and staff report about onboarding?", scope: "initiative" });
  const synth = get<any>("SELECT id FROM analyses WHERE title LIKE 'Interview synthesis%'")!;
  await cmd("analysis.run", { productId: P, id: synth.id });
  const oa = await cmd("analysis.create", { productId: P, initiativeId: iid, type: "opportunity_analysis", title: "Which onboarding opportunity first?", question: "Which opportunities deserve attention, given what we know?" });
  // scoring: unknown values remain unknown
  await cmd("opportunity.scores", { productId: P, id: o1, scores: { impact: 4, evidence: 4, effort: 2, strategic: 4 } });
  await cmd("opportunity.scores", { productId: P, id: o2, scores: { impact: 3, evidence: 3, effort: null, strategic: 3 } });
  await cmd("opportunity.scores", { productId: P, id: o3, scores: { impact: 3, evidence: 1, effort: null, strategic: null } });
  await cmd("analysis.run", { productId: P, id: oa.id });
  const aa = await cmd("analysis.create", { productId: P, initiativeId: iid, type: "assumption_analysis", title: "What must be true before we invest?", question: "Which assumptions are consequential and weakly supported?" });
  await cmd("analysis.run", { productId: P, id: aa.id });
  const fs = get<any>("SELECT id FROM process_maps WHERE kind='future' AND name LIKE 'Checklist%'")!;
  const fa = await cmd("analysis.create", { productId: P, initiativeId: iid, type: "future_state", title: "Current state vs checklist proposal", question: "What would change in the process if we adopt the checklist proposal?" });
  await cmd("analysis.update", { productId: P, id: fa.id, fields: { data: { mapId: fs.id } } });
  await cmd("analysis.run", { productId: P, id: fa.id });
  // standalone (no initiative) analysis at product level
  const pa = await cmd("analysis.create", { productId: P, type: "problem_analysis", title: "Why do clients go quiet after submitting documents?", question: "What might explain the long gap between documents requested and received?" });
  await cmd("analysis.update", { productId: P, id: pa.id, fields: { data: { problem: "Clients take a median of several days to return requested documents, and we do not know why.", context: "After the document request email; before the first Document Check.", symptoms: "Long recorded gaps; repeated chasing emails.", causes: [{ text: "Clients are unsure which documents to send and delay while they find out", status: "hypothesis", evidence: "Suggested by two client interviews; not tested." }, { text: "Clients are slow because the upload link is hard to find", status: "hypothesis", evidence: "No evidence yet." }, { text: "Relationship managers send the request late", status: "ruled_out", evidence: "Log shows requests sent within hours of application." }], alternatives: "The delay may be normal client behaviour for this segment." }, notes: "Causes stay hypotheses until tested." } });
  await cmd("analysis.saveRevision", { productId: P, id: pa.id, note: "First framing" });

  // --- extra initiatives to show a multi-initiative product ---
  const p2 = await cmd("initiative.create", { productId: P, title: "Understand application abandonment", question: "Why do some applicants never submit their documents?", mode: "question" });
  await cmd("initiative.setStatus", { productId: P, id: p2.id, status: "paused" });
  run("UPDATE initiatives SET is_demo=1 WHERE id=?", p2.id);
  const p3 = await cmd("initiative.create", { productId: P, title: "Evaluate AI-assisted document review", question: "Is AI-assisted document review worth pursuing for onboarding?", mode: "evidence", decision: "Whether to invest in document automation" });
  run("UPDATE initiatives SET is_demo=1 WHERE id=?", p3.id);
  await cmd("source.linkInitiative", { productId: P, initiativeId: p3.id, sourceId: S.cmp1, linked: true });
  await cmd("source.linkInitiative", { productId: P, initiativeId: p3.id, sourceId: S.ops1, linked: true });
  await cmd("entity.create", { productId: P, initiativeId: p3.id, type: "decision", data: { decision_type: "pause", statement: "Pause AI-assisted document review until the checklist pilot shows how many document problems remain.", rationale: "Compliance raised audit risk and accuracy is unproven. Fixing unclear requirements may remove much of the problem cheaply.", alternatives: "Run a classification pilot now.", risks: "Assumption about classification accuracy is untested.", next_action: "Revisit after the checklist pilot." }, links: [{ type: "assumption", id: a3, relation: "informs", direction: "in" }, { type: "concept", id: c5, relation: "informs", direction: "in" }] });
  await cmd("initiative.setStatus", { productId: P, id: p3.id, status: "completed" });

  // brief narrative to show manual editing coexisting with generated records
  await cmd("brief.saveNarrative", { productId: P, initiativeId: iid, key: "decision", narrative: "We are choosing the cheapest change that addresses the strongest evidence, and deliberately deferring automation." });
}

async function buildCurrentMap(P: string, iid: string, S: Record<string, string>, opps: string[]) {
  const id = createMap(P, { name: "Current state — client onboarding", kind: "current", initiativeId: iid, blank: false, description: "Built from the SOP and interviews. Steps marked “inferred” are not in the SOP and need confirmation." });
  const N = (name: string, type: any, actor: string, x: number, y: number, extra: any = {}) => insertNode(id, { name, type, actor, x, y, provenance: "evidence", ...extra });
  const sopIdx = (needle: string) => ex(P, S.sop, needle);
  const start = N("Application received", "activity", "Sales", 0, 100, { system: "CRM", description: "Application is logged in the CRM." });
  const req = N("Send document request", "activity", "Relationship manager", 240, 100, { system: "Email", outputs: "Document request email", pain_points: "Email lists document names but not examples of what is accepted." });
  const sub = N("Submit documents", "activity", "Client", 480, 100, { system: "Upload portal", timing: "Recorded median gap after request: several days (see event log)", pain_points: "Clients unsure what counts as proof of address; no acknowledgement after upload." });
  const chk = N("Check documents", "activity", "Operations", 720, 100, { system: "Checklist spreadsheet", pain_points: "Checklist varies by client type; no shared record of what has been reviewed." });
  const dec = N("Documents complete and valid?", "decision", "Operations", 960, 100);
  const chase = N("Chase for missing documents", "activity", "Relationship manager", 960, 300, { pain_points: "Manual chasing by email; tracked in personal spreadsheets." });
  const kyc = N("KYC and source-of-funds review", "activity", "Compliance", 1200, 100, { timing: "About a day when the file is complete (compliance and operations interviews)" });
  const more = N("Request additional information", "activity", "Compliance", 1200, 300, { provenance: "inferred", description: "SOP mentions it; how the request reaches the client is not documented.", pain_points: "Raised late in the review; the form does not collect source of funds." });
  const setup = N("Set up account", "activity", "Operations", 1440, 100, { system: "Core system", pain_points: "Details re-entered manually from documents." });
  const call = N("Welcome call", "activity", "Relationship manager", 1680, 100);
  const done = N("Mark onboarding complete", "activity", "Operations", 1920, 100);
  const link_ = (a: any, b: any, label = "") => addEdge(P, id, a.stable_id, b.stable_id, label);
  link_(start, req); link_(req, sub); link_(sub, chk); link_(chk, dec); link_(dec, kyc, "Yes"); link_(dec, chase, "No"); link_(chase, sub, "Return to submit");
  link_(kyc, setup, "Complete"); link_(kyc, more, "Needs information"); link_(more, kyc, "Repeat review"); link_(setup, call); link_(call, done);
  // evidence links
  const supports = (node: any, exc: string) => link(P, ["excerpt", exc], ["process_node", node.id], "supports");
  supports(start, sopIdx("[Sales] Application received and logged in the CRM.")); supports(req, sopIdx("[Relationship manager] Send the document request email to the client."));
  supports(sub, sopIdx("[Client] Submit identity and address documents through the upload link.")); supports(chk, sopIdx("[Operations] Check the documents against the checklist for the client type."));
  supports(chase, sopIdx("[Relationship manager] Chase the client for missing or unclear documents, then return to step 3.")); supports(kyc, sopIdx("[Compliance] Perform the KYC and source-of-funds review."));
  supports(more, sopIdx("[Compliance] Request additional information from the client if needed, then repeat step 7.")); supports(setup, sopIdx("[Operations] Set up the account in the core system."));
  supports(call, sopIdx("[Relationship manager] Hold the welcome call with the client.")); supports(done, sopIdx("[Operations] Mark onboarding complete."));
  supports(chase, ex(P, S.rm1, "I end up chasing clients by email two or three times per application")); supports(setup, ex(P, S.ops2, "I spend a lot of time re-entering details from the documents"));
  supports(sub, ex(P, S.cl1, "After I uploaded my files I had no idea what was happening"));
  // relate opportunities
  link(P, ["opportunity", opps[0]], ["process_node", sub.id], "relates_to"); link(P, ["opportunity", opps[0]], ["process_node", chk.id], "relates_to");
  link(P, ["opportunity", opps[1]], ["process_node", chk.id], "relates_to"); link(P, ["opportunity", opps[2]], ["process_node", more.id], "relates_to");
  return id;
}

async function buildFutures(P: string, iid: string, mapId: string, res: Analysis, oppIds: string[], asm: string[]) {
  // ---- Proposal 1: checklist + pre-check
  const f1 = cloneAsFuture(P, mapId, "Checklist and pre-check proposal");
  const m1 = loadMap(f1)!;
  const byName = (m: any, n: string) => m.nodes.find((x: any) => x.name === n)!;
  const list = addNode(P, f1, { name: "Client reviews document checklist with examples", type: "activity", actor: "Client", system: "Application form", x: 240, y: 260, provenance: "manual", description: "Shown at application and in the request email." });
  const pre = addNode(P, f1, { name: "Automated completeness pre-check on upload", type: "activity", actor: "Client", system: "Upload portal", x: 600, y: 260, provenance: "manual", description: "Checks that every required document type is present and legible before the case enters operations." });
  const sub = byName(m1, "Submit documents"), chk = byName(m1, "Check documents"), req = byName(m1, "Send document request"), chase = byName(m1, "Chase for missing documents"), dec = byName(m1, "Documents complete and valid?");
  // rewire: request -> checklist -> submit -> pre-check -> check
  const edges = loadMap(f1)!.edges;
  const del = (a: string, b: string) => { const e = edges.find((x) => x.source_stable_id === a && x.target_stable_id === b); if (e) run("DELETE FROM process_edges WHERE id=?", e.id); };
  del(req.stable_id, sub.stable_id); del(sub.stable_id, chk.stable_id);
  addEdge(P, f1, req.stable_id, list.stable_id); addEdge(P, f1, list.stable_id, sub.stable_id); addEdge(P, f1, sub.stable_id, pre.stable_id); addEdge(P, f1, pre.stable_id, chk.stable_id);
  upsertChange(P, f1, list.stable_id, { what: "Add a document checklist with examples before submission", why: "Clients do not know which documents are acceptable", addresses: "Opportunity: clients do not know what to submit", expected_outcome: "Fewer wrong or missing documents", dependencies: "Content owner in compliance; examples reviewed", risks: "Examples could go out of date; control: quarterly review", assumptions: "Clients read the checklist" });
  upsertChange(P, f1, pre.stable_id, { what: "Add an automated presence-and-legibility check on upload", why: "Catch missing documents before they reach operations", addresses: "Opportunity: clients do not know what to submit", expected_outcome: "Fewer loops through Document Check", dependencies: "Upload portal change", risks: "A check that passes something invalid; control: operations still performs the validity check", assumptions: "Presence and legibility can be checked reliably" });
  updateNode(P, f1, chase.stable_id, { actor: "Client", name: "Client fixes flagged documents" });
  upsertChange(P, f1, chase.stable_id, { what: "Move follow-up from manual chasing to the client at upload time", why: "Chasing by email is slow and tracked in spreadsheets", addresses: "Opportunity: clients do not know what to submit", expected_outcome: "Fewer manual chase emails", dependencies: "Pre-check feedback message", risks: "Clients ignore prompts; control: relationship manager escalation remains", assumptions: "Immediate feedback prompts correction" });
  void dec;
  // benefit scenario (estimate, never measured)
  const share = Math.round((res.repeats.find((r) => r.activity === "Document Check")?.share ?? 0) * 100) / 100;
  saveScenario(P, f1, { label: "Scenario: chase emails avoided per month", unit: "chase emails / month", formula: "cases_per_month * repeat_share * emails_per_loop * reduction",
    inputs: [
      { name: "cases_per_month", value: 20, unit: "cases", note: "Assumption entered by the PM — check against volume reporting" },
      { name: "repeat_share", value: share, unit: "share of cases", note: `From the event log: share of cases with a repeated Document Check (${res.counts.cases} cases)` },
      { name: "emails_per_loop", value: 2, unit: "emails", note: "Assumption from one interview (“two or three times”)" },
      { name: "reduction", value: 0.5, unit: "share avoided", note: "Pure assumption: half of loops avoided. Not measured." },
    ] });
  // ---- Proposal 2: shared status board
  const f2 = cloneAsFuture(P, mapId, "Shared status board proposal");
  const m2 = loadMap(f2)!;
  const board = addNode(P, f2, { name: "Update shared case status", type: "activity", actor: "Operations", system: "Status board", x: 720, y: 260, description: "Every document and case status is visible to all teams and the client." });
  const chk2 = byName(m2, "Check documents");
  addEdge(P, f2, chk2.stable_id, board.stable_id);
  updateNode(P, f2, byName(m2, "Chase for missing documents").stable_id, { actor: "Operations", name: "Chase for missing documents (from status board)" });
  upsertChange(P, f2, board.stable_id, { what: "Add a shared status record updated as documents are reviewed", why: "Nobody can see what has been reviewed or is outstanding", addresses: "Opportunity: nobody can see status across teams", expected_outcome: "Less re-checking and fewer client status calls", dependencies: "Decide where status of record lives", risks: "Status can drift from reality if not updated; control: status updates are part of the check step", assumptions: "Analysts re-check because status is invisible" });
  void oppIds; void asm; void deleteNode;
  return { f1, f2 };
}

// =====================================================================================
// Demo B — new-user activation (no process map)
// =====================================================================================
async function seedB() {
  const { id: P } = await cmd("product.create", { name: "Tandem Workspace", description: "A collaborative workspace for small teams and freelancers. Demo product with synthetic data." });
  await cmd("product.update", { id: P, lifecycle: "live", target_users: "Small design and consulting teams (admins and invited members) and solo freelancers.", objectives: "More new workspaces reach a first meaningful action in week one.", context: "Self-serve trial. All content in this demo is synthetic." });
  run("UPDATE products SET is_demo=1 WHERE id=?", P);
  const ini = await cmd("initiative.create", { productId: P, title: "Why do new users abandon product setup?", mode: "evidence", question: "Why do new users abandon setup in their first week, and does the reason differ by segment?", affected: "Team admins, invited members, solo freelancers", outcome: "More new workspaces reach a first meaningful action in week one", decision: "Which activation improvement to test before committing engineering capacity", constraints: "One squad for one quarter; no pricing changes." });
  const iid = ini.id as string; run("UPDATE initiatives SET is_demo=1 WHERE id=?", iid);
  await cmd("initiative.refined", { productId: P, id: iid, action: "accept" });
  const S: Record<string, string> = {};
  for (const s of B_SOURCES) S[s.key] = await addSource(P, iid, { title: s.title, type: s.type, participant: s.participant, segment: s.segment, date: s.date, content: s.content, tags: ["activation", "synthetic"] });

  const mkF = async (d: any) => (await cmd("finding.create", { productId: P, initiativeId: iid, ...d })).id as string;
  const g1 = await mkF({ statement: "Invited members do not understand why they were invited or what to do first, and many never return.", interpretation: "The invite explains neither purpose nor first step, so members treat it as optional.", limitations: "Two members and one admin report it; ticket themes agree but tickets are not independent counts.", followUp: "What share of invited members are inactive after day 7?", segment: "Invited members",
    excerpts: [{ id: ex(P, S.m1, "I was not sure why I needed it or what I was supposed to do first"), relation: "supports" }, { id: ex(P, S.m2, "The invitation email did not say what the tool was for"), relation: "supports" }, { id: ex(P, S.a3, "half the team accepted the invite and never came back"), relation: "supports" }, { id: ex(P, S.a1, "nobody knew what to do once they joined"), relation: "supports" }] });
  const g2 = await mkF({ statement: "Freelancers stall on the blank workspace because they cannot see what the tool is for or where to start.", interpretation: "The empty state gives no example, so value is invisible.", limitations: "Two freelancers only; both writers/designers. Other freelancer types untested.", followUp: "Do templates fix it if they are visible on the first screen?", segment: "Solo freelancers",
    excerpts: [{ id: ex(P, S.f1, "it was a blank page with no clue where to start"), relation: "supports" }, { id: ex(P, S.f2, "The blank workspace was confusing because there were no examples"), relation: "supports" }] });
  const g3 = await mkF({ statement: "Importing existing content is the main barrier to activation for team admins.", interpretation: "Failed or lossy imports leave admins with an empty workspace and a disengaged team.", limitations: "Two admins support this; a third admin contradicts it. The disagreement may reflect different source tools or content complexity — not yet explored.", followUp: "What content types and source tools do admins import, and how often does it fail?", segment: "Team admins",
    excerpts: [{ id: ex(P, S.a1, "The hardest part of setup was bringing our existing documents in"), relation: "supports" }, { id: ex(P, S.a2, "Importing our old files was painful"), relation: "supports" }, { id: ex(P, S.a3, "The import took two minutes and worked fine for us"), relation: "contradicts" }, { id: ex(P, S.tickets, "T-104 (admin): Imported pages lost their formatting and headers."), relation: "supports" }] });
  const g4 = await mkF({ statement: "Some admins would pay for someone to migrate their content for them.", interpretation: "The import tool is seen as a chore, not a feature.", limitations: "A single admin said this. Willingness to pay is a claim, not behaviour.", followUp: "Would other admins take a paid or assisted migration when offered?", segment: "Team admins", excerpts: [{ id: ex(P, S.a2, "I would happily pay someone to move the content for me"), relation: "supports" }] });

  const mkO = async (d: any, findings: string[]) => (await cmd("entity.create", { productId: P, initiativeId: iid, type: "opportunity", data: d, links: findings.map((f) => ({ type: "finding", id: f, relation: "informs", direction: "in" })) })).id as string;
  const o1 = await mkO({ title: "Invited members do not know their first step", problem: "Invited members arrive without knowing why they were invited or what to do first, and leave.", segment: "Invited members", context: "First session after accepting an invite", desired_outcome: "Invited members complete one meaningful action in their first session", frequency: "Reported by both members interviewed and one admin", severity: "Members abandon; admins' rollout stalls", unknowns: "Share of invited members who return; whether the cause is the invite, the workspace, or the admin's rollout." }, [g1]);
  const o2 = await mkO({ title: "Admins struggle to bring existing content in", problem: "Imports fail or lose formatting, leaving an empty workspace.", segment: "Team admins", context: "During initial setup", desired_outcome: "Admins finish setup with their key content in place", frequency: "Two of three admins; also two tickets", severity: "Some nearly abandoned the trial", unknowns: "Contradicted by one admin whose import worked. Which source tools and content types fail?" }, [g3, g4]);
  const o3 = await mkO({ title: "Freelancers cannot see what to build", problem: "The empty workspace gives freelancers no example, so value is invisible.", segment: "Solo freelancers", context: "First open", desired_outcome: "Freelancers start a first page from an example", frequency: "Both freelancers interviewed; two tickets", severity: "Stop within minutes", unknowns: "Only writers and designers heard from." }, [g2]);
  void o3;

  const mkC = async (o: string, d: any) => (await cmd("entity.create", { productId: P, initiativeId: iid, type: "concept", data: d, links: [{ type: "opportunity", id: o, relation: "addressed_by", direction: "in" }] })).id as string;
  const c1 = await mkC(o1, { title: "Guided first task for invited members", description: "On first open, show one concrete task tied to the team's workspace.", intervention_type: "product_feature", tradeoffs: "Needs design and build; must work for very different teams.", status: "preferred" });
  const c2 = await mkC(o1, { title: "Invite message that explains purpose and first step", description: "Let admins send a short, templated message saying why and what to do first.", intervention_type: "information", tradeoffs: "Cheap; depends on admins using it." });
  const c3 = await mkC(o1, { title: "Admin rollout checklist", description: "Give admins a short checklist for introducing the tool to their team.", intervention_type: "workflow", tradeoffs: "Addresses the cause at the admin, not the member." });
  const c4 = await mkC(o2, { title: "Assisted content migration (concierge)", description: "Offer to migrate a team's content by hand for early customers.", intervention_type: "process", tradeoffs: "Doesn't scale, but shows demand and failure modes cheaply." });
  const c5 = await mkC(o2, { title: "Import assistant that reports what failed", description: "Show which items failed to import and how to fix them.", intervention_type: "product_feature", tradeoffs: "Build effort; depends on understanding failures first." });
  void c2; void c3; void c5;

  const mkA = async (c: string, d: any) => (await cmd("entity.create", { productId: P, initiativeId: iid, type: "assumption", data: d, links: [{ type: "concept", id: c, relation: "relies_on", direction: "in" }] })).id as string;
  const a1 = await mkA(c1, { statement: "Invited members leave mainly because they do not know their first task.", category: "desirability", importance: "high", support: "weak", status: "testing" });
  const a2 = await mkA(c1, { statement: "A guided first task can be understood without help by people in different roles.", category: "usability", importance: "high", support: "unknown", status: "testing" });
  const a3 = await mkA(c4, { statement: "Assisted migration is affordable enough to offer to early customers.", category: "viability", importance: "medium", support: "unknown", status: "untested" });
  const a4 = await mkA(c1, { statement: "Admins will keep their own team rollout communication consistent with the guided task.", category: "operational_fit", importance: "high", support: "unknown", status: "untested" });
  void a3; void a4;

  const e1 = (await cmd("entity.create", { productId: P, initiativeId: iid, type: "experiment", data: { title: "Guided first-task prototype test", hypothesis: "If invited members see a guided first task, most will complete it without help.", method: "prototype_test", target: "6 people who were invited to a workspace in the last month (synthetic panel)", success_criterion: "At least 4 of 6 participants complete the first task unaided." }, links: [{ type: "assumption", id: a1, relation: "tested_by", direction: "out" }, { type: "assumption", id: a2, relation: "tested_by", direction: "out" }, { type: "concept", id: c1, relation: "tested_by", direction: "out" }] })).id;
  await cmd("entity.update", { productId: P, type: "experiment", id: e1, data: { status: "completed", results: "2 of 6 participants completed the first task unaided. Two participants hit a broken step in the prototype (a link that opened the wrong page) and could not continue. The other four all understood what the task was asking.", interpretation: "The pre-set criterion was not met, but the result is inconclusive rather than negative: two of the four failures are explained by a prototype defect, and one of the two successes was helped by a colleague sitting nearby. We cannot tell whether the concept works.", limitations: "Six participants; broken prototype step; uncontrolled help from colleagues; all recruited via the customer success team.", next_action: "Fix the prototype and rerun with a new panel before building anything.", outcome: "inconclusive" } });
  await cmd("entity.create", { productId: P, initiativeId: iid, type: "experiment", data: { title: "Concierge migration offer to five admins", hypothesis: "If offered assisted migration, at least some admins accept and complete setup.", method: "concierge", target: "5 team admins who started a trial and have an empty workspace", success_criterion: "At least 2 of 5 accept the offer and finish setup within a week." }, links: [{ type: "assumption", id: a3, relation: "tested_by", direction: "out" }, { type: "concept", id: c4, relation: "tested_by", direction: "out" }] });

  await cmd("entity.create", { productId: P, initiativeId: iid, type: "decision", data: { decision_type: "investigate", statement: "Do not build the guided first task yet. Fix the prototype and rerun the test; separately test assisted migration.", rationale: "The prototype test was inconclusive because of a prototype defect, not evidence against the concept. Three voices point to invited members not knowing their first step, so the direction is plausible, but the effect of a guided task is unproven.", alternatives: "Build the guided task now; ship only the invite message; do nothing.", risks: "The import finding is contradicted by one admin and is unresolved. The panel was recruited through customer success and may over-represent engaged users.", expected_outcome: "A clear pass or fail of the guided task on a working prototype.", next_action: "Fix the broken step, recruit six new participants, rerun with the same criterion." },
    links: [{ type: "finding", id: g1, relation: "informs", direction: "in" }, { type: "finding", id: g3, relation: "informs", direction: "in" }, { type: "experiment", id: e1, relation: "informs", direction: "in" }] });

  // analyses
  const syn = await cmd("analysis.create", { productId: P, initiativeId: iid, type: "research_synthesis", title: "Activation interviews: themes and contradictions", question: "What stops new users activating, by segment?", scope: "initiative" });
  await cmd("analysis.run", { productId: P, id: syn.id });
  const aa = await cmd("analysis.create", { productId: P, initiativeId: iid, type: "assumption_analysis", title: "Which activation assumptions need testing?", question: "Which assumptions are consequential and weakly supported?" });
  await cmd("analysis.run", { productId: P, id: aa.id });
  const ea = await cmd("analysis.create", { productId: P, initiativeId: iid, type: "experiment_analysis", title: "Interpret the guided first-task test", question: "What can we conclude from the prototype test?" });
  await cmd("analysis.update", { productId: P, id: ea.id, fields: { data: { experimentId: e1 } } });
  await cmd("analysis.run", { productId: P, id: ea.id });
  const ss = await cmd("initiative.create", { productId: P, title: "Explore team onboarding for agencies", question: "Do agencies need a different setup path than small teams?", mode: "question" });
  run("UPDATE initiatives SET is_demo=1 WHERE id=?", ss.id);
}

export const _types: EntityType | null = null;
export { linkExcerptToFinding, link, all, tx };
