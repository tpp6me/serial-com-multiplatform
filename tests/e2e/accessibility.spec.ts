import { expect, test } from "@playwright/test";

test("settings and core controls are keyboard reachable with stable layout", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "MultiSerial" })).toBeVisible();
  await page.keyboard.press("Control+,");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Terminal font size")).toBeVisible();
  await expect(page.getByTitle(/Flow control selects/)).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();

  await expect(page.getByTitle(/Data Terminal Ready/)).toBeVisible();
  await expect(page.getByTitle(/Request To Send/)).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(overflow).toBe(false);
});
