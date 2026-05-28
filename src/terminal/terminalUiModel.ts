import type { TerminalLine } from "./derivedViews";
import type { TerminalSessionSnapshot } from "./sessionStore";

export type TimestampFormat = "time" | "iso" | "epochMs";

export type VirtualWindow = {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
};

export type TerminalStatus = {
  receivedBytes: number;
  retainedBytes: number;
  droppedBytes: number;
  characterCount: number;
  dataRateBytesPerSecond: number;
  loggedBytes: number;
  droppedLogBytes: number;
};

export type LogCounterSummary = {
  loggedBytes?: number;
  droppedLogBytes?: number;
};

const SCROLL_BOTTOM_THRESHOLD_PX = 4;

export function computeVirtualWindow(options: {
  rowCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscanRows?: number;
}): VirtualWindow {
  const rowCount = Math.max(0, options.rowCount);
  const rowHeight = Math.max(1, options.rowHeight);
  const viewportHeight = Math.max(0, options.viewportHeight);
  const overscanRows = Math.max(0, options.overscanRows ?? 6);
  const firstVisible = Math.floor(Math.max(0, options.scrollTop) / rowHeight);
  const visibleRows = Math.ceil(viewportHeight / rowHeight);
  const startIndex = Math.max(0, firstVisible - overscanRows);
  const endIndex = Math.min(rowCount, firstVisible + visibleRows + overscanRows);

  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, (rowCount - endIndex) * rowHeight)
  };
}

export function isScrolledToBottom(options: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): boolean {
  return (
    options.scrollHeight - options.scrollTop - options.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX
  );
}

export function formatTimestamp(timestampWallMs: number, format: TimestampFormat): string {
  if (format === "epochMs") {
    return Math.trunc(timestampWallMs).toString();
  }

  const date = new Date(timestampWallMs);

  if (format === "iso") {
    return date.toISOString();
  }

  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
}

export function computeTerminalStatus(
  snapshot: TerminalSessionSnapshot,
  lines: readonly TerminalLine[],
  nowWallMs: number,
  logCounters: LogCounterSummary = {}
): TerminalStatus {
  const oneSecondAgo = nowWallMs - 1_000;
  const bytesInLastSecond = snapshot.chunks
    .filter((chunk) => chunk.timestampWallMs >= oneSecondAgo)
    .reduce((total, chunk) => total + chunk.byteLength, 0);

  return {
    receivedBytes: snapshot.receivedBytes,
    retainedBytes: snapshot.retainedBytes,
    droppedBytes: snapshot.droppedBytes,
    characterCount: lines.reduce((total, line) => total + line.text.length, 0),
    dataRateBytesPerSecond: bytesInLastSecond,
    loggedBytes: logCounters.loggedBytes ?? 0,
    droppedLogBytes: logCounters.droppedLogBytes ?? 0
  };
}
