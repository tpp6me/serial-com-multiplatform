import { describe, expect, it } from "vitest";
import { encodeLineEnding, encodeSendInput, validateHexInput, type LineEnding } from ".";

describe("send model", () => {
  it("encodes text with all supported line endings", () => {
    const expectedByEnding: Record<LineEnding, number[]> = {
      none: [0x48, 0x69],
      cr: [0x48, 0x69, 0x0d],
      lf: [0x48, 0x69, 0x0a],
      crlf: [0x48, 0x69, 0x0d, 0x0a]
    };

    for (const [lineEnding, expected] of Object.entries(expectedByEnding)) {
      const result = encodeSendInput("Hi", {
        mode: "text",
        lineEnding: lineEnding as LineEnding
      });

      expect(result.ok).toBe(true);
      expect(result.ok ? [...result.bytes] : []).toEqual(expected);
    }
  });

  it("encodes hex byte pairs exactly", () => {
    const result = encodeSendInput("00 7f,80-FF", {
      mode: "hex",
      lineEnding: "crlf"
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? [...result.bytes] : []).toEqual([0x00, 0x7f, 0x80, 0xff]);
  });

  it("validates malformed hex input", () => {
    expect(validateHexInput("")).toBe("Enter at least one hex byte.");
    expect(validateHexInput("0")).toBe("Hex input must contain complete byte pairs.");
    expect(validateHexInput("GG")).toBe("Hex input may only contain 0-9 and A-F byte pairs.");
  });

  it("exposes exact line-ending byte sequences", () => {
    expect([...encodeLineEnding("none")]).toEqual([]);
    expect([...encodeLineEnding("cr")]).toEqual([0x0d]);
    expect([...encodeLineEnding("lf")]).toEqual([0x0a]);
    expect([...encodeLineEnding("crlf")]).toEqual([0x0d, 0x0a]);
  });
});
