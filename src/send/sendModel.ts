export const LINE_ENDINGS = ["none", "cr", "lf", "crlf"] as const;

export type LineEnding = (typeof LINE_ENDINGS)[number];

export type SendMode = "text" | "hex";

export type EncodeSendInputResult =
  | {
      ok: true;
      bytes: Uint8Array;
    }
  | {
      ok: false;
      error: string;
    };

const textEncoder = new TextEncoder();

export function encodeSendInput(
  input: string,
  options: {
    mode: SendMode;
    lineEnding: LineEnding;
  }
): EncodeSendInputResult {
  if (options.mode === "hex") {
    return encodeHexInput(input);
  }

  const body = textEncoder.encode(input);
  const lineEnding = encodeLineEnding(options.lineEnding);
  const bytes = new Uint8Array(body.byteLength + lineEnding.byteLength);
  bytes.set(body, 0);
  bytes.set(lineEnding, body.byteLength);

  return { ok: true, bytes };
}

export function encodeLineEnding(lineEnding: LineEnding): Uint8Array {
  switch (lineEnding) {
    case "none":
      return new Uint8Array();
    case "cr":
      return Uint8Array.of(0x0d);
    case "lf":
      return Uint8Array.of(0x0a);
    case "crlf":
      return Uint8Array.of(0x0d, 0x0a);
  }
}

export function validateHexInput(input: string): string | null {
  const compact = compactHexInput(input);

  if (compact.length === 0) {
    return "Enter at least one hex byte.";
  }

  if (/[^0-9a-fA-F]/.test(compact)) {
    return "Hex input may only contain 0-9 and A-F byte pairs.";
  }

  if (compact.length % 2 !== 0) {
    return "Hex input must contain complete byte pairs.";
  }

  return null;
}

function encodeHexInput(input: string): EncodeSendInputResult {
  const validationError = validateHexInput(input);

  if (validationError) {
    return { ok: false, error: validationError };
  }

  const compact = compactHexInput(input);
  const bytes = new Uint8Array(compact.length / 2);

  for (let index = 0; index < compact.length; index += 2) {
    bytes[index / 2] = Number.parseInt(compact.slice(index, index + 2), 16);
  }

  return { ok: true, bytes };
}

function compactHexInput(input: string): string {
  return input.replace(/[\s,_-]/g, "");
}
