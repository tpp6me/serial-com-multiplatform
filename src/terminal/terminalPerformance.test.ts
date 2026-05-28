import { describe, expect, it } from "vitest";
import { buildTerminalLines, computeTerminalStatus, computeVirtualWindow } from ".";
import type { RxChunk, TerminalLine, TerminalSessionSnapshot } from ".";

const PERFORMANCE_TARGET_MS = 1_000;
const SYNTHETIC_FEED_TARGET_MS = 2_000;

function makeLine(index: number): TerminalLine {
  const text = "X".repeat(80);
  const bytes = Uint8Array.from({ length: 80 }, () => 0x58);

  return {
    id: `line-${index}`,
    firstSequence: index,
    lastSequence: index,
    timestampWallMs: 1_700_000_000_000 + index,
    direction: "rx",
    bytes,
    rawByteLength: bytes.byteLength,
    visibleByteLength: bytes.byteLength,
    text,
    complete: true,
    timedOut: false,
    flushedOnClose: false,
    truncated: false,
    truncatedBytes: 0
  };
}

describe("terminal renderer performance", () => {
  it("benchmarks the 100,000-line x 80-char display path", () => {
    const lines = Array.from({ length: 100_000 }, (_, index) => makeLine(index));
    const snapshot: TerminalSessionSnapshot = {
      sessionId: "session-a",
      chunks: [],
      viewMode: "utf8",
      retainedBytes: 8_000_000,
      receivedBytes: 8_000_000,
      droppedBytes: 0,
      lastUpdatedAtWallMs: null
    };

    const startedAt = performance.now();
    const window = computeVirtualWindow({
      rowCount: lines.length,
      scrollTop: 1_250_000,
      viewportHeight: 480,
      rowHeight: 20
    });
    const visibleLines = lines.slice(window.startIndex, window.endIndex);
    const status = computeTerminalStatus(snapshot, visibleLines, 1_700_000_100_000);
    const elapsedMs = performance.now() - startedAt;

    expect(visibleLines.length).toBeLessThanOrEqual(40);
    expect(status.characterCount).toBe(visibleLines.length * 80);
    expect(elapsedMs).toBeLessThan(PERFORMANCE_TARGET_MS);
  });

  it("benchmarks a 60-second 100,000 chars/sec feed into the line builder", () => {
    const totalBytes = 100_000 * 60;
    const payload = new Uint8Array(totalBytes);

    for (let index = 0; index < payload.byteLength; index += 1) {
      payload[index] = index % 80 === 79 ? 0x0a : 0x41 + (index % 26);
    }

    const chunks: RxChunk[] = Array.from({ length: totalBytes / 1_000 }, (_, index) => {
      const bytes = payload.slice(index * 1_000, (index + 1) * 1_000);

      return {
        sequence: index + 1,
        timestampWallMs: 1_700_000_000_000 + index,
        bytes,
        byteLength: bytes.byteLength,
        direction: "rx"
      };
    });

    const startedAt = performance.now();
    const lines = buildTerminalLines(chunks, {
      viewMode: "utf8",
      newlineMode: "lf",
      nowWallMs: 1_700_000_060_000
    });
    const window = computeVirtualWindow({
      rowCount: lines.length,
      scrollTop: 1_250_000,
      viewportHeight: 480,
      rowHeight: 20
    });
    const elapsedMs = performance.now() - startedAt;

    expect(lines).toHaveLength(75_000);
    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(40);
    expect(lines.reduce((total, line) => total + line.rawByteLength, 0)).toBe(5_925_000);
    expect(elapsedMs).toBeLessThan(SYNTHETIC_FEED_TARGET_MS);
  });
});
