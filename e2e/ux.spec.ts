import { expect, test } from "@playwright/test";

test.describe.serial("no name needed, left menu, journey diagram", () => {
  let topicUrl = "";
  test("start without naming the product, then rename it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Products" })).toBeVisible();      // left menu on home
    await page.getByLabel("In product").selectOption("__new");
    await page.getByRole("radio", { name: "Idea" }).click();
    await page.getByLabel("Describe what you’re working on").fill("A self-serve invoice dispute flow");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Select the 5 suggested for an idea/ }).click();
    await page.getByRole("checkbox", { name: /^User journey map/ }).check().catch(() => {});
    await page.getByRole("button", { name: /^Plan my work/ }).click();
    await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
    topicUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("navigation", { name: "Product sections" })).toBeVisible();
    await expect(page.getByText("Untitled product").first()).toBeVisible();
    const pid = topicUrl.split("/")[2];
    await page.goto(`/p/${pid}`);
    await page.getByRole("button", { name: "Rename product" }).click();
    await page.getByRole("textbox", { name: /Product name/i }).fill("Billing Disputes");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Billing Disputes" })).toBeVisible();
  });

  test("journey map is a box diagram you can add to and remove from", async ({ page }) => {
    await page.goto(topicUrl);
    await page.locator("#main").getByRole("link", { name: /^User journey map/ }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Generate draft" }).click();
    const d = page.getByTestId("journey-diagram");
    await expect(d).toBeVisible();
    const stages = d.getByLabel(/^Stage \d+ name/);
    const before = await stages.count();
    await d.getByRole("button", { name: "Add a stage" }).click();
    await expect(stages).toHaveCount(before + 1);
    await stages.last().fill("Resolve");
    await d.getByRole("button", { name: "Add note to Actions, Resolve" }).click();
    await page.keyboard.type("Uploads a receipt");
    await expect(d.getByText("Saved ✓")).toBeVisible();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Actions, Resolve, note 1")).toHaveValue("Uploads a receipt");
    await page.getByRole("button", { name: "Remove note 1 from Actions, Resolve" }).click();
    await page.getByRole("button", { name: "Remove stage Resolve" }).click();
    await expect(page.getByLabel(/^Stage \d+ name/)).toHaveCount(before);
    await expect(page.getByLabel("Stage 1 name")).toHaveValue(/./);
  });
});
