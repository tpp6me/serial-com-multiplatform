import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MacroPanel, type MacroDraft, type SendMacro } from ".";

const emptyDraft: MacroDraft = {
  id: null,
  name: "",
  textInput: "",
  textLineEnding: "none",
  hexInput: "",
  delayMs: 0
};

const macro: SendMacro = {
  id: "macro-1",
  name: "Handshake",
  steps: [
    { kind: "text", input: "AT", lineEnding: "crlf" },
    { kind: "hex", input: "00" },
    { kind: "delay", delayMs: 10 }
  ]
};

function renderMacroPanel(
  overrides: Partial<{
    macros: SendMacro[];
    draft: MacroDraft;
    disabled: boolean;
    runningMacroId: string | null;
    automationIntervalMs: number;
    automationMacroId: string | null;
    droppedAutomatedSends: number;
    onDraftChange: (draft: MacroDraft) => void;
    onNew: () => void;
    onEdit: (macro: SendMacro) => void;
    onSave: () => void;
    onDelete: (macroId: string) => void;
    onRun: (macro: SendMacro) => void;
    onAutomationIntervalChange: (intervalMs: number) => void;
    onStartAutomation: (macro: SendMacro) => void;
    onStopAllAutomations: () => void;
  }> = {}
) {
  return render(
    <MacroPanel
      macros={overrides.macros ?? [macro]}
      draft={overrides.draft ?? emptyDraft}
      disabled={overrides.disabled ?? false}
      runningMacroId={overrides.runningMacroId ?? null}
      automationIntervalMs={overrides.automationIntervalMs ?? 1000}
      automationMacroId={overrides.automationMacroId ?? null}
      droppedAutomatedSends={overrides.droppedAutomatedSends ?? 0}
      onDraftChange={overrides.onDraftChange ?? vi.fn()}
      onNew={overrides.onNew ?? vi.fn()}
      onEdit={overrides.onEdit ?? vi.fn()}
      onSave={overrides.onSave ?? vi.fn()}
      onDelete={overrides.onDelete ?? vi.fn()}
      onRun={overrides.onRun ?? vi.fn()}
      onAutomationIntervalChange={overrides.onAutomationIntervalChange ?? vi.fn()}
      onStartAutomation={overrides.onStartAutomation ?? vi.fn()}
      onStopAllAutomations={overrides.onStopAllAutomations ?? vi.fn()}
    />
  );
}

describe("MacroPanel", () => {
  it("renders saved macros and runs a macro", () => {
    const onRun = vi.fn();

    renderMacroPanel({ onRun });

    fireEvent.click(screen.getByRole("button", { name: "Handshake" }));

    expect(onRun).toHaveBeenCalledWith(macro);
  });

  it("creates and saves macro drafts", () => {
    const onNew = vi.fn();
    const onSave = vi.fn();
    const onDraftChange = vi.fn();

    renderMacroPanel({ macros: [], onNew, onSave, onDraftChange });

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.change(screen.getByLabelText("Macro name"), { target: { value: "Reset" } });
    fireEvent.change(screen.getByLabelText("Macro text step"), { target: { value: "RST" } });
    fireEvent.change(screen.getByLabelText("Macro text line ending"), {
      target: { value: "lf" }
    });
    fireEvent.change(screen.getByLabelText("Macro hex step"), { target: { value: "00 FF" } });
    fireEvent.change(screen.getByLabelText("Macro delay milliseconds"), {
      target: { value: "25" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onDraftChange).toHaveBeenCalledWith({ ...emptyDraft, name: "Reset" });
    expect(onDraftChange).toHaveBeenCalledWith({ ...emptyDraft, textInput: "RST" });
    expect(onDraftChange).toHaveBeenCalledWith({ ...emptyDraft, textLineEnding: "lf" });
    expect(onDraftChange).toHaveBeenCalledWith({ ...emptyDraft, hexInput: "00 FF" });
    expect(onDraftChange).toHaveBeenCalledWith({ ...emptyDraft, delayMs: 25 });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("edits and deletes macros", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderMacroPanel({ onEdit, onDelete });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onEdit).toHaveBeenCalledWith(macro);
    expect(onDelete).toHaveBeenCalledWith("macro-1");
  });

  it("shows running state for the active macro", () => {
    renderMacroPanel({ runningMacroId: "macro-1" });

    expect(screen.getByRole("button", { name: "Running" })).toBeDisabled();
  });

  it("starts and stops timed automation", () => {
    const onAutomationIntervalChange = vi.fn();
    const onStartAutomation = vi.fn();
    const onStopAllAutomations = vi.fn();

    renderMacroPanel({
      automationMacroId: "macro-1",
      droppedAutomatedSends: 3,
      onAutomationIntervalChange,
      onStartAutomation,
      onStopAllAutomations
    });

    expect(screen.getByText("Dropped 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop all" }));

    expect(onStopAllAutomations).toHaveBeenCalledTimes(1);
  });

  it("edits automation interval and starts automation", () => {
    const onAutomationIntervalChange = vi.fn();
    const onStartAutomation = vi.fn();

    renderMacroPanel({ onAutomationIntervalChange, onStartAutomation });

    fireEvent.change(screen.getByLabelText("Automation interval milliseconds"), {
      target: { value: "250" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));

    expect(onAutomationIntervalChange).toHaveBeenCalledWith(250);
    expect(onStartAutomation).toHaveBeenCalledWith(macro);
  });
});
