import type { TerminalLine } from "../terminal";

export const MAX_PATTERN_LENGTH = 512;
export const MAX_HIGHLIGHT_RULES = 16;
export const FILTER_PROFILE_STORAGE_KEY = "multiserial.filterProfiles.v1";

export type MatchMode = "keyword" | "regex";
export type FilterAction = "show" | "suppress";

export type HighlightRule = {
  id: string;
  enabled: boolean;
  mode: MatchMode;
  pattern: string;
  color: string;
};

export type FilterRule = {
  id: string;
  enabled: boolean;
  mode: MatchMode;
  action: FilterAction;
  pattern: string;
};

export type FilterProfile = {
  id: string;
  name: string;
  filterRules: FilterRule[];
  highlightRules: HighlightRule[];
};

export type DisabledRuleWarning = {
  ruleId: string;
  message: string;
};

export type LineHighlight = {
  ruleId: string;
  color: string;
  start: number;
  end: number;
};

export type FilteredLine = {
  line: TerminalLine;
  highlights: LineHighlight[];
};

export type LineViewResult = {
  lines: FilteredLine[];
  warnings: DisabledRuleWarning[];
};

export type SearchMatch = {
  lineIndex: number;
  start: number;
  end: number;
};

export type SearchResult = {
  matches: SearchMatch[];
  activeIndex: number;
  warnings: DisabledRuleWarning[];
};

type CompiledMatcher = {
  ruleId: string;
  matches(text: string): boolean;
  ranges(text: string): Array<{ start: number; end: number }>;
};

export function validatePattern(pattern: string, mode: MatchMode): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Pattern exceeds ${MAX_PATTERN_LENGTH} characters.`;
  }

  if (pattern.length === 0) {
    return "Pattern cannot be empty.";
  }

  if (mode === "keyword") {
    return null;
  }

  if (hasUnsafeRegexConstruct(pattern)) {
    return "Regex rule disabled because the pattern is outside the safe subset.";
  }

  try {
    new RegExp(pattern, "gu");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function buildLineView(
  lines: readonly TerminalLine[],
  options: {
    filters?: readonly FilterRule[];
    highlights?: readonly HighlightRule[];
  }
): LineViewResult {
  const warnings: DisabledRuleWarning[] = [];
  const filters = compileFilterRules(options.filters ?? [], warnings);
  const highlights = compileHighlightRules(options.highlights ?? [], warnings);
  const result: FilteredLine[] = [];

  for (const line of lines) {
    if (!linePassesFilters(line.text, filters)) {
      continue;
    }

    result.push({
      line,
      highlights: collectHighlights(line.text, highlights)
    });
  }

  return { lines: result, warnings };
}

export function searchLines(
  lines: readonly TerminalLine[],
  options: {
    query: string;
    mode?: MatchMode;
    activeIndex?: number;
  }
): SearchResult {
  const warnings: DisabledRuleWarning[] = [];
  const mode = options.mode ?? "keyword";

  if (options.query.length === 0) {
    return { matches: [], activeIndex: -1, warnings };
  }

  const matcher = compileMatcher("search", mode, options.query, warnings);

  if (!matcher) {
    return { matches: [], activeIndex: -1, warnings };
  }

  const matches = lines.flatMap((line, lineIndex) =>
    matcher.ranges(line.text).map((range) => ({
      lineIndex,
      ...range
    }))
  );

  return {
    matches,
    activeIndex: normalizeActiveIndex(options.activeIndex ?? 0, matches.length),
    warnings
  };
}

export function nextSearchIndex(activeIndex: number, matchCount: number): number {
  return matchCount === 0 ? -1 : (Math.max(activeIndex, -1) + 1) % matchCount;
}

export function previousSearchIndex(activeIndex: number, matchCount: number): number {
  return matchCount === 0 ? -1 : (Math.max(activeIndex, 0) - 1 + matchCount) % matchCount;
}

export class FilterProfileStore {
  private readonly profiles = new Map<string, FilterProfile>();

  constructor(initialProfiles: readonly FilterProfile[] = []) {
    for (const profile of initialProfiles) {
      const normalized = normalizeFilterProfile(profile);
      this.profiles.set(normalized.id, normalized);
    }
  }

  list(): FilterProfile[] {
    return [...this.profiles.values()].map(copyFilterProfile);
  }

  upsert(profile: FilterProfile): FilterProfile {
    const normalized = normalizeFilterProfile(profile);
    this.profiles.set(normalized.id, normalized);
    return copyFilterProfile(normalized);
  }

  get(profileId: string): FilterProfile | null {
    const profile = this.profiles.get(profileId);
    return profile ? copyFilterProfile(profile) : null;
  }

  delete(profileId: string): boolean {
    return this.profiles.delete(profileId);
  }

  serialize(): FilterProfile[] {
    return this.list();
  }
}

export function createFilterProfile(fields: {
  id?: string;
  name: string;
  filterRules: readonly FilterRule[];
  highlightRules: readonly HighlightRule[];
}): FilterProfile {
  return normalizeFilterProfile({
    id: fields.id ?? createFilterProfileId(),
    name: fields.name,
    filterRules: [...fields.filterRules],
    highlightRules: [...fields.highlightRules]
  });
}

export function createFilterProfileId(now = Date.now()): string {
  return `filter-profile-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadFilterProfiles(storage: Storage | null): FilterProfile[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(FILTER_PROFILE_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return isFilterProfileList(parsed) ? parsed.map(normalizeFilterProfile) : [];
  } catch {
    return [];
  }
}

export function saveFilterProfiles(storage: Storage | null, profiles: readonly FilterProfile[]) {
  if (!storage) {
    return;
  }

  storage.setItem(FILTER_PROFILE_STORAGE_KEY, JSON.stringify(profiles.map(normalizeFilterProfile)));
}

function compileFilterRules(
  rules: readonly FilterRule[],
  warnings: DisabledRuleWarning[]
): Array<FilterRule & { matcher: CompiledMatcher }> {
  return rules.flatMap((rule) => {
    if (!rule.enabled) {
      return [];
    }

    const matcher = compileMatcher(rule.id, rule.mode, rule.pattern, warnings);
    return matcher ? [{ ...rule, matcher }] : [];
  });
}

function compileHighlightRules(
  rules: readonly HighlightRule[],
  warnings: DisabledRuleWarning[]
): Array<HighlightRule & { matcher: CompiledMatcher }> {
  return rules.slice(0, MAX_HIGHLIGHT_RULES).flatMap((rule) => {
    if (!rule.enabled) {
      return [];
    }

    const matcher = compileMatcher(rule.id, rule.mode, rule.pattern, warnings);
    return matcher ? [{ ...rule, matcher }] : [];
  });
}

function compileMatcher(
  ruleId: string,
  mode: MatchMode,
  pattern: string,
  warnings: DisabledRuleWarning[]
): CompiledMatcher | null {
  const validationError = validatePattern(pattern, mode);

  if (validationError) {
    warnings.push({ ruleId, message: validationError });
    return null;
  }

  if (mode === "keyword") {
    return keywordMatcher(ruleId, pattern);
  }

  return regexMatcher(ruleId, pattern);
}

function keywordMatcher(ruleId: string, pattern: string): CompiledMatcher {
  return {
    ruleId,
    matches: (text) => text.includes(pattern),
    ranges: (text) => {
      const ranges: Array<{ start: number; end: number }> = [];
      let offset = 0;

      while (offset <= text.length) {
        const start = text.indexOf(pattern, offset);

        if (start < 0) {
          break;
        }

        ranges.push({ start, end: start + pattern.length });
        offset = start + Math.max(pattern.length, 1);
      }

      return ranges;
    }
  };
}

function regexMatcher(ruleId: string, pattern: string): CompiledMatcher {
  return {
    ruleId,
    matches: (text) => new RegExp(pattern, "u").test(text),
    ranges: (text) => {
      const ranges: Array<{ start: number; end: number }> = [];

      for (const match of text.matchAll(new RegExp(pattern, "gu"))) {
        const value = match[0];
        const start = match.index ?? 0;

        if (value.length === 0) {
          continue;
        }

        ranges.push({ start, end: start + value.length });
      }

      return ranges;
    }
  };
}

function linePassesFilters(
  text: string,
  filters: Array<FilterRule & { matcher: CompiledMatcher }>
): boolean {
  const showRules = filters.filter((rule) => rule.action === "show");
  const suppressRules = filters.filter((rule) => rule.action === "suppress");

  if (suppressRules.some((rule) => rule.matcher.matches(text))) {
    return false;
  }

  if (showRules.length === 0) {
    return true;
  }

  return showRules.some((rule) => rule.matcher.matches(text));
}

function collectHighlights(
  text: string,
  highlights: Array<HighlightRule & { matcher: CompiledMatcher }>
): LineHighlight[] {
  return highlights.flatMap((rule) =>
    rule.matcher.ranges(text).map((range) => ({
      ruleId: rule.matcher.ruleId,
      color: rule.color,
      ...range
    }))
  );
}

function normalizeActiveIndex(activeIndex: number, matchCount: number): number {
  if (matchCount === 0) {
    return -1;
  }

  return Math.min(Math.max(activeIndex, 0), matchCount - 1);
}

function hasUnsafeRegexConstruct(pattern: string): boolean {
  return (
    /\\[1-9]/u.test(pattern) ||
    /\(\?<([=!]|[A-Za-z])/u.test(pattern) ||
    /\([^)]*[+*{][^)]*\)[+*{]/u.test(pattern) ||
    /\([^)]*\|[^)]*\)[+*{]/u.test(pattern)
  );
}

function normalizeFilterProfile(profile: FilterProfile): FilterProfile {
  return {
    id: profile.id,
    name: profile.name.trim() || "Filter profile",
    filterRules: profile.filterRules.map(copyFilterRule),
    highlightRules: profile.highlightRules.map(copyHighlightRule).slice(0, MAX_HIGHLIGHT_RULES)
  };
}

function copyFilterProfile(profile: FilterProfile): FilterProfile {
  return {
    id: profile.id,
    name: profile.name,
    filterRules: profile.filterRules.map(copyFilterRule),
    highlightRules: profile.highlightRules.map(copyHighlightRule)
  };
}

function copyFilterRule(rule: FilterRule): FilterRule {
  return {
    id: rule.id,
    enabled: rule.enabled,
    mode: rule.mode,
    action: rule.action,
    pattern: rule.pattern
  };
}

function copyHighlightRule(rule: HighlightRule): HighlightRule {
  return {
    id: rule.id,
    enabled: rule.enabled,
    mode: rule.mode,
    pattern: rule.pattern,
    color: rule.color
  };
}

function isFilterProfileList(value: unknown): value is FilterProfile[] {
  return Array.isArray(value) && value.every(isFilterProfile);
}

function isFilterProfile(value: unknown): value is FilterProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as FilterProfile;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.filterRules) &&
    candidate.filterRules.every(isFilterRule) &&
    Array.isArray(candidate.highlightRules) &&
    candidate.highlightRules.every(isHighlightRule)
  );
}

function isFilterRule(value: unknown): value is FilterRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as FilterRule;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.enabled === "boolean" &&
    (candidate.mode === "keyword" || candidate.mode === "regex") &&
    (candidate.action === "show" || candidate.action === "suppress") &&
    typeof candidate.pattern === "string"
  );
}

function isHighlightRule(value: unknown): value is HighlightRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as HighlightRule;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.enabled === "boolean" &&
    (candidate.mode === "keyword" || candidate.mode === "regex") &&
    typeof candidate.pattern === "string" &&
    typeof candidate.color === "string"
  );
}
