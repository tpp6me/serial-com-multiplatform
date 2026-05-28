import { expect, test } from "@playwright/test";

test("global keyboard shortcuts route to visible app actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await page.locator("body").click();

  await page.keyboard.press("Control+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();

  await page.keyboard.press("Control+T");
  await expect(page.getByRole("button", { name: "Session 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.keyboard.press("Control+Shift+M");
  await expect(page.getByLabel("Macros")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+F");
  await expect(page.getByLabel("Search terminal")).toHaveCount(0);

  await page.keyboard.press("Control+W");
  await expect(page.getByRole("button", { name: "Session 2", exact: true })).toHaveCount(0);
});
