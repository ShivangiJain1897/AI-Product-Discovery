import { describe, expect, it } from "vitest";
import { all, get, parse } from "@/lib/db";
import { cmd, fails, freshDb } from "./helpers";
import { readDocData, buildDocCtx } from "@/lib/docs";
import { getAnalysis } from "@/lib/analyses";
import { TEMPLATES, intakeStatus, docToMarkdown, isEmptyValue, type TableValue } from "@/lib/templates";
import { readiness } from "@/lib/catalog";
import { listAnalyses } from "@/lib/queries";
import { transport } from "@/lib/ai/live";

async function topic(items: string[] = ["questionnaire", "rca", "prd"], extra: any = {}) {
  freshDb();
  const { id: P } = await cmd("product.create", { name: "Chat Assistant", target_users: "Bank clients" });
  await cmd("product.update", { id: P, target_users: "Retail bank clients" });
  const { id: I } = await cmd("topic.create", { productId: P, type: "problem", text: "New clients wait weeks to be onboarded and we don't know why", items, ...extra });
  const A = (t: string) => get<any>("SELECT id FROM analyses WHERE initiative_id=? AND type=?", I, t)!.id as string;
  return { P, I, A };
}

describe("topics and planned work", () => {
  it("creates a topic with the chosen work, in order, and keeps the user's words", async () => {
    const { P, I } = await topic(["rca", "questionnaire"]);
    const i = get<any>("SELECT * FROM initiatives WHERE id=?", I)!;
    expect(i.topic_type).toBe("problem"); expect(i.topic_text).toBe("New clients wait weeks to be onboarded and we don't know why");
    expect(all<any>("SELECT type, plan_order FROM analyses WHERE initiative_id=? ORDER BY plan_order", I).map((a) => a.type)).toEqual(["rca", "questionnaire"]);
    expect((await fails("topic.create", { productId: P, type: "idea", text: "  " })).message).toMatch(/sentence/);
  });
  it("adding more work later skips unstarted duplicates and unknown items", async () => {
    const { P, I } = await topic(["rca"]);
    const r = await cmd("topic.addWork", { productId: P, initiativeId: I, items: ["rca", "journey_map", "nope"] });
    expect(r.created.length).toBe(1); expect(r.skipped).toEqual(["Root-cause analysis"]);
    expect(all<any>("SELECT type FROM analyses WHERE initiative_id=? ORDER BY plan_order", I).map((a) => a.type)).toEqual(["rca", "journey_map"]);
  });
  it("process work switches the process lens on; interview-only topics don't get it", async () => {
    const a = await topic(["rca"]); expect(get<any>("SELECT process_enabled p FROM initiatives WHERE id=?", a.I)!.p).toBe(0);
    const b = await topic(["event_log"]); expect(get<any>("SELECT process_enabled p FROM initiatives WHERE id=?", b.I)!.p).toBe(1);
  });
  it("readiness says what a piece of work needs, without blocking it", () => {
    const none = { sources: 0, csv: 0, findings: 0, opportunities: 0, concepts: 0, assumptions: 0 };
    expect(readiness("event_log", none).state).toBe("needs"); expect(readiness("prd", none).state).toBe("better"); expect(readiness("questionnaire", none).state).toBe("ready");
    expect(readiness("event_log", { ...none, csv: 1 }).state).toBe("ready");
  });
});

describe("adaptive questions", () => {
  it("skips anything already known and only asks what is missing", async () => {
    const { P, I, A } = await topic(["research_plan"]);
    const a = getAnalysis(P, A("research_plan")); const ctx = buildDocCtx(P, a);
    const st = intakeStatus(TEMPLATES.research_plan, ctx);
    const by = Object.fromEntries(st.map((s) => [s.q.key, s]));
    expect(by.audience.needsAsking).toBe(false); expect(by.audience.prefilled).toBe("Retail bank clients");   // from the product
    expect(by.budget.needsAsking).toBe(true);
    expect(by.decision.needsAsking).toBe(true);
    await cmd("initiative.update", { productId: P, id: I, fields: { decision_to_inform: "Whether to fix onboarding first" } });
    const again = intakeStatus(TEMPLATES.research_plan, buildDocCtx(P, getAnalysis(P, A("research_plan"))));
    expect(again.find((s) => s.q.key === "decision")!.needsAsking).toBe(false);
    // the PRD needs no questions at all
    expect(TEMPLATES.prd.intake.length).toBe(0);
  });
});

describe("document workbench", () => {
  it("drafts, never overwrites a section you edited, and lets you adopt or keep the new draft", async () => {
    const { P, A } = await topic(["questionnaire"]);
    const id = A("questionnaire");
    const r1 = await cmd("analysis.run", { productId: P, id, answers: { format: "Interview guide", length: "Short (about 6 questions)" } });
    let d = readDocData(getAnalysis(P, id));
    const qs = d.sections.questions as TableValue; expect(qs.rows.length).toBe(6); expect(d.prov.questions).toBe("scaffold");
    expect(qs.rows.every((r) => !/\b(would you|do you like)\b/i.test(r[1]))).toBe(true);     // no leading questions in the starter bank
    // user edits one section
    await cmd("doc.saveSection", { productId: P, id, key: "intro", value: "My own opening." });
    expect(readDocData(getAnalysis(P, id)).prov.intro).toBe("you");
    const r2 = await cmd("analysis.run", { productId: P, id, answers: { length: "Medium (about 10)" } });
    d = readDocData(getAnalysis(P, id));
    expect(d.sections.intro).toBe("My own opening.");                        // preserved
    expect(d.pending.intro).toBe(r2.seq);                                     // new draft waiting
    expect((d.sections.questions as TableValue).rows.length).toBe(10);       // untouched sections refresh
    await cmd("doc.apply", { productId: P, id, seq: r2.seq, keys: ["intro"] });
    await cmd("doc.apply", { productId: P, id, seq: r2.seq, keys: ["intro"] });   // idempotent
    d = readDocData(getAnalysis(P, id));
    expect(d.sections.intro).not.toBe("My own opening."); expect(d.pending.intro).toBeUndefined();
    expect(all<any>("SELECT seq FROM analysis_runs WHERE analysis_id=?", id).length).toBe(2);          // history kept
    expect(r1.seq).toBe(1);
    await cmd("doc.saveSection", { productId: P, id, key: "closing", value: ["One", "Two"] });
    await cmd("analysis.run", { productId: P, id });
    await cmd("doc.keepMine", { productId: P, id, keys: ["closing"] });
    expect(readDocData(getAnalysis(P, id)).pending.closing).toBeUndefined();
  });
  it("scaffolds never invent market or competitor facts", async () => {
    const { P, A } = await topic(["market_analysis", "competitor_scan"]);
    await cmd("analysis.run", { productId: P, id: A("competitor_scan"), answers: { competitors: "Acme, Globex" } });
    const c = readDocData(getAnalysis(P, A("competitor_scan"))).sections.competitors as TableValue;
    expect(c.rows.map((r) => r[0])).toEqual(["Acme", "Globex"]); expect(c.rows.every((r) => r.slice(1).every((x) => x === ""))).toBe(true);
    await cmd("analysis.run", { productId: P, id: A("market_analysis") });
    const m = readDocData(getAnalysis(P, A("market_analysis")));
    expect(m.sections.summary).toMatch(/No market facts/); expect(isEmptyValue(m.sections.segments)).toBe(true);
  });
  it("market candidates are verbatim excerpts from selected sources", async () => {
    const { P, I, A } = await topic(["market_analysis"]);
    const S = (await cmd("source.create", { productId: P, initiativeId: I, title: "Analyst note", sourceType: "other", content: "Adoption of chat support grew across mid-size banks last year. The weather was nice on Tuesday afternoon." })).id;
    await cmd("analysis.setSources", { productId: P, id: A("market_analysis"), sourceIds: [S] });
    await cmd("analysis.run", { productId: P, id: A("market_analysis") });
    const trends = readDocData(getAnalysis(P, A("market_analysis"))).sections.trends as string[];
    expect(trends.length).toBe(1); expect(trends[0]).toContain("Adoption of chat support grew across mid-size banks last year.");
  });
  it("the PRD is assembled from real records with resolving references, and stale-flags when they change", async () => {
    const { P, I, A } = await topic(["prd"]);
    const S = (await cmd("source.create", { productId: P, initiativeId: I, title: "Interview", sourceType: "interview", participant: "P1", content: "I waited three weeks and nobody told me anything." })).id;
    const c = get<any>("SELECT content FROM sources WHERE id=?", S)!.content; const ex = (await cmd("excerpt.create", { productId: P, sourceId: S, start: 0, end: c.length })).id;
    const f = (await cmd("finding.create", { productId: P, initiativeId: I, statement: "Clients wait with no updates", excerpts: [{ id: ex }] })).id;
    const o = (await cmd("entity.create", { productId: P, initiativeId: I, type: "opportunity", data: { title: "Tell clients status", unknowns: "How many clients call to ask?" } })).id;
    const k = (await cmd("entity.create", { productId: P, initiativeId: I, type: "concept", data: { title: "Status emails", description: "Email at each stage" }, links: [{ type: "opportunity", id: o, relation: "addressed_by", direction: "in" }] })).id;
    await cmd("entity.create", { productId: P, initiativeId: I, type: "decision", data: { decision_type: "test", statement: "Test status emails" } });
    await cmd("analysis.run", { productId: P, id: A("prd") });
    const d = readDocData(getAnalysis(P, A("prd")));
    expect((d.sections.background as string[])[0]).toContain(`[[finding:${f}]]`);
    expect((d.sections.requirements as string[])[0]).toContain(`[[concept:${k}]]`);
    expect(d.sections.solution).toContain("Test status emails");
    expect(d.sections.risks as string[]).toEqual(expect.arrayContaining([expect.stringContaining("Weakly supported")]));
    const md = docToMarkdown(TEMPLATES.prd, "PRD", d.sections, (tok) => `(${tok.split(":")[0]})`);
    expect(md).toContain("## Background and evidence"); expect(md).toContain("(finding)"); expect(md).not.toContain("[[");
    expect(listAnalyses(P).find((x) => x.id === A("prd"))!.freshness.outdated).toBe(false);
    await cmd("entity.update", { productId: P, type: "finding", id: f, data: { statement: "Clients wait with no updates at all" } });
    const fr = listAnalyses(P).find((x) => x.id === A("prd"))!.freshness;
    expect(fr.outdated).toBe(true); expect(fr.reasons.join()).toMatch(/1 finding/);
  });
  it("RCA seeds hypotheses from your findings and labels every cause a hypothesis", async () => {
    const { P, I, A } = await topic(["rca"]);
    await cmd("finding.create", { productId: P, initiativeId: I, statement: "Documents are re-entered manually between two systems" });
    await cmd("analysis.run", { productId: P, id: A("rca"), answers: { symptom: "Onboarding takes 3 weeks" } });
    const d = readDocData(getAnalysis(P, A("rca")));
    expect(d.sections.problem).toContain("Onboarding takes 3 weeks");
    const h = d.sections.hypotheses as TableValue; expect(h.rows.every((r) => r[1] === "Hypothesis")).toBe(true);
    expect(h.rows.length).toBeGreaterThan(0); expect((d.sections.likely as string)).toBe("");
  });
  it("does not use records when the user turns that off", async () => {
    const { P, I, A } = await topic(["prd"]);
    await cmd("finding.create", { productId: P, initiativeId: I, statement: "Clients wait" });
    await cmd("doc.setRecords", { productId: P, id: A("prd"), useRecords: false });
    await cmd("analysis.run", { productId: P, id: A("prd") });
    expect(isEmptyValue(readDocData(getAnalysis(P, A("prd"))).sections.background)).toBe(true);
  });
  it("live mode strips unknown references and flags unverifiable citations", async () => {
    const { P, I, A } = await topic(["rca"]);
    const S = (await cmd("source.create", { productId: P, initiativeId: I, title: "Notes", sourceType: "interview", content: "Clients said the forms were unclear." })).id;
    await cmd("analysis.setSources", { productId: P, id: A("rca"), sourceIds: [S] });
    process.env.ANTHROPIC_API_KEY = "x"; const orig = transport.fetch;
    try {
      transport.fetch = async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ sections: { problem: "Forms are unclear [[finding:fnd_invented]]", whys: ["Why? → unclear forms"] }, citations: [{ sectionKey: "problem", sourceId: S, quote: "the forms were unclear" }, { sectionKey: "problem", sourceId: S, quote: "everyone hates us" }], uncertainties: ["u"] }) }] }), { status: 200 });
      await cmd("analysis.run", { productId: P, id: A("rca") });
    } finally { transport.fetch = orig; delete process.env.ANTHROPIC_API_KEY; }
    const d = readDocData(getAnalysis(P, A("rca")));
    expect(d.sections.problem).toBe("Forms are unclear "); expect(d.prov.problem).toBe("live");
    const run = parse<any>(get<any>("SELECT results FROM analysis_runs WHERE analysis_id=?", A("rca"))!.results, {});
    expect(run.detail.notes.join()).toMatch(/1 citation/); expect(run.summary.find((s: any) => s.label === "Produced by").value).toBe("Live model");
  });
});
