import { expect, test } from "@playwright/test";

test.describe.serial("idea → choose several things → work over time", () => {
  let topicUrl = "";
  test("start from an idea and plan three pieces of work at once", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("In product").selectOption("__new");
    await page.getByLabel("Product name").fill("Chat Assistant");
    await page.getByRole("radio", { name: "Idea" }).click();
    await page.getByLabel("Describe what you’re working on").fill("A chat assistant that answers clients’ onboarding questions");
    await page.getByRole("button", { name: /Continue/ }).click();
    // suggestions are offered but nothing is preselected
    await expect(page.getByText("Nothing selected yet")).toBeVisible();
    await page.getByRole("button", { name: /Select the 5 suggested for an idea/ }).click();
    await expect(page.getByText("5 selected")).toBeVisible();
    await page.getByRole("checkbox", { name: /Assumption map/ }).click();      // add one more by hand
    await page.getByRole("checkbox", { name: /Assumption map/ }).click();      // and remove it again
    await page.getByRole("checkbox", { name: /User journey map/ }).click();    // deselect a suggested one
    await expect(page.getByText("4 selected")).toBeVisible();
    // readiness is shown without blocking anything
    await expect(page.getByText("Better later").first()).toBeVisible();
    await page.getByRole("button", { name: /Plan my work \(4\)/ }).click();
    await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
    for (const t of ["User research plan", "Questionnaire / interview guide", "Market analysis", "Competitor scan"]) await expect(page.locator("#main").getByRole("link", { name: new RegExp("^" + t) })).toBeVisible();
    await expect(page.getByText("Not started").first()).toBeVisible();
    topicUrl = new URL(page.url()).pathname;
  });

  test("adaptive questions, a first draft, and edits that are never overwritten", async ({ page }) => {
    await page.goto(topicUrl);
    await page.locator("#main").getByRole("link", { name: /^Competitor scan/ }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Which competitors or alternatives/).fill("Acme, Globex");
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(page.getByText("Starter draft from your records").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "Acme" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Globex" })).toBeVisible();
    // nothing invented: the cited facts are left for the PM
    await expect(page.getByText(/Cells are empty on purpose/)).toBeVisible();
    // edit a section, regenerate, and confirm the edit survives with a choice offered
    await page.getByRole("button", { name: "Edit" }).nth(1).click();     // differentiators is empty → "Write"; edit gaps
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Write" }).first().click();
    await page.getByRole("textbox", { name: "Where we could differ" }).fill("Local support in every time zone");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Edited by you")).toBeVisible();
    await page.getByRole("button", { name: "Regenerate draft" }).click();
    await expect(page.getByText("Local support in every time zone")).toBeVisible();
    await expect(page.getByText(/A newer draft \(run 2\) is available. Your edits were kept./)).toBeVisible();
    await page.getByRole("button", { name: "Keep mine" }).click();
    await expect(page.getByText(/A newer draft/)).toHaveCount(0);
    await expect(page.getByText("Local support in every time zone")).toBeVisible();
    // the questionnaire asks only what it does not know, and "I don't know" is accepted
    await page.goto(topicUrl);
    await page.locator("#main").getByRole("link", { name: /^Questionnaire/ }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Who do you most need to hear from/)).toBeVisible();
    await page.getByRole("button", { name: "I don’t know" }).first().click();
    await page.getByRole("radio", { name: "Survey" }).click();
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(page.getByRole("cell", { name: /How often do you run into this/ })).toBeVisible();
    await page.getByRole("button", { name: "Copy as Markdown" }).isVisible();
  });

  test("come back later: add more work, get suggestions, generate a PRD from what exists", async ({ page }) => {
    await page.goto(topicUrl);
    await expect(page.getByText("What now?")).toBeVisible();
    await page.getByRole("button", { name: "Add work" }).first().click();
    await page.getByRole("checkbox", { name: /User journey map/ }).click();
    await page.getByRole("checkbox", { name: /PRD/ }).click();
    await page.getByRole("button", { name: /Add to plan \(2\)/ }).click();
    await expect(page.locator("#main").getByRole("link", { name: /^User journey map/ })).toBeVisible();
    await page.locator("#main").getByRole("link", { name: /^PRD/ }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Nothing to ask. This is assembled from your records.")).toBeVisible();
    await page.getByRole("button", { name: "Generate draft" }).click();
    await expect(page.getByText(/No findings exist yet/)).toBeVisible();          // honest about thin evidence
    await expect(page.getByText("Starter draft from your records").first()).toBeVisible();
  });

  test("process mining asks for the data instead of pretending", async ({ page }) => {
    await page.goto(topicUrl);
    await page.getByRole("button", { name: "Add work" }).first().click();
    await page.getByRole("checkbox", { name: /Process mining/ }).click();
    await page.getByRole("button", { name: /Add to plan/ }).click();
    await page.locator("#main").getByRole("link", { name: /^Process mining/ }).click();
    await expect(page.getByRole("heading", { name: "Choose the event log to mine" })).toBeVisible();
    await expect(page.getByText("No CSV in this product yet.")).toBeVisible();
  });
});
