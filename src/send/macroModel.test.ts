import { describe, expect, it, vi } from "vitest";
import {
  buildMacroFromFields,
  compileMacro,
  loadMacroConfig,
  MACRO_CONFIG_STORAGE_KEY,
  MacroConfigStore,
  runMacro,
  saveMacroConfig,
  type SendMacro
} from ".";

describe("macro model", () => {
  it("builds text, hex, and delay steps from editor fields", () => {
    const macro = buildMacroFromFields({
      id: "macro-1",
      name: "Handshake",
      textInput: "AT",
      textLineEnding: "crlf",
      hexInput: "00 ff",
      delayMs: 25
    });

    expect(macro).toEqual({
      id: "macro-1",
      name: "Handshake",
      steps: [
        { kind: "text", input: "AT", lineEnding: "crlf" },
        { kind: "hex", input: "00 ff" },
        { kind: "delay", delayMs: 25 }
      ]
    });
  });

  it("compiles macro steps to exact byte sequences and delays", () => {
    const macro: SendMacro = {
      id: "macro-1",
      name: "Handshake",
      steps: [
        { kind: "text", input: "AT", lineEnding: "crlf" },
        { kind: "delay", delayMs: 10 },
        { kind: "hex", input: "00 FF" }
      ]
    };

    const segments = compileMacro(macro);

    expect(segments[0].kind === "bytes" ? [...segments[0].bytes] : []).toEqual([
      0x41, 0x54, 0x0d, 0x0a
    ]);
    expect(segments[1]).toEqual({ kind: "delay", delayMs: 10 });
    expect(segments[2].kind === "bytes" ? [...segments[2].bytes] : []).toEqual([0x00, 0xff]);
  });

  it("runs macro byte segments with inter-packet delay", async () => {
    const writeBytes = vi.fn(async (bytes: Uint8Array) => bytes.byteLength);
    const wait = vi.fn(async () => undefined);

    await runMacro({
      macro: {
        id: "macro-1",
        name: "Handshake",
        steps: [
          { kind: "text", input: "A", lineEnding: "none" },
          { kind: "delay", delayMs: 15 },
          { kind: "hex", input: "42" }
        ]
      },
      writeBytes,
      wait
    });

    expect(writeBytes.mock.calls.map(([bytes]) => [...bytes])).toEqual([[0x41], [0x42]]);
    expect(wait).toHaveBeenCalledWith(15);
  });

  it("stores macros per session and persists macro config", () => {
    const storage = new MemoryStorage();
    const store = new MacroConfigStore();

    store.upsert("session-a", {
      id: "macro-a",
      name: "A",
      steps: [{ kind: "text", input: "one", lineEnding: "lf" }]
    });
    store.upsert("session-b", {
      id: "macro-b",
      name: "B",
      steps: [{ kind: "hex", input: "02" }]
    });
    saveMacroConfig(storage, store.serialize());

    expect(store.list("session-a").map((macro) => macro.id)).toEqual(["macro-a"]);
    expect(store.list("session-b").map((macro) => macro.id)).toEqual(["macro-b"]);
    expect(loadMacroConfig(storage)).toEqual(store.serialize());
    expect(JSON.parse(storage.getItem(MACRO_CONFIG_STORAGE_KEY) ?? "{}")).toEqual(
      store.serialize()
    );
  });

  it("updates and deletes macros by ID", () => {
    const store = new MacroConfigStore();

    store.upsert("session-a", {
      id: "macro-a",
      name: "A",
      steps: [{ kind: "text", input: "one", lineEnding: "none" }]
    });
    store.upsert("session-a", {
      id: "macro-a",
      name: "A2",
      steps: [{ kind: "text", input: "two", lineEnding: "none" }]
    });

    expect(store.list("session-a")[0].name).toBe("A2");
    expect(store.delete("session-a", "macro-a")).toBe(true);
    expect(store.list("session-a")).toEqual([]);
  });

  it("rejects invalid hex during compilation", () => {
    expect(() =>
      compileMacro({
        id: "macro-1",
        name: "Invalid",
        steps: [{ kind: "hex", input: "0" }]
      })
    ).toThrow("complete byte pairs");
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
