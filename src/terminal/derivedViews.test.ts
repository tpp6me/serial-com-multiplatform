import { describe, expect, it } from "vitest";
import { buildTerminalLines, renderBytes, type NewlineMode } from "./derivedViews";
import type { RxChunk, TerminalViewMode } from "./sessionStore";

function chunk(
  sequence: number,
  bytes: number[],
  timestampWallMs = 1_700_000_000_000,
  direction: RxChunk["direction"] = "rx"
): RxChunk {
  return {
    sequence,
    timestampWallMs,
    bytes: Uint8Array.from(bytes),
    byteLength: bytes.length,
    direction
  };
}

describe("renderBytes", () => {
  it("renders UTF-8 text and replaces invalid sequences", () => {
    const rendered = renderBytes(Uint8Array.from([0x68, 0x69, 0x20, 0xc3, 0x28]), "utf8");

    expect(rendered).toBe("hi \uFFFD(");
  });

  it("renders null bytes visibly in UTF-8 and mixed modes", () => {
    expect(renderBytes(Uint8Array.from([0x41, 0x00, 0x42]), "utf8")).toBe("A\u2400B");
    expect(renderBytes(Uint8Array.from([0x41, 0x00, 0x1b]), "mixed")).toBe("A\u2400<1B>");
  });

  it("renders hexadecimal, decimal, binary, and mixed display modes", () => {
    const bytes = Uint8Array.from([0x00, 0x2a, 0xff]);
    const expectedByMode: Record<Exclude<TerminalViewMode, "utf8">, string> = {
      hex: "00 2A FF",
      mixed: "\u2400*<FF>",
      decimal: "000 042 255",
      binary: "00000000 00101010 11111111"
    };

    for (const [mode, expected] of Object.entries(expectedByMode)) {
      expect(renderBytes(bytes, mode as TerminalViewMode)).toBe(expected);
    }
  });
});

describe("buildTerminalLines", () => {
  it("splits lines by CR, LF, and CRLF newline modes", () => {
    const cases: Array<{ newlineMode: NewlineMode; bytes: number[]; expected: string[] }> = [
      { newlineMode: "cr", bytes: [0x41, 0x0d, 0x42, 0x0d], expected: ["A", "B"] },
      { newlineMode: "lf", bytes: [0x41, 0x0a, 0x42, 0x0a], expected: ["A", "B"] },
      { newlineMode: "crlf", bytes: [0x41, 0x0d, 0x0a, 0x42, 0x0d, 0x0a], expected: ["A", "B"] }
    ];

    for (const testCase of cases) {
      const lines = buildTerminalLines([chunk(1, testCase.bytes)], {
        viewMode: "utf8",
        newlineMode: testCase.newlineMode
      });

      expect(lines.map((line) => line.text)).toEqual(testCase.expected);
      expect(lines.every((line) => line.complete)).toBe(true);
    }
  });

  it("keeps one line per chunk in raw chunk mode", () => {
    const lines = buildTerminalLines([chunk(1, [0x41, 0x0a]), chunk(2, [0x42])], {
      viewMode: "hex",
      newlineMode: "raw"
    });

    expect(lines.map((line) => line.text)).toEqual(["41 0A", "42"]);
    expect(lines.map((line) => line.firstSequence)).toEqual([1, 2]);
  });

  it("flushes partial lines after timeout", () => {
    const linesBeforeTimeout = buildTerminalLines([chunk(1, [0x41], 1_000)], {
      viewMode: "utf8",
      newlineMode: "lf",
      nowWallMs: 1_100,
      partialLineTimeoutMs: 250
    });
    const linesAfterTimeout = buildTerminalLines([chunk(1, [0x41], 1_000)], {
      viewMode: "utf8",
      newlineMode: "lf",
      nowWallMs: 1_251,
      partialLineTimeoutMs: 250
    });

    expect(linesBeforeTimeout).toEqual([]);
    expect(linesAfterTimeout).toHaveLength(1);
    expect(linesAfterTimeout[0]).toMatchObject({
      text: "A",
      complete: false,
      timedOut: true,
      flushedOnClose: false
    });
  });

  it("flushes partial lines on close", () => {
    const lines = buildTerminalLines([chunk(1, [0x41])], {
      viewMode: "utf8",
      newlineMode: "lf",
      sessionClosed: true
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      text: "A",
      complete: false,
      timedOut: false,
      flushedOnClose: true
    });
  });

  it("marks visual truncation while preserving the full line bytes", () => {
    const lines = buildTerminalLines([chunk(1, [0x41, 0x42, 0x43, 0x44]), chunk(2, [0x45, 0x0a])], {
      viewMode: "utf8",
      newlineMode: "lf",
      maxVisualLineBytes: 3
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      text: "ABC ... [truncated 2 bytes]",
      rawByteLength: 5,
      visibleByteLength: 3,
      truncated: true,
      truncatedBytes: 2
    });
    expect([...lines[0].bytes]).toEqual([0x41, 0x42, 0x43, 0x44, 0x45]);
  });

  it("does not mutate source chunks when building different display modes", () => {
    const source = [chunk(1, [0x41, 0x00, 0xff, 0x0a])];

    const modeText = ["utf8", "hex", "mixed", "decimal", "binary"].map(
      (viewMode) =>
        buildTerminalLines(source, { viewMode: viewMode as TerminalViewMode, newlineMode: "lf" })[0]
          .text
    );

    expect(modeText).toEqual([
      "A\u2400\uFFFD",
      "41 00 FF",
      "A\u2400<FF>",
      "065 000 255",
      "01000001 00000000 11111111"
    ]);
    expect([...source[0].bytes]).toEqual([0x41, 0x00, 0xff, 0x0a]);
  });

  it("carries TX direction onto echoed terminal lines", () => {
    const lines = buildTerminalLines([chunk(1, [0x54, 0x58, 0x0a], 1_700_000_000_000, "tx")], {
      viewMode: "utf8",
      newlineMode: "lf"
    });

    expect(lines[0]).toMatchObject({
      direction: "tx",
      text: "TX"
    });
  });
});
