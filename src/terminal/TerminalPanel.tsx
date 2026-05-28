import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LineHighlight } from "../filter";
import type { TerminalLine } from "./derivedViews";
import { TERMINAL_VIEW_MODES, type TerminalViewMode } from "./sessionStore";
import {
  computeTerminalStatus,
  computeVirtualWindow,
  formatTimestamp,
  isScrolledToBottom,
  type LogCounterSummary,
  type TimestampFormat
} from "./terminalUiModel";
import type { TerminalSessionSnapshot } from "./sessionStore";

export type TerminalPanelProps = {
  snapshot: TerminalSessionSnapshot | null;
  lines: TerminalLine[];
  highlightsByLineId?: Record<string, LineHighlight[]>;
  showTimestamps: boolean;
  timestampFormat: TimestampFormat;
  wrapLines: boolean;
  logCounters?: LogCounterSummary;
  onToggleTimestamps: () => void;
  onTimestampFormatChange: (format: TimestampFormat) => void;
  onViewModeChange: (mode: TerminalViewMode) => void;
  onToggleWrapLines: () => void;
  onClear: () => void;
  rowHeight?: number;
  viewportHeight?: number;
  nowWallMs?: number;
};

export function TerminalPanel({
  snapshot,
  lines,
  highlightsByLineId = {},
  showTimestamps,
  timestampFormat,
  wrapLines,
  logCounters,
  onToggleTimestamps,
  onTimestampFormatChange,
  onViewModeChange,
  onToggleWrapLines,
  onClear,
  rowHeight = 22,
  viewportHeight = 360,
  nowWallMs = Date.now()
}: TerminalPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const virtualWindow = computeVirtualWindow({
    rowCount: lines.length,
    scrollTop,
    viewportHeight,
    rowHeight
  });
  const visibleLines = lines.slice(virtualWindow.startIndex, virtualWindow.endIndex);
  const status = useMemo(
    () =>
      snapshot
        ? computeTerminalStatus(snapshot, lines, nowWallMs, logCounters)
        : {
            receivedBytes: 0,
            retainedBytes: 0,
            droppedBytes: 0,
            characterCount: 0,
            dataRateBytesPerSecond: 0,
            loggedBytes: 0,
            droppedLogBytes: 0
          },
    [lines, logCounters, nowWallMs, snapshot]
  );

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || !autoScroll) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
    setScrollTop(viewport.scrollTop);
  }, [autoScroll, lines.length]);

  return (
    <section className="terminal-panel" aria-label="Terminal output">
      <div className="terminal-controls" aria-label="Terminal controls">
        <button type="button" aria-pressed={showTimestamps} onClick={onToggleTimestamps}>
          Timestamps
        </button>
        <select
          aria-label="Timestamp format"
          value={timestampFormat}
          onChange={(event) =>
            onTimestampFormatChange(event.currentTarget.value as TimestampFormat)
          }
        >
          <option value="time">Time</option>
          <option value="iso">ISO</option>
          <option value="epochMs">Epoch ms</option>
        </select>
        <select
          aria-label="Terminal view mode"
          value={snapshot?.viewMode ?? "utf8"}
          onChange={(event) => onViewModeChange(event.currentTarget.value as TerminalViewMode)}
          disabled={!snapshot}
        >
          {TERMINAL_VIEW_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode.toUpperCase()}
            </option>
          ))}
        </select>
        <button type="button" aria-pressed={wrapLines} onClick={onToggleWrapLines}>
          Wrap
        </button>
        <button type="button" onClick={onClear} disabled={!snapshot || lines.length === 0}>
          Clear
        </button>
        <span className="terminal-autoscroll">{autoScroll ? "Auto-scroll" : "Scroll paused"}</span>
      </div>

      <div
        ref={viewportRef}
        className={wrapLines ? "terminal-viewport wrap" : "terminal-viewport nowrap"}
        style={{ height: viewportHeight }}
        role="log"
        aria-live="polite"
        onScroll={(event) => {
          const target = event.currentTarget;
          const atBottom = isScrolledToBottom({
            scrollTop: target.scrollTop,
            clientHeight: target.clientHeight,
            scrollHeight: target.scrollHeight
          });
          setScrollTop(target.scrollTop);
          setAutoScroll(atBottom);
        }}
      >
        {lines.length === 0 ? (
          <div className="empty-state">No terminal data received.</div>
        ) : (
          <div className="terminal-rows" style={{ paddingTop: virtualWindow.paddingTop }}>
            {visibleLines.map((line) => (
              <div
                className={`terminal-row ${line.direction}`}
                style={{ minHeight: rowHeight }}
                key={line.id}
              >
                {showTimestamps ? (
                  <span className="terminal-timestamp">
                    {formatTimestamp(line.timestampWallMs, timestampFormat)}
                  </span>
                ) : null}
                <span className="terminal-direction">{line.direction.toUpperCase()}</span>
                <span className={line.truncated ? "terminal-text truncated" : "terminal-text"}>
                  <HighlightedText
                    text={line.text}
                    highlights={highlightsByLineId[line.id] ?? []}
                  />
                </span>
              </div>
            ))}
            {virtualWindow.paddingBottom > 0 ? (
              <div style={{ height: virtualWindow.paddingBottom }} />
            ) : null}
          </div>
        )}
      </div>

      <div className="terminal-status" aria-label="Terminal status">
        <span>RX {status.receivedBytes} B</span>
        <span>Chars {status.characterCount}</span>
        <span>Rate {status.dataRateBytesPerSecond} B/s</span>
        <span>Retained {status.retainedBytes} B</span>
        <span>Dropped {status.droppedBytes} B</span>
        <span>Logged {status.loggedBytes} B</span>
        <span>Log dropped {status.droppedLogBytes} B</span>
      </div>
    </section>
  );
}

function HighlightedText({ text, highlights }: { text: string; highlights: LineHighlight[] }) {
  if (highlights.length === 0) {
    return text;
  }

  const sorted = [...highlights].sort(
    (left, right) =>
      left.start - right.start ||
      highlightPriority(left.ruleId) - highlightPriority(right.ruleId) ||
      left.end - right.end
  );
  const parts: ReactNode[] = [];
  let offset = 0;

  for (const highlight of sorted) {
    const start = Math.max(offset, Math.min(text.length, highlight.start));
    const end = Math.max(start, Math.min(text.length, highlight.end));

    if (start > offset) {
      parts.push(<span key={`text-${offset}`}>{text.slice(offset, start)}</span>);
    }

    if (end > start) {
      parts.push(
        <mark
          className="terminal-highlight"
          style={{ backgroundColor: highlight.color }}
          key={`${highlight.ruleId}-${start}-${end}`}
        >
          {text.slice(start, end)}
        </mark>
      );
      offset = end;
    }
  }

  if (offset < text.length) {
    parts.push(<span key={`text-${offset}`}>{text.slice(offset)}</span>);
  }

  return <>{parts}</>;
}

function highlightPriority(ruleId: string): number {
  if (ruleId === "search-active") {
    return 0;
  }

  if (ruleId === "search") {
    return 1;
  }

  return 2;
}
