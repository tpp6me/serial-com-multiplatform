import { describe, expect, it } from "vitest";
import {
  appendAutomationSidecarLog,
  AUTOMATION_SIDECAR_LOG_STORAGE_KEY,
  isAutomationIntervalAllowed,
  loadAutomationSidecarLog,
  normalizeAutomationInterval,
  requiresFastAutomationConfirmation,
  shouldStopAutomationForKey
} from ".";

describe("automation model", () => {
  it("enforces the minimum automation interval", () => {
    expect(normalizeAutomationInterval(50.8)).toBe(50);
    expect(isAutomationIntervalAllowed(49)).toBe(false);
    expect(isAutomationIntervalAllowed(50)).toBe(true);
  });

  it("requires confirmation for intervals under 100 ms", () => {
    expect(requiresFastAutomationConfirmation(49)).toBe(false);
    expect(requiresFastAutomationConfirmation(50)).toBe(true);
    expect(requiresFastAutomationConfirmation(99)).toBe(true);
    expect(requiresFastAutomationConfirmation(100)).toBe(false);
  });

  it("stops automation on Escape outside focused form fields", () => {
    expect(shouldStopAutomationForKey({ key: "Escape", target: document.body })).toBe(true);
    expect(
      shouldStopAutomationForKey({
        key: "Escape",
        target: document.createElement("textarea")
      })
    ).toBe(false);
    expect(shouldStopAutomationForKey({ key: "Enter", target: document.body })).toBe(false);
  });

  it("persists automation sidecar log entries", () => {
    const storage = new MemoryStorage();
    const entry = {
      sessionId: "session-a",
      macroId: "macro-1",
      macroName: "Ping",
      event: "start" as const,
      timestampWallMs: 1_700_000_000_000,
      intervalMs: 75,
      droppedAutomatedSends: 0
    };

    appendAutomationSidecarLog(storage, entry);

    expect(loadAutomationSidecarLog(storage)).toEqual([entry]);
    expect(JSON.parse(storage.getItem(AUTOMATION_SIDECAR_LOG_STORAGE_KEY) ?? "[]")).toEqual([
      entry
    ]);
  });

  it("ignores malformed automation sidecar log entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTOMATION_SIDECAR_LOG_STORAGE_KEY, JSON.stringify([{ sessionId: 1 }]));

    expect(loadAutomationSidecarLog(storage)).toEqual([]);
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
