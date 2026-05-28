import { describe, expect, it } from "vitest";
import { loadSendHistory, saveSendHistory, SEND_HISTORY_STORAGE_KEY, SendHistoryStore } from ".";

describe("SendHistoryStore", () => {
  it("stores command history per session", () => {
    const store = new SendHistoryStore();

    store.add("session-a", { input: "one", mode: "text", lineEnding: "lf" });
    store.add("session-b", { input: "AA", mode: "hex", lineEnding: "none" });

    expect(store.list("session-a")).toEqual([{ input: "one", mode: "text", lineEnding: "lf" }]);
    expect(store.list("session-b")).toEqual([{ input: "AA", mode: "hex", lineEnding: "none" }]);
  });

  it("enforces configurable history size", () => {
    const store = new SendHistoryStore(2);

    store.add("session-a", { input: "one", mode: "text", lineEnding: "none" });
    store.add("session-a", { input: "two", mode: "text", lineEnding: "none" });
    store.add("session-a", { input: "three", mode: "text", lineEnding: "none" });

    expect(store.list("session-a").map((entry) => entry.input)).toEqual(["two", "three"]);
  });

  it("deduplicates repeated command entries by moving the latest entry to the end", () => {
    const store = new SendHistoryStore(3);

    store.add("session-a", { input: "one", mode: "text", lineEnding: "none" });
    store.add("session-a", { input: "two", mode: "text", lineEnding: "none" });
    store.add("session-a", { input: "one", mode: "text", lineEnding: "none" });

    expect(store.list("session-a").map((entry) => entry.input)).toEqual(["two", "one"]);
  });

  it("persists and reloads serialized history", () => {
    const storage = new MemoryStorage();
    const store = new SendHistoryStore(2);
    store.add("session-a", { input: "first", mode: "text", lineEnding: "crlf" });

    saveSendHistory(storage, store.serialize());

    expect(JSON.parse(storage.getItem(SEND_HISTORY_STORAGE_KEY) ?? "{}")).toEqual({
      "session-a": [{ input: "first", mode: "text", lineEnding: "crlf" }]
    });
    expect(loadSendHistory(storage)).toEqual(store.serialize());
  });

  it("ignores malformed persisted history", () => {
    const storage = new MemoryStorage();
    storage.setItem(SEND_HISTORY_STORAGE_KEY, JSON.stringify({ "session-a": [{ input: 42 }] }));

    expect(loadSendHistory(storage)).toEqual({});
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
