import { useState, type RefObject } from "react";
import {
  MAX_HIGHLIGHT_RULES,
  MAX_PATTERN_LENGTH,
  type DisabledRuleWarning,
  type FilterAction,
  type FilterProfile,
  type FilterRule,
  type HighlightRule,
  type MatchMode
} from "./filterModel";

type HighlightDraft = {
  pattern: string;
  mode: MatchMode;
  color: string;
};

type FilterDraft = {
  pattern: string;
  mode: MatchMode;
  action: FilterAction;
};

export type FilterSearchPanelProps = {
  highlightRules: HighlightRule[];
  filterRules: FilterRule[];
  filterProfiles: FilterProfile[];
  warnings: DisabledRuleWarning[];
  searchQuery: string;
  searchMode: MatchMode;
  searchMatchCount: number;
  activeSearchIndex: number;
  showSearch?: boolean;
  sections?: Array<"profiles" | "highlights" | "filters">;
  searchInputRef?: RefObject<HTMLInputElement>;
  onAddHighlightRule: (rule: Omit<HighlightRule, "id" | "enabled">) => void;
  onToggleHighlightRule: (ruleId: string, enabled: boolean) => void;
  onDeleteHighlightRule: (ruleId: string) => void;
  onAddFilterRule: (rule: Omit<FilterRule, "id" | "enabled">) => void;
  onToggleFilterRule: (ruleId: string, enabled: boolean) => void;
  onDeleteFilterRule: (ruleId: string) => void;
  onSaveFilterProfile: (name: string) => void;
  onApplyFilterProfile: (profileId: string) => void;
  onDeleteFilterProfile: (profileId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSearchModeChange: (mode: MatchMode) => void;
  onSearchNext: () => void;
  onSearchPrevious: () => void;
};

const defaultHighlightDraft: HighlightDraft = {
  pattern: "",
  mode: "keyword",
  color: "#ffd166"
};

const defaultFilterDraft: FilterDraft = {
  pattern: "",
  mode: "keyword",
  action: "show"
};

export function FilterSearchPanel({
  highlightRules,
  filterRules,
  filterProfiles,
  warnings,
  searchQuery,
  searchMode,
  searchMatchCount,
  activeSearchIndex,
  showSearch = true,
  sections = ["profiles", "highlights", "filters"],
  searchInputRef,
  onAddHighlightRule,
  onToggleHighlightRule,
  onDeleteHighlightRule,
  onAddFilterRule,
  onToggleFilterRule,
  onDeleteFilterRule,
  onSaveFilterProfile,
  onApplyFilterProfile,
  onDeleteFilterProfile,
  onSearchQueryChange,
  onSearchModeChange,
  onSearchNext,
  onSearchPrevious
}: FilterSearchPanelProps) {
  const [highlightDraft, setHighlightDraft] = useState<HighlightDraft>(defaultHighlightDraft);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>(defaultFilterDraft);
  const [profileName, setProfileName] = useState("");
  const activeSearchPosition = activeSearchIndex >= 0 ? activeSearchIndex + 1 : 0;
  const canAddHighlight =
    highlightDraft.pattern.length > 0 &&
    highlightDraft.pattern.length <= MAX_PATTERN_LENGTH &&
    highlightRules.length < MAX_HIGHLIGHT_RULES;
  const canAddFilter =
    filterDraft.pattern.length > 0 && filterDraft.pattern.length <= MAX_PATTERN_LENGTH;
  const canSaveProfile =
    profileName.trim().length > 0 && (filterRules.length > 0 || highlightRules.length > 0);

  return (
    <section className="filter-panel" aria-label="Filters and search">
      {showSearch ? (
        <div className="filter-section">
          <h2>Search</h2>
          <div className="search-row">
            <input
              ref={searchInputRef}
              aria-label="Search terminal"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            />
            <select
              aria-label="Search mode"
              value={searchMode}
              onChange={(event) => onSearchModeChange(event.currentTarget.value as MatchMode)}
            >
              <option value="keyword">Text</option>
              <option value="regex">Regex</option>
            </select>
          </div>
          <div className="search-row">
            <button type="button" onClick={onSearchPrevious} disabled={searchMatchCount === 0}>
              Prev
            </button>
            <button type="button" onClick={onSearchNext} disabled={searchMatchCount === 0}>
              Next
            </button>
            <span className="filter-meta">
              {activeSearchPosition}/{searchMatchCount}
            </span>
          </div>
        </div>
      ) : null}

      {sections.includes("profiles") ? (
        <div className="filter-section">
          <h2>Profiles</h2>
          <div className="profile-draft">
            <input
              aria-label="Profile name"
              value={profileName}
              onChange={(event) => setProfileName(event.currentTarget.value)}
            />
            <button
              type="button"
              onClick={() => {
                onSaveFilterProfile(profileName);
                setProfileName("");
              }}
              disabled={!canSaveProfile}
            >
              Save
            </button>
          </div>
          {filterProfiles.length === 0 ? (
            <p className="rule-empty">No saved profiles</p>
          ) : (
            <div className="profile-list">
              {filterProfiles.map((profile) => (
                <div className="profile-item" key={profile.id}>
                  <span>{profile.name}</span>
                  <button type="button" onClick={() => onApplyFilterProfile(profile.id)}>
                    Apply
                  </button>
                  <button type="button" onClick={() => onDeleteFilterProfile(profile.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {sections.includes("highlights") ? (
        <div className="filter-section">
          <h2>Highlights</h2>
          <div className="rule-draft">
            <input
              aria-label="Highlight pattern"
              value={highlightDraft.pattern}
              maxLength={MAX_PATTERN_LENGTH + 1}
              onChange={(event) =>
                setHighlightDraft({ ...highlightDraft, pattern: event.currentTarget.value })
              }
            />
            <select
              aria-label="Highlight mode"
              value={highlightDraft.mode}
              onChange={(event) =>
                setHighlightDraft({
                  ...highlightDraft,
                  mode: event.currentTarget.value as MatchMode
                })
              }
            >
              <option value="keyword">Text</option>
              <option value="regex">Regex</option>
            </select>
            <input
              aria-label="Highlight color"
              type="color"
              value={highlightDraft.color}
              onChange={(event) =>
                setHighlightDraft({ ...highlightDraft, color: event.currentTarget.value })
              }
            />
            <button
              type="button"
              onClick={() => {
                onAddHighlightRule(highlightDraft);
                setHighlightDraft(defaultHighlightDraft);
              }}
              disabled={!canAddHighlight}
            >
              Add
            </button>
          </div>
          <RuleList
            rules={highlightRules}
            warnings={warnings}
            emptyText="No highlight rules"
            onToggle={onToggleHighlightRule}
            onDelete={onDeleteHighlightRule}
          />
        </div>
      ) : null}

      {sections.includes("filters") ? (
        <div className="filter-section">
          <h2>Filters</h2>
          <div className="rule-draft">
            <input
              aria-label="Filter pattern"
              value={filterDraft.pattern}
              maxLength={MAX_PATTERN_LENGTH + 1}
              onChange={(event) =>
                setFilterDraft({ ...filterDraft, pattern: event.currentTarget.value })
              }
            />
            <select
              aria-label="Filter action"
              value={filterDraft.action}
              onChange={(event) =>
                setFilterDraft({
                  ...filterDraft,
                  action: event.currentTarget.value as FilterAction
                })
              }
            >
              <option value="show">Show</option>
              <option value="suppress">Suppress</option>
            </select>
            <select
              aria-label="Filter mode"
              value={filterDraft.mode}
              onChange={(event) =>
                setFilterDraft({
                  ...filterDraft,
                  mode: event.currentTarget.value as MatchMode
                })
              }
            >
              <option value="keyword">Text</option>
              <option value="regex">Regex</option>
            </select>
            <button
              type="button"
              onClick={() => {
                onAddFilterRule(filterDraft);
                setFilterDraft(defaultFilterDraft);
              }}
              disabled={!canAddFilter}
            >
              Add
            </button>
          </div>
          <RuleList
            rules={filterRules}
            warnings={warnings}
            emptyText="No filter rules"
            onToggle={onToggleFilterRule}
            onDelete={onDeleteFilterRule}
          />
        </div>
      ) : null}
    </section>
  );
}

function RuleList({
  rules,
  warnings,
  emptyText,
  onToggle,
  onDelete
}: {
  rules: Array<HighlightRule | FilterRule>;
  warnings: DisabledRuleWarning[];
  emptyText: string;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onDelete: (ruleId: string) => void;
}) {
  if (rules.length === 0) {
    return <p className="rule-empty">{emptyText}</p>;
  }

  return (
    <div className="rule-list">
      {rules.map((rule) => {
        const warning = warnings.find((entry) => entry.ruleId === rule.id);
        return (
          <div className="rule-item" key={rule.id}>
            <label className="rule-toggle">
              <input
                type="checkbox"
                checked={rule.enabled && !warning}
                onChange={(event) => onToggle(rule.id, event.currentTarget.checked)}
              />
              <span>{rule.pattern}</span>
            </label>
            <span className="filter-meta">
              {"action" in rule ? `${rule.action} / ${rule.mode}` : rule.mode}
            </span>
            {warning ? <span className="rule-warning">{warning.message}</span> : null}
            <button type="button" onClick={() => onDelete(rule.id)}>
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
}
