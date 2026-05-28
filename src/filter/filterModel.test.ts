import { describe, expect, it } from "vitest";
import {
  buildLineView,
  createFilterProfile,
  FILTER_PROFILE_STORAGE_KEY,
  FilterProfileStore,
  MAX_HIGHLIGHT_RULES,
  loadFilterProfiles,
  nextSearchIndex,
  previousSearchIndex,
  saveFilterProfiles,
  searchLines,
  validatePattern,
  type FilterRule,
  type HighlightRule
} from ".";
import type { TerminalLine } from "../terminal";

function line(id: string, text: string): TerminalLine {
  const bytes = new TextEncoder().encode(text);

  return {
    id,
    firstSequence: Number(id),
    lastSequence: Number(id),
    timestampWallMs: 1_700_000_000_000 + Number(id),
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

describe("filter model", () => {
  it("rejects overlong and unsafe regex patterns", () => {
    expect(validatePattern("x".repeat(513), "keyword")).toContain("512");
    expect(validatePattern("(a+)+$", "regex")).toContain("safe subset");
    expect(validatePattern("(a|aa)+$", "regex")).toContain("safe subset");
    expect(validatePattern("(ok", "regex")).toContain("Unterminated");
  });

  it("disables offending rules and returns warnings", () => {
    const view = buildLineView([line("1", "aaaa")], {
      filters: [{ id: "bad", enabled: true, mode: "regex", action: "show", pattern: "(a+)+$" }]
    });

    expect(view.lines).toHaveLength(1);
    expect(view.warnings).toEqual([
      {
        ruleId: "bad",
        message: "Regex rule disabled because the pattern is outside the safe subset."
      }
    ]);
  });

  it("highlights by keyword and regex with configured colors", () => {
    const highlights: HighlightRule[] = [
      { id: "kw", enabled: true, mode: "keyword", pattern: "ERR", color: "#ff0000" },
      { id: "rx", enabled: true, mode: "regex", pattern: "\\d+", color: "#00ff00" }
    ];

    const view = buildLineView([line("1", "ERR 42")], { highlights });

    expect(view.lines[0].highlights).toEqual([
      { ruleId: "kw", color: "#ff0000", start: 0, end: 3 },
      { ruleId: "rx", color: "#00ff00", start: 4, end: 6 }
    ]);
  });

  it("enforces the 16-rule highlight limit", () => {
    const highlights = Array.from({ length: MAX_HIGHLIGHT_RULES + 1 }, (_, index) => ({
      id: `rule-${index}`,
      enabled: true,
      mode: "keyword" as const,
      pattern: "x",
      color: `#${index.toString(16).padStart(6, "0")}`
    }));

    const view = buildLineView([line("1", "x")], { highlights });

    expect(view.lines[0].highlights).toHaveLength(MAX_HIGHLIGHT_RULES);
  });

  it("supports show-only and suppress filters for keywords and regex", () => {
    const lines = [line("1", "INFO boot"), line("2", "ERR failed"), line("3", "DEBUG retry")];
    const filters: FilterRule[] = [
      { id: "show", enabled: true, mode: "regex", action: "show", pattern: "INFO|ERR" },
      { id: "suppress", enabled: true, mode: "keyword", action: "suppress", pattern: "INFO" }
    ];

    const view = buildLineView(lines, { filters });

    expect(view.lines.map((entry) => entry.line.text)).toEqual(["ERR failed"]);
  });

  it("does not mutate the line index or raw line bytes", () => {
    const sourceLines = [line("1", "ERR raw")];
    const originalBytes = [...sourceLines[0].bytes];

    buildLineView(sourceLines, {
      filters: [{ id: "f", enabled: true, mode: "keyword", action: "show", pattern: "ERR" }],
      highlights: [{ id: "h", enabled: true, mode: "keyword", pattern: "ERR", color: "#ff0000" }]
    });

    expect(sourceLines[0].text).toBe("ERR raw");
    expect([...sourceLines[0].bytes]).toEqual(originalBytes);
  });

  it("searches current line index and navigates matches", () => {
    const result = searchLines([line("1", "abc abc"), line("2", "xyz abc")], {
      query: "abc",
      activeIndex: 1
    });

    expect(result.matches).toEqual([
      { lineIndex: 0, start: 0, end: 3 },
      { lineIndex: 0, start: 4, end: 7 },
      { lineIndex: 1, start: 4, end: 7 }
    ]);
    expect(result.activeIndex).toBe(1);
    expect(nextSearchIndex(1, result.matches.length)).toBe(2);
    expect(previousSearchIndex(0, result.matches.length)).toBe(2);
  });

  it("updates match count as new data arrives while preserving active index", () => {
    const first = searchLines([line("1", "abc")], { query: "abc", activeIndex: 0 });
    const second = searchLines([line("1", "abc"), line("2", "abc")], {
      query: "abc",
      activeIndex: first.activeIndex
    });

    expect(first.matches).toHaveLength(1);
    expect(second.matches).toHaveLength(2);
    expect(second.activeIndex).toBe(0);
  });

  it("benchmarks filtering and searching 100k lines", () => {
    const lines = Array.from({ length: 100_000 }, (_, index) =>
      line(index.toString(), index % 10 === 0 ? "ERR high rate" : "INFO high rate")
    );
    const startedAt = performance.now();
    const view = buildLineView(lines, {
      filters: [{ id: "show-err", enabled: true, mode: "keyword", action: "show", pattern: "ERR" }],
      highlights: [{ id: "h", enabled: true, mode: "keyword", pattern: "ERR", color: "#ff0000" }]
    });
    const search = searchLines(
      view.lines.map((entry) => entry.line),
      { query: "ERR" }
    );
    const elapsedMs = performance.now() - startedAt;

    expect(view.lines).toHaveLength(10_000);
    expect(search.matches).toHaveLength(10_000);
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it("stores and persists named filter profiles", () => {
    const storage = new MemoryStorage();
    const profile = createFilterProfile({
      id: "profile-1",
      name: "  Errors  ",
      filterRules: [
        { id: "filter-1", enabled: true, mode: "keyword", action: "show", pattern: "ERR" }
      ],
      highlightRules: [
        { id: "highlight-1", enabled: true, mode: "keyword", pattern: "ERR", color: "#ff0000" }
      ]
    });
    const store = new FilterProfileStore();

    store.upsert(profile);
    saveFilterProfiles(storage, store.serialize());

    expect(store.list()[0].name).toBe("Errors");
    expect(store.get("profile-1")).toEqual(profile);
    expect(loadFilterProfiles(storage)).toEqual([profile]);
    expect(JSON.parse(storage.getItem(FILTER_PROFILE_STORAGE_KEY) ?? "[]")).toEqual([profile]);
    expect(store.delete("profile-1")).toBe(true);
    expect(store.list()).toEqual([]);
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
