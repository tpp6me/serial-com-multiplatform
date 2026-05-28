import { expect, test } from "@playwright/test";

test("linux webview compatibility styles keep terminal rendering stable", async ({ page }) => {
  await page.goto("/");
  await page.locator(".app-shell").evaluate((element) => {
    element.classList.add("platform-linux");
  });

  const terminalStyles = await page.locator(".terminal-viewport").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      animationName: styles.animationName,
      backfaceVisibility: styles.backfaceVisibility,
      contain: styles.contain,
      transform: styles.transform,
      transitionDuration: styles.transitionDuration,
      willChange: styles.willChange
    };
  });

  expect(terminalStyles.animationName).toBe("none");
  expect(terminalStyles.transitionDuration).toBe("0s");
  expect(terminalStyles.backfaceVisibility).toBe("hidden");
  expect(terminalStyles.contain).toContain("content");
  expect(terminalStyles.transform).toBe("none");
  expect(terminalStyles.willChange).toBe("auto");
});
