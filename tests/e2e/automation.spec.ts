import { expect, test } from "@playwright/test";

test("automation banner appears and Escape stops automation outside send input", async ({
  page
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");

  await page.getByLabel("Macro name").fill("Ping");
  await page.getByLabel("Macro text step").fill("AT");
  await page.getByLabel("Macro text line ending").selectOption("lf");
  await page.getByLabel("Automation interval milliseconds").fill("75");
  const macros = page.getByLabel("Macros", { exact: true });
  await macros.getByRole("button", { name: "Save" }).click();
  await macros.getByRole("button", { name: "Auto" }).click();

  const banner = page.getByLabel("Automation running");
  await expect(banner).toContainText("Ping");
  await expect(banner).toContainText("75 ms");

  await page.keyboard.press("Escape");

  await expect(banner).toBeHidden();
});

test("stop-all button stops automation from the banner", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Macro name").fill("Reset");
  await page.getByLabel("Macro hex step").fill("00");
  const macros = page.getByLabel("Macros", { exact: true });
  await macros.getByRole("button", { name: "Save" }).click();
  await macros.getByRole("button", { name: "Auto" }).click();

  const banner = page.getByLabel("Automation running");
  await expect(banner).toContainText("Reset");
  await banner.getByRole("button", { name: "Stop all" }).click();

  await expect(banner).toBeHidden();
});
