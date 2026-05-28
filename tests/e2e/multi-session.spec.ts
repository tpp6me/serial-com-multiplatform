import { expect, test, type Page } from "@playwright/test";

test("four session tabs keep independent synthetic RX buffers", async ({ page }) => {
  await page.goto("/");

  await feedSyntheticRx(page, "session-e2e", 1_000);
  await expect(page.getByLabel("Terminal status")).toContainText("RX 100 B");

  await page.getByRole("button", { name: "New session tab" }).click();
  await feedSyntheticRx(page, "session-b", 2_000);
  await expect(page.getByLabel("Terminal status")).toContainText("RX 200 B");

  await page.getByRole("button", { name: "New session tab" }).click();
  await feedSyntheticRx(page, "session-c", 3_000);
  await expect(page.getByLabel("Terminal status")).toContainText("RX 300 B");

  await page.getByRole("button", { name: "New session tab" }).click();
  await feedSyntheticRx(page, "session-d", 4_000);
  await expect(page.getByLabel("Terminal status")).toContainText("RX 400 B");
  await expect(page.getByRole("button", { name: "New session tab" })).toBeDisabled();

  await page.getByRole("button", { name: "Session 1", exact: true }).click();
  await expect(page.getByLabel("Terminal status")).toContainText("RX 100 B");

  await page.getByRole("button", { name: "session-b", exact: true }).click();
  await expect(page.getByLabel("Terminal status")).toContainText("RX 200 B");

  await page.getByRole("button", { name: "session-c", exact: true }).click();
  await expect(page.getByLabel("Terminal status")).toContainText("RX 300 B");

  await page.getByRole("button", { name: "session-d", exact: true }).click();
  await expect(page.getByLabel("Terminal status")).toContainText("RX 400 B");
});

async function feedSyntheticRx(page: Page, sessionId: string, bytesPerSecond: number) {
  const result = await page.evaluate(
    async ({ sessionId, bytesPerSecond }) => {
      const e2eWindow = window as typeof window & {
        __MULTISERIAL_E2E_START_SYNTHETIC_FEED__?: (options: {
          sessionId: string;
          bytesPerSecond: number;
          durationMs: number;
          intervalMs: number;
        }) => Promise<{ bytesSent: number; durationMs: number }>;
      };
      const startFeed = e2eWindow.__MULTISERIAL_E2E_START_SYNTHETIC_FEED__;

      if (!startFeed) {
        throw new Error("synthetic feed hook is not available");
      }

      return startFeed({
        sessionId,
        bytesPerSecond,
        durationMs: 100,
        intervalMs: 16
      });
    },
    { sessionId, bytesPerSecond }
  );

  expect(result.bytesSent).toBe(Math.floor(bytesPerSecond / 10));
}
