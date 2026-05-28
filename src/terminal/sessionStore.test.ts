import { describe, expect, it } from "vitest";
import { TerminalSessionStore, type BackendRxBatch, type TerminalViewMode } from "./sessionStore";

function batch(
  sessionId: string,
  chunks: Array<{ sequence: number; bytes: ArrayLike<number> }>,
  overrides: Partial<BackendRxBatch> = {}
): BackendRxBatch {
  const rxBytes = chunks.reduce((total, chunk) => total + chunk.bytes.length, 0);

  return {
    sessionId,
    chunks: chunks.map((chunk) => ({
      sequence: chunk.sequence,
      timestampWallMs: 1_700_000_000_000 + chunk.sequence,
      bytes: chunk.bytes
    })),
    rxBytes,
    queuedBytes: rxBytes,
    droppedRxBytes: 0,
    batchIntervalMs: 16,
    drainedAtWallMs: 1_700_000_001_000,
    ...overrides
  };
}

describe("TerminalSessionStore", () => {
  it("stores canonical RX chunks by session ID", () => {
    const store = new TerminalSessionStore();

    store.appendBatch(batch("session-a", [{ sequence: 1, bytes: [0x41, 0x42] }]));
    store.appendBatch(batch("session-b", [{ sequence: 1, bytes: [0x63] }]));

    expect(store.listSessionIds()).toEqual(["session-a", "session-b"]);
    expect([...store.snapshot("session-a").chunks[0].bytes]).toEqual([0x41, 0x42]);
    expect([...store.snapshot("session-b").chunks[0].bytes]).toEqual([0x63]);
  });

  it("enforces byte-bounded scrollback per session", () => {
    const store = new TerminalSessionStore({ maxScrollbackBytes: 5 });

    const snapshot = store.appendBatch(
      batch("session-a", [
        { sequence: 1, bytes: [0x01, 0x02] },
        { sequence: 2, bytes: [0x03, 0x04] },
        { sequence: 3, bytes: [0x05, 0x06] }
      ])
    );

    expect(snapshot.retainedBytes).toBe(4);
    expect(snapshot.droppedBytes).toBe(2);
    expect(snapshot.chunks.map((chunk) => chunk.sequence)).toEqual([2, 3]);
  });

  it("trims oversized chunks to the configured scrollback limit", () => {
    const store = new TerminalSessionStore({ maxScrollbackBytes: 4 });

    const snapshot = store.appendBatch(
      batch("session-a", [{ sequence: 1, bytes: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06] }])
    );

    expect(snapshot.retainedBytes).toBe(4);
    expect(snapshot.receivedBytes).toBe(6);
    expect(snapshot.droppedBytes).toBe(2);
    expect([...snapshot.chunks[0].bytes]).toEqual([0x03, 0x04, 0x05, 0x06]);
  });

  it("preserves raw bytes when callers mutate original or snapshot buffers", () => {
    const store = new TerminalSessionStore();
    const original = new Uint8Array([0x00, 0xff, 0x41]);

    store.appendBatch(batch("session-a", [{ sequence: 1, bytes: original }]));
    original[0] = 0x7f;

    const firstSnapshot = store.snapshot("session-a");
    firstSnapshot.chunks[0].bytes[1] = 0x00;

    expect([...store.snapshot("session-a").chunks[0].bytes]).toEqual([0x00, 0xff, 0x41]);
  });

  it("tracks view mode per session without mutating raw chunks", () => {
    const store = new TerminalSessionStore();
    const modes: TerminalViewMode[] = ["hex", "mixed", "decimal", "binary", "utf8"];

    store.appendBatch(batch("session-a", [{ sequence: 1, bytes: [0x41, 0x00, 0xff] }]));
    store.appendBatch(batch("session-b", [{ sequence: 1, bytes: [0x42] }]));

    for (const mode of modes) {
      store.setViewMode("session-a", mode);
    }

    expect(store.snapshot("session-a").viewMode).toBe("utf8");
    expect(store.snapshot("session-b").viewMode).toBe("utf8");
    expect([...store.snapshot("session-a").chunks[0].bytes]).toEqual([0x41, 0x00, 0xff]);
  });

  it("clears display chunks without resetting counters or other sessions", () => {
    const store = new TerminalSessionStore();

    store.appendBatch(batch("session-a", [{ sequence: 1, bytes: [0x41, 0x42] }]));
    store.appendBatch(batch("session-b", [{ sequence: 1, bytes: [0x43] }]));

    const cleared = store.clearDisplay("session-a");

    expect(cleared.chunks).toEqual([]);
    expect(cleared.receivedBytes).toBe(2);
    expect(cleared.retainedBytes).toBe(0);
    expect([...store.snapshot("session-b").chunks[0].bytes]).toEqual([0x43]);
  });

  it("stores TX echo chunks with distinct direction metadata", () => {
    const store = new TerminalSessionStore();

    store.appendBatch(batch("session-a", [{ sequence: 1, bytes: [0x52] }]));
    const snapshot = store.appendTxEcho("session-a", [0x54, 0x58], 1_700_000_002_000);

    expect(snapshot.chunks.map((chunk) => chunk.direction)).toEqual(["rx", "tx"]);
    expect([...snapshot.chunks[1].bytes]).toEqual([0x54, 0x58]);
    expect(snapshot.lastUpdatedAtWallMs).toBe(1_700_000_002_000);
  });

  it("keeps TX echo chunks isolated between sessions", () => {
    const store = new TerminalSessionStore();

    store.appendTxEcho("session-a", [0x41], 1_700_000_001_000);
    store.appendTxEcho("session-b", [0x42], 1_700_000_002_000);

    expect([...store.snapshot("session-a").chunks[0].bytes]).toEqual([0x41]);
    expect([...store.snapshot("session-b").chunks[0].bytes]).toEqual([0x42]);
  });

  it("rejects invalid scrollback limits", () => {
    expect(() => new TerminalSessionStore({ maxScrollbackBytes: 0 })).toThrow("maxScrollbackBytes");
    expect(() => new TerminalSessionStore({ maxScrollbackBytes: 1.5 })).toThrow(
      "maxScrollbackBytes"
    );
  });
});
