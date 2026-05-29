import { expect, test } from "@playwright/test";

test("terminal remains usable during a 100,000 chars/sec synthetic feed", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  await page.evaluate(() => {
    const e2eWindow = window as typeof window & {
      __MULTISERIAL_E2E_START_SYNTHETIC_FEED__?: (options: {
        sessionId: string;
        bytesPerSecond: number;
        durationMs: number;
        intervalMs: number;
      }) => Promise<{ bytesSent: number; durationMs: number }>;
      __MULTISERIAL_E2E_FEED_RESULT__?: Promise<{ bytesSent: number; durationMs: number }>;
    };
    const startFeed = e2eWindow.__MULTISERIAL_E2E_START_SYNTHETIC_FEED__;

    if (!startFeed) {
      throw new Error("synthetic feed hook is not available");
    }

    e2eWindow.__MULTISERIAL_E2E_FEED_RESULT__ = startFeed({
      sessionId: "session-e2e",
      bytesPerSecond: 100_000,
      durationMs: 60_000,
      intervalMs: 16
    });

    return true;
  });

  await expect(page.getByText(/Auto-scroll|Scroll paused/)).toBeVisible();
  await expect(page.getByLabel("Terminal status")).toContainText(/RX [1-9][0-9]* B/, {
    timeout: 10_000
  });

  await page.getByRole("button", { name: "Wrap" }).click();
  await expect(page.getByRole("log")).toHaveClass(/nowrap/);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+F" : "Control+F");
  await expect(page.getByLabel("Search terminal")).toBeFocused();
  await page.getByLabel("Search terminal").fill("ABC");
  await expect(page.getByLabel("Terminal search")).toContainText(/\d+\/\d+/, {
    timeout: 10_000
  });

  await page.getByRole("tab", { name: /Highlights/ }).click();
  await page.getByLabel("Highlight pattern").fill("XYZ");
  await page.getByLabel("Inspector").getByRole("button", { name: "Add" }).click();
  await expect(
    page.getByLabel("Inspector").locator(".rule-item").filter({ hasText: "XYZ" })
  ).toBeVisible();

  const result = await page.evaluate(() => {
    const e2eWindow = window as typeof window & {
      __MULTISERIAL_E2E_FEED_RESULT__?: Promise<{ bytesSent: number; durationMs: number }>;
    };

    if (!e2eWindow.__MULTISERIAL_E2E_FEED_RESULT__) {
      throw new Error("synthetic feed result is not available");
    }

    return e2eWindow.__MULTISERIAL_E2E_FEED_RESULT__;
  });
  expect(result.bytesSent).toBe(6_000_000);
  expect(result.durationMs).toBeGreaterThanOrEqual(59_000);
  await expect(page.getByLabel("Terminal status")).toContainText("RX 6000000 B");
});
