import { expect, test, type Locator, type Page } from "@playwright/test";

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

test("send controls remain visible without document scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Send data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();

  const layout = await page.evaluate(() => {
    const sendBar = document.querySelector(".send-bar")?.getBoundingClientRect();
    const terminal = document.querySelector(".terminal-viewport")?.getBoundingClientRect();

    return {
      bodyScrolls: document.documentElement.scrollHeight > window.innerHeight,
      sendBottom: sendBar?.bottom ?? 0,
      terminalBottom: terminal?.bottom ?? 0,
      viewportHeight: window.innerHeight
    };
  });

  expect(layout.bodyScrolls).toBe(false);
  expect(layout.sendBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.terminalBottom).toBeLessThanOrEqual(layout.sendBottom);
});

test("left and right panes can be resized and reset", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.goto("/");

  const initial = await page.evaluate(() => ({
    left: document.querySelector(".sidebar")?.getBoundingClientRect().width ?? 0,
    right: document.querySelector(".inspector-panel")?.getBoundingClientRect().width ?? 0
  }));

  await dragBy(page, page.getByLabel("Resize left pane"), 70);
  await dragBy(page, page.getByLabel("Resize inspector"), -80);

  const resized = await page.evaluate(() => ({
    left: document.querySelector(".sidebar")?.getBoundingClientRect().width ?? 0,
    right: document.querySelector(".inspector-panel")?.getBoundingClientRect().width ?? 0
  }));

  expect(resized.left).toBeGreaterThan(initial.left + 40);
  expect(resized.right).toBeGreaterThan(initial.right + 50);

  await page.getByLabel("Resize left pane").dblclick();
  await page.getByLabel("Resize inspector").dblclick();

  const reset = await page.evaluate(() => ({
    left: document.querySelector(".sidebar")?.getBoundingClientRect().width ?? 0,
    right: document.querySelector(".inspector-panel")?.getBoundingClientRect().width ?? 0
  }));

  expect(Math.abs(reset.left - initial.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(reset.right - initial.right)).toBeLessThanOrEqual(2);
});

async function dragBy(page: Page, locator: Locator, deltaX: number) {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("Resize handle is not visible");
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y, { steps: 8 });
  await page.mouse.up();
}
