import { expect, test, type Page } from "@playwright/test";

async function openInitiative(page: Page, product: string, title: string) {
  await page.goto("/");
  await page.getByRole("link", { name: product }).first().click();
  await page.getByRole("link", { name: "Topics", exact: true }).first().click();
  await page.locator("#main").getByRole("link", { name: title, exact: true }).click();
}

test.describe.serial("demo examples, products, analysis, process (Slices 3–5)", () => {
  test("load demos; products stay separate; demo AI is labelled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Load the two demo examples" }).first().click();
    await expect(page.getByRole("link", { name: "Client Onboarding Service" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Tandem Workspace" }).first()).toBeVisible();
    await page.getByRole("link", { name: "Client Onboarding Service" }).first().click();
    await page.getByRole("link", { name: "Knowledge" }).first().click();
    await page.getByRole("tab", { name: "Findings" }).click();
    await expect(page.getByText(/Clients are unsure which documents are acceptable/)).toBeVisible();
    await expect(page.getByText(/invited members/i)).toHaveCount(0);
    // switch product via the switcher
    await page.getByLabel(/Switch product/).click();
    await page.getByRole("link", { name: "Tandem Workspace" }).click();
    await page.getByRole("link", { name: "Knowledge" }).first().click();
    await page.getByRole("tab", { name: "Findings" }).click();
    await expect(page.getByText(/Invited members do not understand why/)).toBeVisible();
    await expect(page.getByText(/Clients are unsure which documents/)).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();
  });

  test("demo B: contradiction, untested critical assumption, inconclusive result — no process features", async ({ page }) => {
    await openInitiative(page, "Tandem Workspace", "Why do new users abandon product setup?");
    await expect(page.getByText(/Evidence disagrees with itself/)).toBeVisible();
    await expect(page.getByText(/A critical assumption is untested/)).toBeVisible();
    await page.getByRole("link", { name: "Validate" }).first().click();
    await expect(page.getByText("inconclusive").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore", exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Explore", exact: true }).first().click();
    await expect(page.getByRole("tab", { name: "Process", exact: true })).toHaveCount(0);   // process lens is optional, hidden here
  });

  test("AI proposal: preview → accept once (double-click) → persists", async ({ page }) => {
    await openInitiative(page, "Tandem Workspace", "Why do new users abandon product setup?");
    await page.getByRole("link", { name: "Evidence" }).first().click();
    await page.getByLabel(/Select Interview — Freelancer \(synthetic\)/).check();
    await page.getByRole("button", { name: /Analyze for themes/ }).click();
    const card = page.getByLabel("AI proposal preview").first();
    await expect(card.getByText("Demo sample — not a model response")).toBeVisible();
    await expect(card.getByText(/nothing is saved until you accept/)).toBeVisible();
    const before = await (await page.request.get(page.url().replace(/\/i\/.*/, "") + "/knowledge?tab=findings")).text();
    const btn = card.getByRole("button", { name: "Accept as finding" }).first();
    await btn.dblclick();
    await expect(card.getByText(/Accepted and saved/).first()).toBeVisible();
    await page.goto(page.url().split("?")[0] + "?tab=findings");
    const n = await page.getByText("Demo AI sample").count();
    expect(n).toBe(1);
    void before;
  });

  test("event-log analysis: deterministic metrics, definitions, data quality, derived finding keeps reference", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Client Onboarding Service" }).first().click();
    await page.getByRole("link", { name: "Outputs" }).first().click();
    await page.getByRole("link", { name: "Where does onboarding time go?" }).click();
    await expect(page.getByText("Cases", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("120", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/not a confirmed cycle time|Cases that never reach it are excluded/)).toBeVisible();
    await expect(page.getByText("What each metric means (and doesn’t)")).toBeVisible();
    await expect(page.getByText(/NOT verified waiting time/i).last()).toBeVisible();
    await expect(page.getByText(/6 excluded|6 of 1,132|1,126 of 1,132/)).toBeVisible();
    await page.getByRole("button", { name: "Keep this…" }).first().click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/keeps a reference to this dataset and metric/)).toBeVisible();
  });

  test("event-log import wizard validates malformed data honestly", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Client Onboarding Service" }).first().click();
    await page.getByRole("link", { name: "Knowledge" }).first().click();
    await page.getByRole("button", { name: "Add evidence" }).first().click();
    await page.getByRole("tab", { name: "Upload a file" }).click();
    const csv = ["case,event,when,who", "1,Start,2025-01-01 09:00,A", "1,Start,2025-01-01 09:00,A", "1,Review,2025-01-02 09:00,B", "2,Start,garbage,A", "2,Review,2025-01-03 09:00,B", "2,Done,2025-01-04 09:00,B", "3,Start,2025-01-05 09:00,A", ",Done,2025-01-06,A"].join("\n");
    await page.locator('input[type="file"]').setInputFiles({ name: "messy.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "Save evidence" }).click();
    await expect(page.getByRole("heading", { name: "Analyse an event log" })).toBeVisible();
    await page.getByLabel(/Case ID/).selectOption("case");
    await page.getByLabel(/Activity name/).selectOption("event");
    await page.getByLabel(/Event timestamp/).selectOption("when");
    await expect(page.getByRole("cell", { name: "Timestamp could not be parsed" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Missing a required value (case, activity or timestamp)" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Duplicate rows (same case, activity, time and actor)" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Cases with only one event" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open the analysis" })).toBeDisabled();
    await page.getByLabel(/I have reviewed the mapping/).check();
    await page.getByRole("button", { name: "Open the analysis" }).click();
    await expect(page.getByText("observed span", { exact: false }).first()).toBeVisible();
  });

  test("process map: edits persist; future state keeps baseline; comparison side by side", async ({ page }) => {
    await openInitiative(page, "Client Onboarding Service", "Why does client onboarding take so long?");
    await page.getByRole("link", { name: "Explore", exact: true }).first().click();
    await page.getByRole("tab", { name: "Process", exact: true }).click();
    await page.getByRole("link", { name: "Open map" }).first().click();
    await expect(page.getByLabel("Process map canvas")).toBeVisible();
    await page.getByRole("tab", { name: "Table" }).click();
    await page.getByRole("button", { name: "Add a step" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Send status update");
    await page.getByLabel("Owner (actor or team)").fill("Relationship manager");
    await page.getByRole("button", { name: "Save step" }).click();
    await page.reload();
    await page.getByRole("tab", { name: "Table" }).click();
    await expect(page.getByRole("button", { name: "Send status update" })).toBeVisible();
    // inferred step is labelled and can be confirmed
    await expect(page.getByText("Inferred").first()).toBeVisible();
    // propose a future state and compare; the original map keeps its own steps
    await page.getByRole("button", { name: "Propose a future state" }).click();
    await page.getByLabel("Proposal name").fill("E2E proposal");
    await page.getByRole("button", { name: "Create proposal" }).click();
    await page.getByRole("tab", { name: "Table" }).click();
    await page.getByRole("button", { name: "Send status update" }).click();
    await page.getByRole("button", { name: "Delete step" }).click().catch(() => {});
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete step" }).click();
    await page.getByRole("tab", { name: "Compare with current" }).click();
    await expect(page.getByText(/Baseline:/)).toBeVisible();
    await expect(page.getByText("removed", { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: /Current: Current state/ }).click();
    await page.getByRole("tab", { name: "Table" }).click();
    await expect(page.getByRole("button", { name: "Send status update" })).toBeVisible();
  });

  test("returning later: reopen a completed initiative", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Client Onboarding Service" }).first().click();
    await page.getByRole("link", { name: "Topics" }).first().click();
    await expect(page.getByRole("heading", { name: /Completed/ })).toBeVisible();
    await page.getByRole("button", { name: "Reopen for further discovery" }).click();
    await expect(page.getByRole("heading", { name: /Completed/ })).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByText(/Resume recent work/)).toBeVisible();
  });
});
