import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterSearchPanel } from "./FilterSearchPanel";
import type { FilterRule, HighlightRule } from "./filterModel";

const highlightRules: HighlightRule[] = [
  { id: "highlight-1", enabled: true, mode: "keyword", pattern: "ERR", color: "#ffd166" }
];

const filterRules: FilterRule[] = [
  { id: "filter-1", enabled: true, mode: "regex", action: "suppress", pattern: "^DBG" }
];

function renderPanel(overrides: Partial<Parameters<typeof FilterSearchPanel>[0]> = {}) {
  return render(
    <FilterSearchPanel
      highlightRules={overrides.highlightRules ?? highlightRules}
      filterRules={overrides.filterRules ?? filterRules}
      filterProfiles={overrides.filterProfiles ?? []}
      warnings={overrides.warnings ?? []}
      searchQuery={overrides.searchQuery ?? ""}
      searchMode={overrides.searchMode ?? "keyword"}
      searchMatchCount={overrides.searchMatchCount ?? 0}
      activeSearchIndex={overrides.activeSearchIndex ?? -1}
      searchInputRef={overrides.searchInputRef}
      onAddHighlightRule={overrides.onAddHighlightRule ?? vi.fn()}
      onToggleHighlightRule={overrides.onToggleHighlightRule ?? vi.fn()}
      onDeleteHighlightRule={overrides.onDeleteHighlightRule ?? vi.fn()}
      onAddFilterRule={overrides.onAddFilterRule ?? vi.fn()}
      onToggleFilterRule={overrides.onToggleFilterRule ?? vi.fn()}
      onDeleteFilterRule={overrides.onDeleteFilterRule ?? vi.fn()}
      onSaveFilterProfile={overrides.onSaveFilterProfile ?? vi.fn()}
      onApplyFilterProfile={overrides.onApplyFilterProfile ?? vi.fn()}
      onDeleteFilterProfile={overrides.onDeleteFilterProfile ?? vi.fn()}
      onSearchQueryChange={overrides.onSearchQueryChange ?? vi.fn()}
      onSearchModeChange={overrides.onSearchModeChange ?? vi.fn()}
      onSearchNext={overrides.onSearchNext ?? vi.fn()}
      onSearchPrevious={overrides.onSearchPrevious ?? vi.fn()}
    />
  );
}

describe("FilterSearchPanel", () => {
  it("updates search query, mode, and navigation", () => {
    const onSearchQueryChange = vi.fn();
    const onSearchModeChange = vi.fn();
    const onSearchNext = vi.fn();
    const onSearchPrevious = vi.fn();

    renderPanel({
      searchQuery: "ERR",
      searchMatchCount: 3,
      activeSearchIndex: 1,
      onSearchQueryChange,
      onSearchModeChange,
      onSearchNext,
      onSearchPrevious
    });

    fireEvent.change(screen.getByLabelText("Search terminal"), { target: { value: "WARN" } });
    fireEvent.change(screen.getByLabelText("Search mode"), { target: { value: "regex" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));

    expect(onSearchQueryChange).toHaveBeenCalledWith("WARN");
    expect(onSearchModeChange).toHaveBeenCalledWith("regex");
    expect(onSearchNext).toHaveBeenCalledTimes(1);
    expect(onSearchPrevious).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("adds highlight and filter rules from draft fields", () => {
    const onAddHighlightRule = vi.fn();
    const onAddFilterRule = vi.fn();

    renderPanel({ highlightRules: [], filterRules: [], onAddHighlightRule, onAddFilterRule });

    fireEvent.change(screen.getByLabelText("Highlight pattern"), { target: { value: "READY" } });
    fireEvent.change(screen.getByLabelText("Highlight mode"), { target: { value: "regex" } });
    fireEvent.change(screen.getByLabelText("Highlight color"), { target: { value: "#00ff00" } });
    fireEvent.click(
      within(screen.getByText("Highlights").closest(".filter-section")!).getByText("Add")
    );

    fireEvent.change(screen.getByLabelText("Filter pattern"), { target: { value: "DBG" } });
    fireEvent.change(screen.getByLabelText("Filter action"), { target: { value: "suppress" } });
    fireEvent.change(screen.getByLabelText("Filter mode"), { target: { value: "regex" } });
    fireEvent.click(
      within(screen.getByText("Filters").closest(".filter-section")!).getByText("Add")
    );

    expect(onAddHighlightRule).toHaveBeenCalledWith({
      pattern: "READY",
      mode: "regex",
      color: "#00ff00"
    });
    expect(onAddFilterRule).toHaveBeenCalledWith({
      pattern: "DBG",
      mode: "regex",
      action: "suppress"
    });
  });

  it("toggles, deletes, and shows disabled-rule warnings", () => {
    const onToggleFilterRule = vi.fn();
    const onDeleteFilterRule = vi.fn();

    renderPanel({
      warnings: [{ ruleId: "filter-1", message: "Regex rule disabled." }],
      onToggleFilterRule,
      onDeleteFilterRule
    });

    const filterRule = screen.getByText("^DBG").closest(".rule-item") as HTMLElement;
    fireEvent.click(within(filterRule).getByRole("checkbox"));
    fireEvent.click(within(filterRule).getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Regex rule disabled.")).toBeInTheDocument();
    expect(onToggleFilterRule).toHaveBeenCalledWith("filter-1", true);
    expect(onDeleteFilterRule).toHaveBeenCalledWith("filter-1");
  });

  it("saves, applies, and deletes filter profiles", () => {
    const onSaveFilterProfile = vi.fn();
    const onApplyFilterProfile = vi.fn();
    const onDeleteFilterProfile = vi.fn();

    renderPanel({
      filterProfiles: [
        {
          id: "profile-1",
          name: "Errors",
          filterRules,
          highlightRules
        }
      ],
      onSaveFilterProfile,
      onApplyFilterProfile,
      onDeleteFilterProfile
    });

    fireEvent.change(screen.getByLabelText("Profile name"), { target: { value: "Warnings" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const profile = screen.getByText("Errors").closest(".profile-item") as HTMLElement;
    fireEvent.click(within(profile).getByRole("button", { name: "Apply" }));
    fireEvent.click(within(profile).getByRole("button", { name: "Delete" }));

    expect(onSaveFilterProfile).toHaveBeenCalledWith("Warnings");
    expect(onApplyFilterProfile).toHaveBeenCalledWith("profile-1");
    expect(onDeleteFilterProfile).toHaveBeenCalledWith("profile-1");
  });
});
