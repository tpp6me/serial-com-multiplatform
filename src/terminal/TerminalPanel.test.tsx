import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TerminalPanel } from "./TerminalPanel";
import type { TerminalLine, TerminalSessionSnapshot } from ".";

function line(index: number, direction: TerminalLine["direction"] = "rx"): TerminalLine {
  const text = `line-${index.toString().padStart(3, "0")}`;
  const bytes = Uint8Array.from([...text].map((character) => character.charCodeAt(0)));

  return {
    id: `line-${index}`,
    firstSequence: index,
    lastSequence: index,
    timestampWallMs: Date.UTC(2026, 4, 28, 12, 0, 0, index),
    direction,
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

function snapshot(lines: TerminalLine[]): TerminalSessionSnapshot {
  const retainedBytes = lines.reduce(
    (total, terminalLine) => total + terminalLine.rawByteLength,
    0
  );

  return {
    sessionId: "session-a",
    chunks: lines.map((terminalLine) => ({
      sequence: terminalLine.firstSequence,
      timestampWallMs: terminalLine.timestampWallMs,
      bytes: terminalLine.bytes,
      byteLength: terminalLine.rawByteLength,
      direction: terminalLine.direction
    })),
    viewMode: "utf8",
    retainedBytes,
    receivedBytes: retainedBytes,
    droppedBytes: 0,
    lastUpdatedAtWallMs: lines.at(-1)?.timestampWallMs ?? null
  };
}

function renderPanel(overrides: Partial<Parameters<typeof TerminalPanel>[0]> = {}) {
  const lines = overrides.lines ?? Array.from({ length: 100 }, (_, index) => line(index));

  return render(
    <TerminalPanel
      snapshot={overrides.snapshot ?? snapshot(lines)}
      lines={lines}
      showTimestamps={overrides.showTimestamps ?? false}
      timestampFormat={overrides.timestampFormat ?? "iso"}
      wrapLines={overrides.wrapLines ?? true}
      onToggleTimestamps={overrides.onToggleTimestamps ?? vi.fn()}
      onTimestampFormatChange={overrides.onTimestampFormatChange ?? vi.fn()}
      onViewModeChange={overrides.onViewModeChange ?? vi.fn()}
      onToggleWrapLines={overrides.onToggleWrapLines ?? vi.fn()}
      onClear={overrides.onClear ?? vi.fn()}
      rowHeight={overrides.rowHeight ?? 20}
      viewportHeight={overrides.viewportHeight ?? 100}
      nowWallMs={overrides.nowWallMs ?? Date.UTC(2026, 4, 28, 12, 0, 1)}
      logCounters={overrides.logCounters}
      highlightsByLineId={overrides.highlightsByLineId}
    />
  );
}

describe("TerminalPanel", () => {
  it("renders a virtualized subset of terminal rows", () => {
    renderPanel();

    expect(screen.getByText("line-000")).toBeInTheDocument();
    expect(screen.getByText("line-010")).toBeInTheDocument();
    expect(screen.queryByText("line-050")).not.toBeInTheDocument();
  });

  it("shows timestamps with the configured format", () => {
    renderPanel({ lines: [line(1)], showTimestamps: true, timestampFormat: "iso" });

    expect(screen.getByText("2026-05-28T12:00:00.001Z")).toBeInTheDocument();
  });

  it("styles TX echo rows distinctly", () => {
    renderPanel({ lines: [line(1, "tx")] });

    expect(screen.getByText("TX")).toBeInTheDocument();
    expect(screen.getByText("line-001").closest(".terminal-row")).toHaveClass("tx");
  });

  it("renders highlighted terminal ranges", () => {
    renderPanel({
      lines: [line(1)],
      highlightsByLineId: {
        "line-1": [{ ruleId: "highlight-1", color: "#ffd166", start: 5, end: 8 }]
      }
    });

    const highlightedText = screen.getByText("001");
    expect(highlightedText.tagName).toBe("MARK");
    expect(highlightedText).toHaveClass("terminal-highlight");
  });

  it("toggles timestamp, wrap, timestamp format, and clear actions", () => {
    const onToggleTimestamps = vi.fn();
    const onTimestampFormatChange = vi.fn();
    const onViewModeChange = vi.fn();
    const onToggleWrapLines = vi.fn();
    const onClear = vi.fn();

    renderPanel({
      onToggleTimestamps,
      onTimestampFormatChange,
      onViewModeChange,
      onToggleWrapLines,
      onClear
    });

    fireEvent.click(screen.getByRole("button", { name: "Timestamps" }));
    fireEvent.change(screen.getByLabelText("Timestamp format"), { target: { value: "epochMs" } });
    fireEvent.change(screen.getByLabelText("Terminal view mode"), { target: { value: "hex" } });
    fireEvent.click(screen.getByRole("button", { name: "Wrap" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onToggleTimestamps).toHaveBeenCalledTimes(1);
    expect(onTimestampFormatChange).toHaveBeenCalledWith("epochMs");
    expect(onViewModeChange).toHaveBeenCalledWith("hex");
    expect(onToggleWrapLines).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("uses horizontal scroll mode when wrapping is disabled", () => {
    renderPanel({ wrapLines: false });

    expect(screen.getByRole("log")).toHaveClass("nowrap");
  });

  it("pauses auto-scroll when scrolled up and resumes at bottom", () => {
    renderPanel();

    const viewport = screen.getByRole("log");
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 100 });

    fireEvent.scroll(viewport, { target: { scrollTop: 100 } });
    expect(screen.getByText("Scroll paused")).toBeInTheDocument();

    fireEvent.scroll(viewport, { target: { scrollTop: 900 } });
    expect(screen.getByText("Auto-scroll")).toBeInTheDocument();
  });

  it("renders status bar byte, character, data-rate, and log counters", () => {
    const lines = [line(1), line(2)];

    renderPanel({
      lines,
      snapshot: snapshot(lines),
      logCounters: { loggedBytes: 11, droppedLogBytes: 3 },
      nowWallMs: Date.UTC(2026, 4, 28, 12, 0, 1)
    });

    const status = screen.getByLabelText("Terminal status");

    expect(within(status).getByText("RX 16 B")).toBeInTheDocument();
    expect(within(status).getByText("Chars 16")).toBeInTheDocument();
    expect(within(status).getByText("Rate 16 B/s")).toBeInTheDocument();
    expect(within(status).getByText("Logged 11 B")).toBeInTheDocument();
    expect(within(status).getByText("Log dropped 3 B")).toBeInTheDocument();
  });
});
