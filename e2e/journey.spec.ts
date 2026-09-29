import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const NOTES = "P1: The onboarding checklist was confusing and I did not know what to send.\nP1: I waited three weeks for an answer and nobody told me anything.\nP2: The forms were unclear and I was not sure which documents mattered.";

async function select(page: Page, needle: string) {
  const ok = await page.evaluate((text) => {
    const el = document.querySelector('[aria-label^="Source text"]')!;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n: Node | null;
    while ((n = w.nextNode())) { const i = n.textContent!.indexOf(text); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); return true; } }
    return false;
  }, needle);
  expect(ok).toBe(true);
}

test.describe.serial("core discovery journey (Slice 1 & 2)", () => {
  let base = "";
  test("question → plan → evidence → supported finding → opportunity → experiment → decision → brief", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What are you trying to understand?" })).toBeVisible();
    await expect(page.getByText("AI: demo mode")).toBeVisible();
    // first use: a product needs only a name
    await page.getByLabel("In product").selectOption("__new");
    await page.getByLabel("Product name").fill("Client Portal");
    await page.getByLabel("Discovery question").fill("Why do clients wait so long?");
    await page.getByRole("button", { name: /Start with a question/ }).click();
    await expect(page.getByRole("heading", { name: "Start with a question" })).toBeVisible();
    await page.getByRole("button", { name: /Create and draft a plan/ }).click();
    // overview: refined question is a proposal, original kept
    await expect(page.getByRole("heading", { name: "Discovery plan" })).toBeVisible();
    await expect(page.getByText("Template draft (demo mode)")).toBeVisible();
    await expect(page.getByText("Suggested next action")).toBeVisible();
    base = new URL(page.url()).pathname;
    await expect(page.getByText("Why do clients wait so long?").first()).toBeVisible();

    // add evidence by pasting
    await page.goto(`${base}/evidence?add=1`);
    await page.getByLabel("Title", { exact: true }).fill("Client interviews");
    await page.getByLabel("Participant or stakeholder label").fill("P1");
    await page.getByLabel("Segment").fill("Clients");
    await page.getByLabel("Content").fill(NOTES);
    await page.getByRole("button", { name: "Save evidence" }).click();
    await expect(page.getByRole("heading", { name: "Client interviews" })).toBeVisible();

    // highlight → new finding from selection
    await select(page, "I waited three weeks for an answer");
    await page.getByRole("button", { name: "New finding from this" }).click();
    await page.getByLabel(/What does this tell us/).fill("Clients wait weeks without updates");
    await page.getByRole("button", { name: "Create finding" }).click();
    await expect(page.getByText("Derived from this source")).toBeVisible();
    await expect(page.locator("aside").getByText(/supports: Clients wait weeks/)).toBeVisible();

    // finding is weak (one voice) and says why
    await page.goto(`${base}/evidence?tab=findings`);
    await expect(page.getByText(/Weak evidence · 1 excerpt/)).toBeVisible();
    await page.getByRole("link", { name: /Clients wait weeks/ }).click();
    await expect(page.getByText(/A single voice is an anecdote/)).toBeVisible();
    // evidence link resolves to the exact source text
    await page.getByRole("link", { name: "Client interviews" }).first().click();
    await expect(page.locator("mark.hl").first()).toHaveText("I waited three weeks for an answer");

    // survives a reload
    await page.reload();
    await expect(page.locator("mark.hl").first()).toHaveText("I waited three weeks for an answer");

    // opportunity linked to the finding
    await page.goto(`${base}/explore?new=opportunity`);
    await page.getByLabel("Short name").fill("Tell clients where they are in the process");
    await page.getByLabel("Problem statement").fill("Clients get no status updates and assume nothing is happening.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("No linked finding").first()).toBeVisible();
    await page.getByLabel("Link a finding…").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByText("Weak evidence").first()).toBeVisible();

    // concept → assumption → experiment
    await page.getByRole("button", { name: "Add concept" }).click();
    await page.getByLabel("Concept", { exact: true }).fill("Status emails at each stage");
    await page.getByLabel("Kind of intervention").selectOption("information");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Add assumption" }).click();
    await page.getByLabel("What must be true?").fill("Clients read status emails.");
    await page.getByLabel("How consequential if wrong?").selectOption("high");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.goto(`${base}/validate`);
    await expect(page.getByText("Consequential and weakly supported")).toBeVisible();
    await page.getByRole("link", { name: "Clients read status emails." }).click();
    await page.getByRole("button", { name: "Test this assumption" }).last().click();
    await page.getByLabel("Name", { exact: true }).fill("Email prototype test");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // cannot start without a success criterion; results need one too
    await expect(page.getByText(/Define a success criterion before you start/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Start experiment/ })).toBeDisabled();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel(/Success criterion/).fill("At least 3 of 5 open the email.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: /Start experiment/ }).click();
    await expect(page.getByText("Criterion locked")).toBeVisible();
    await page.getByLabel("Results", { exact: true }).fill("1 of 5 opened the email.");
    await page.getByLabel("Against the criterion:").selectOption("refuted");
    await page.getByRole("button", { name: "Save results" }).click();
    await expect(page.getByText("Needs interpretation").first()).toBeVisible();
    await page.getByLabel("Interpretation", { exact: true }).fill("Email alone does not reach clients.");
    await page.getByRole("button", { name: "Save interpretation" }).click();

    // record a decision that cites evidence
    await page.goto(`${base}/decide?new=decision`);
    await page.getByLabel("Decision", { exact: true }).fill("Pause status emails; try SMS.");
    await page.getByLabel("Rationale").fill("The email test failed its pre-set criterion.");
    await page.getByRole("checkbox", { name: /Clients wait weeks/ }).check();
    await page.getByRole("checkbox", { name: /Email prototype test/ }).check();
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByText("Evidence trail")).toBeVisible();
    await expect(page.getByText(/Client interviews/).first()).toBeVisible();

    // brief contains the story; markdown export downloads
    await page.goto(`${base}/brief`);
    await expect(page.getByRole("heading", { name: "Clients wait weeks without updates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pause status emails; try SMS\./ })).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download Markdown" }).click()]);
    const md = fs.readFileSync(await dl.path(), "utf8");
    for (const t of ["Why do clients wait so long?", "Clients wait weeks without updates", "I waited three weeks for an answer", "Email prototype test", "Pause status emails; try SMS.", "refuted"]) expect(md).toContain(t);
    await page.goto(`${base}/brief/print`);
    await expect(page.getByRole("heading", { name: /Discovery brief/ })).toBeVisible();
  });

  test("editing evidence flags the finding; unsupported uploads are explained", async ({ page }) => {
    await page.goto(`${base}/evidence`);
    await page.getByRole("link", { name: "Client interviews" }).click();
    await page.getByRole("button", { name: "Update content (new version)" }).click();
    await expect(page.getByText(/will be flagged for review/)).toBeVisible();
    await page.getByRole("textbox", { name: "Content" }).fill(NOTES.replace("nobody told me anything", "we heard nothing"));
    await page.getByRole("button", { name: /Save as v2/ }).click();
    await page.goto(base);
    await expect(page.getByText(/A finding needs review/)).toBeVisible();
    await page.goto(`${base}/evidence?add=1`);
    await page.getByRole("tab", { name: "Upload a file" }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await expect(page.getByText(/isn’t supported yet/)).toBeVisible();
    await expect(page.getByText(/pasted text, .txt, .md or .csv/)).toBeVisible();
  });
});
