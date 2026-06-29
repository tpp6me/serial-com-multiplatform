import type { RxChunk, TerminalDirection, TerminalViewMode } from "./sessionStore";

export const DEFAULT_PARTIAL_LINE_TIMEOUT_MS = 250;
export const DEFAULT_MAX_VISUAL_LINE_BYTES = 10_000;

export const NEWLINE_MODES = ["cr", "lf", "crlf", "raw"] as const;

export type NewlineMode = (typeof NEWLINE_MODES)[number];

export type TerminalLine = {
  id: string;
  firstSequence: number;
  lastSequence: number;
  timestampWallMs: number;
  direction: TerminalDirection;
  bytes: Uint8Array;
  rawByteLength: number;
  visibleByteLength: number;
  text: string;
  complete: boolean;
  timedOut: boolean;
  flushedOnClose: boolean;
  truncated: boolean;
  truncatedBytes: number;
};

export type BuildTerminalLinesOptions = {
  viewMode: TerminalViewMode;
  newlineMode?: NewlineMode;
  nowWallMs?: number;
  partialLineTimeoutMs?: number;
  sessionClosed?: boolean;
  maxVisualLineBytes?: number;
};

type ByteFrame = {
  byte: number;
  timestampWallMs: number;
  sequence: number;
  direction: TerminalDirection;
};

type PendingLine = {
  bytes: number[];
  firstSequence: number | null;
  lastSequence: number | null;
  timestampWallMs: number | null;
  lastTimestampWallMs: number | null;
  direction: TerminalDirection | null;
};

const textDecoder = new TextDecoder("utf-8", { fatal: false });

export function buildTerminalLines(
  chunks: readonly RxChunk[],
  options: BuildTerminalLinesOptions
): TerminalLine[] {
  const newlineMode = options.newlineMode ?? "lf";
  const maxVisualLineBytes = options.maxVisualLineBytes ?? DEFAULT_MAX_VISUAL_LINE_BYTES;

  if (!Number.isSafeInteger(maxVisualLineBytes) || maxVisualLineBytes <= 0) {
    throw new Error("maxVisualLineBytes must be a positive safe integer");
  }

  if (newlineMode === "raw") {
    return chunks
      .filter((chunk) => chunk.byteLength > 0)
      .map((chunk) =>
        makeLine({
          bytes: [...chunk.bytes],
          firstSequence: chunk.sequence,
          lastSequence: chunk.sequence,
          timestampWallMs: chunk.timestampWallMs,
          direction: chunk.direction,
          complete: true,
          timedOut: false,
          flushedOnClose: false,
          viewMode: options.viewMode,
          maxVisualLineBytes
        })
      );
  }

  const frames = flattenChunks(chunks);
  const pending = createPendingLine();
  const lines: TerminalLine[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];

    if (pending.bytes.length > 0 && pending.direction !== frame.direction) {
      lines.push(
        emitPendingLine(pending, frames[index - 1], {
          viewMode: options.viewMode,
          maxVisualLineBytes,
          complete: false,
          timedOut: false,
          flushedOnClose: false
        })
      );
      clearPendingLine(pending);
    }

    if (
      shouldFlushPendingBeforeFrame(
        pending,
        frame,
        options.partialLineTimeoutMs ?? DEFAULT_PARTIAL_LINE_TIMEOUT_MS
      )
    ) {
      lines.push(
        makeLine({
          bytes: pending.bytes,
          firstSequence: pending.firstSequence ?? frame.sequence,
          lastSequence: pending.lastSequence ?? frame.sequence,
          timestampWallMs: pending.timestampWallMs ?? frame.timestampWallMs,
          direction: pending.direction ?? frame.direction,
          viewMode: options.viewMode,
          maxVisualLineBytes,
          complete: false,
          timedOut: true,
          flushedOnClose: false
        })
      );
      clearPendingLine(pending);
    }

    if (isDelimiter(frames, index, newlineMode)) {
      lines.push(
        emitPendingLine(pending, frame, {
          viewMode: options.viewMode,
          maxVisualLineBytes,
          complete: true,
          timedOut: false,
          flushedOnClose: false
        })
      );
      clearPendingLine(pending);

      if (newlineMode === "crlf") {
        index += 1;
      }

      continue;
    }

    appendPendingByte(pending, frame);
  }

  const partialLine = maybeFlushPartialLine(pending, {
    viewMode: options.viewMode,
    maxVisualLineBytes,
    nowWallMs: options.nowWallMs,
    partialLineTimeoutMs: options.partialLineTimeoutMs ?? DEFAULT_PARTIAL_LINE_TIMEOUT_MS,
    sessionClosed: options.sessionClosed ?? false
  });

  if (partialLine) {
    lines.push(partialLine);
  }

  return lines;
}

export function renderBytes(bytes: Uint8Array, viewMode: TerminalViewMode): string {
  switch (viewMode) {
    case "utf8":
      return renderUtf8(bytes);
    case "hex":
      return [...bytes].map(formatHexByte).join(" ");
    case "mixed":
      return [...bytes].map(renderMixedByte).join("");
    case "decimal":
      return [...bytes].map(formatDecimalByte).join(" ");
    case "binary":
      return [...bytes].map(formatBinaryByte).join(" ");
  }
}

function flattenChunks(chunks: readonly RxChunk[]): ByteFrame[] {
  return chunks.flatMap((chunk) =>
    [...chunk.bytes].map((byte) => ({
      byte,
      timestampWallMs: chunk.timestampWallMs,
      sequence: chunk.sequence,
      direction: chunk.direction
    }))
  );
}

function createPendingLine(): PendingLine {
  return {
    bytes: [],
    firstSequence: null,
    lastSequence: null,
    timestampWallMs: null,
    lastTimestampWallMs: null,
    direction: null
  };
}

function appendPendingByte(pending: PendingLine, frame: ByteFrame) {
  pending.bytes.push(frame.byte);
  pending.firstSequence ??= frame.sequence;
  pending.lastSequence = frame.sequence;
  pending.timestampWallMs ??= frame.timestampWallMs;
  pending.lastTimestampWallMs = frame.timestampWallMs;
  pending.direction ??= frame.direction;
}

function clearPendingLine(pending: PendingLine) {
  pending.bytes = [];
  pending.firstSequence = null;
  pending.lastSequence = null;
  pending.timestampWallMs = null;
  pending.lastTimestampWallMs = null;
  pending.direction = null;
}

function shouldFlushPendingBeforeFrame(
  pending: PendingLine,
  frame: ByteFrame,
  partialLineTimeoutMs: number
): boolean {
  if (pending.bytes.length === 0 || pending.lastTimestampWallMs === null) {
    return false;
  }

  return frame.timestampWallMs - pending.lastTimestampWallMs >= partialLineTimeoutMs;
}

function isDelimiter(
  frames: readonly ByteFrame[],
  index: number,
  newlineMode: NewlineMode
): boolean {
  const frame = frames[index];

  if (newlineMode === "cr") {
    return frame.byte === 0x0d;
  }

  if (newlineMode === "lf") {
    return frame.byte === 0x0a;
  }

  return frame.byte === 0x0d && frames[index + 1]?.byte === 0x0a;
}

function emitPendingLine(
  pending: PendingLine,
  delimiterFrame: ByteFrame,
  options: {
    viewMode: TerminalViewMode;
    maxVisualLineBytes: number;
    complete: boolean;
    timedOut: boolean;
    flushedOnClose: boolean;
  }
): TerminalLine {
  return makeLine({
    bytes: pending.bytes,
    firstSequence: pending.firstSequence ?? delimiterFrame.sequence,
    lastSequence: pending.lastSequence ?? delimiterFrame.sequence,
    timestampWallMs: pending.timestampWallMs ?? delimiterFrame.timestampWallMs,
    direction: pending.direction ?? delimiterFrame.direction,
    ...options
  });
}

function maybeFlushPartialLine(
  pending: PendingLine,
  options: {
    viewMode: TerminalViewMode;
    maxVisualLineBytes: number;
    nowWallMs?: number;
    partialLineTimeoutMs: number;
    sessionClosed: boolean;
  }
): TerminalLine | null {
  if (pending.bytes.length === 0 || pending.lastTimestampWallMs === null) {
    return null;
  }

  if (options.sessionClosed) {
    return makeLine({
      bytes: pending.bytes,
      firstSequence: pending.firstSequence ?? 0,
      lastSequence: pending.lastSequence ?? 0,
      timestampWallMs: pending.timestampWallMs ?? pending.lastTimestampWallMs,
      direction: pending.direction ?? "rx",
      viewMode: options.viewMode,
      maxVisualLineBytes: options.maxVisualLineBytes,
      complete: false,
      timedOut: false,
      flushedOnClose: true
    });
  }

  const lineAgeMs =
    typeof options.nowWallMs === "number" ? options.nowWallMs - pending.lastTimestampWallMs : 0;

  if (lineAgeMs < options.partialLineTimeoutMs) {
    return null;
  }

  return makeLine({
    bytes: pending.bytes,
    firstSequence: pending.firstSequence ?? 0,
    lastSequence: pending.lastSequence ?? 0,
    timestampWallMs: pending.timestampWallMs ?? pending.lastTimestampWallMs,
    direction: pending.direction ?? "rx",
    viewMode: options.viewMode,
    maxVisualLineBytes: options.maxVisualLineBytes,
    complete: false,
    timedOut: true,
    flushedOnClose: false
  });
}

function makeLine(options: {
  bytes: readonly number[];
  firstSequence: number;
  lastSequence: number;
  timestampWallMs: number;
  direction: TerminalDirection;
  viewMode: TerminalViewMode;
  maxVisualLineBytes: number;
  complete: boolean;
  timedOut: boolean;
  flushedOnClose: boolean;
}): TerminalLine {
  const bytes = Uint8Array.from(options.bytes);
  const visibleBytes = bytes.slice(0, options.maxVisualLineBytes);
  const truncatedBytes = bytes.byteLength - visibleBytes.byteLength;
  const rendered = renderBytes(visibleBytes, options.viewMode);
  const text =
    truncatedBytes > 0 ? `${rendered} ... [truncated ${truncatedBytes} bytes]` : rendered;

  return {
    id: `${options.direction}:${options.firstSequence}:${options.lastSequence}:${options.timestampWallMs}:${bytes.byteLength}`,
    firstSequence: options.firstSequence,
    lastSequence: options.lastSequence,
    timestampWallMs: options.timestampWallMs,
    direction: options.direction,
    bytes,
    rawByteLength: bytes.byteLength,
    visibleByteLength: visibleBytes.byteLength,
    text,
    complete: options.complete,
    timedOut: options.timedOut,
    flushedOnClose: options.flushedOnClose,
    truncated: truncatedBytes > 0,
    truncatedBytes
  };
}

function renderUtf8(bytes: Uint8Array): string {
  return Array.from(textDecoder.decode(bytes))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      if (codePoint === 0x00) {
        return "\u2400";
      }

      if (isControlCodePoint(codePoint)) {
        return `<${formatHexByte(codePoint)}>`;
      }

      return character;
    })
    .join("");
}

function renderMixedByte(byte: number): string {
  if (byte === 0x00) {
    return "\u2400";
  }

  if (byte >= 0x20 && byte <= 0x7e) {
    return String.fromCharCode(byte);
  }

  return `<${formatHexByte(byte)}>`;
}

function isControlCodePoint(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function formatHexByte(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

function formatDecimalByte(byte: number): string {
  return byte.toString(10).padStart(3, "0");
}

function formatBinaryByte(byte: number): string {
  return byte.toString(2).padStart(8, "0");
}
