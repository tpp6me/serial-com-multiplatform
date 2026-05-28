import { describe, expect, it } from "vitest";
import {
  computeTerminalStatus,
  computeVirtualWindow,
  formatTimestamp,
  isScrolledToBottom
} from ".";
import type { TerminalLine, TerminalSessionSnapshot } from ".";

function line(id: string, text: string, timestampWallMs = 1_700_000_000_000): TerminalLine {
  const bytes = Uint8Array.from([...text].map((character) => character.charCodeAt(0)));

  return {
    id,
    firstSequence: 1,
    lastSequence: 1,
    timestampWallMs,
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

describe("terminal UI model", () => {
  it("computes a fixed-row virtual window", () => {
    expect(
      computeVirtualWindow({
        rowCount: 100_000,
        scrollTop: 2_000,
        viewportHeight: 200,
        rowHeight: 20,
        overscanRows: 2
      })
    ).toEqual({
      startIndex: 98,
      endIndex: 112,
      paddingTop: 1_960,
      paddingBottom: 1_997_760
    });
  });

  it("detects whether the terminal viewport is pinned to bottom", () => {
    expect(isScrolledToBottom({ scrollTop: 796, clientHeight: 200, scrollHeight: 1_000 })).toBe(
      true
    );
    expect(isScrolledToBottom({ scrollTop: 700, clientHeight: 200, scrollHeight: 1_000 })).toBe(
      false
    );
  });

  it("formats timestamps with configurable formats", () => {
    const timestamp = Date.UTC(2026, 4, 28, 12, 34, 56, 789);

    expect(formatTimestamp(timestamp, "epochMs")).toBe(timestamp.toString());
    expect(formatTimestamp(timestamp, "iso")).toBe("2026-05-28T12:34:56.789Z");
    expect(formatTimestamp(timestamp, "time")).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("computes byte, character, data-rate, and log counters", () => {
    const snapshot: TerminalSessionSnapshot = {
      sessionId: "session-a",
      chunks: [
        {
          sequence: 1,
          timestampWallMs: 9_000,
          bytes: Uint8Array.from([0x41]),
          byteLength: 1,
          direction: "rx"
        },
        {
          sequence: 2,
          timestampWallMs: 9_500,
          bytes: Uint8Array.from([0x42, 0x43]),
          byteLength: 2,
          direction: "rx"
        }
      ],
      viewMode: "utf8",
      retainedBytes: 3,
      receivedBytes: 5,
      droppedBytes: 2,
      lastUpdatedAtWallMs: 9_500
    };

    expect(
      computeTerminalStatus(snapshot, [line("1", "AB"), line("2", "C")], 10_000, {
        loggedBytes: 5,
        droppedLogBytes: 1
      })
    ).toEqual({
      receivedBytes: 5,
      retainedBytes: 3,
      droppedBytes: 2,
      characterCount: 3,
      dataRateBytesPerSecond: 3,
      loggedBytes: 5,
      droppedLogBytes: 1
    });
  });
});
