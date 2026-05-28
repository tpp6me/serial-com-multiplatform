import { expect, test, type Page } from "@playwright/test";

test("browser mock serial self-test covers connect, RX, TX, hotplug, and isolation", async ({
  page
}) => {
  await page.goto("/");

  const portSelect = page.getByLabel("Serial port");
  await expect(portSelect.locator("option", { hasText: "MOCK_A" })).toHaveCount(1);
  await expect(portSelect.locator("option", { hasText: "MOCK_B" })).toHaveCount(1);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(portSelect.locator("option", { hasText: "MOCK_A" })).toHaveCount(1);
  await expect(portSelect.locator("option", { hasText: "MOCK_HOTUNPLUG" })).toHaveCount(1);

  await page.getByRole("button", { name: "New session tab" }).click();
  await page.getByLabel("Serial port").selectOption("MOCK_A");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

  const sessionA = await activeMockSessionId(page);
  await feedSyntheticRx(page, sessionA, "Hello\r\n");
  await expect(page.getByRole("log")).toContainText("Hello");

  for (const mode of ["hex", "mixed", "decimal", "binary", "utf8"]) {
    await page.getByLabel("Terminal view mode").selectOption(mode);
    await expect(page.getByLabel("Terminal status")).toContainText("RX 7 B");
  }

  const sendData = page.getByLabel("Send data");
  await sendData.getByRole("button", { name: "Text", exact: true }).click();
  await sendData.getByLabel("Line ending", { exact: true }).selectOption("crlf");
  await sendData.getByLabel("Send text").fill("AT");
  await sendData.getByRole("button", { name: "Send", exact: true }).click();

  await sendData.getByRole("button", { name: "Hex", exact: true }).click();
  await sendData.getByLabel("Send hex").fill("0A 1B FF");
  await sendData.getByRole("button", { name: "Send", exact: true }).click();

  await expect(async () => {
    expect(await mockWrites(page, sessionA)).toEqual([
      [0x41, 0x54, 0x0d, 0x0a],
      [0x0a, 0x1b, 0xff]
    ]);
  }).toPass();

  expect(await triggerMockHotplug(page, sessionA)).toBe(true);
  await expect(page.getByText("MOCK_A was unplugged.")).toBeVisible();

  await page.getByRole("button", { name: "New session tab" }).click();
  await page.getByLabel("Serial port").selectOption("MOCK_B");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const sessionB = await activeMockSessionId(page);
  await feedSyntheticRx(page, sessionB, "B\r\n");
  await expect(page.getByRole("log")).toContainText("B");

  await page.getByRole("button", { name: "MOCK_A", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Hello");
  await expect(page.getByRole("log")).not.toContainText("B");
});

async function activeMockSessionId(page: Page): Promise<string> {
  await expect(async () => {
    expect(Object.keys(await allMockWrites(page)).some((key) => key.startsWith("mock-"))).toBe(
      true
    );
  }).toPass();

  const sessionIds = Object.keys(await allMockWrites(page)).filter((key) =>
    key.startsWith("mock-")
  );

  return sessionIds.at(-1) ?? "";
}

async function allMockWrites(page: Page): Promise<Record<string, number[][]>> {
  return page.evaluate(() => {
    const e2eWindow = window as typeof window & {
      __MULTISERIAL_E2E_GET_MOCK_WRITES__?: () => Record<string, number[][]>;
    };

    return e2eWindow.__MULTISERIAL_E2E_GET_MOCK_WRITES__?.() ?? {};
  });
}

async function mockWrites(page: Page, sessionId: string): Promise<number[][]> {
  const writes = await page.evaluate((sessionId) => {
    const e2eWindow = window as typeof window & {
      __MULTISERIAL_E2E_GET_MOCK_WRITES__?: (sessionId?: string) => Record<string, number[][]>;
    };

    return e2eWindow.__MULTISERIAL_E2E_GET_MOCK_WRITES__?.(sessionId) ?? {};
  }, sessionId);

  return writes[sessionId] ?? [];
}

async function triggerMockHotplug(page: Page, sessionId: string): Promise<boolean> {
  return page.evaluate((sessionId) => {
    const e2eWindow = window as typeof window & {
      __MULTISERIAL_E2E_TRIGGER_MOCK_HOTPLUG__?: (sessionId?: string) => boolean;
    };

    return e2eWindow.__MULTISERIAL_E2E_TRIGGER_MOCK_HOTPLUG__?.(sessionId) ?? false;
  }, sessionId);
}

async function feedSyntheticRx(page: Page, sessionId: string, text: string) {
  await page.evaluate(
    ({ sessionId, text }) => {
      const e2eWindow = window as typeof window & {
        __MULTISERIAL_E2E_APPEND_RX_BYTES__?: (sessionId: string, bytes: number[]) => void;
      };
      const appendRxBytes = e2eWindow.__MULTISERIAL_E2E_APPEND_RX_BYTES__;

      if (!appendRxBytes) {
        throw new Error("RX append hook is not available");
      }

      appendRxBytes(sessionId, [...new TextEncoder().encode(text)]);
    },
    { sessionId, text }
  );
}
