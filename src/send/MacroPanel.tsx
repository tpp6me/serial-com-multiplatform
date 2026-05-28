import type { SendMacro } from "./macroModel";
import type { LineEnding } from "./sendModel";

export type MacroDraft = {
  id: string | null;
  name: string;
  textInput: string;
  textLineEnding: LineEnding;
  hexInput: string;
  delayMs: number;
};

export type MacroPanelProps = {
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
};

export function MacroPanel({
  macros,
  draft,
  disabled,
  runningMacroId,
  automationIntervalMs,
  automationMacroId,
  droppedAutomatedSends,
  onDraftChange,
  onNew,
  onEdit,
  onSave,
  onDelete,
  onRun,
  onAutomationIntervalChange,
  onStartAutomation,
  onStopAllAutomations
}: MacroPanelProps) {
  return (
    <section className="macro-panel" aria-label="Macros">
      <div className="macro-actions">
        <button type="button" onClick={onNew} disabled={disabled}>
          New
        </button>
        <button type="button" onClick={onSave} disabled={disabled}>
          Save
        </button>
      </div>

      <label>
        Name
        <input
          aria-label="Macro name"
          value={draft.name}
          disabled={disabled}
          onChange={(event) => onDraftChange({ ...draft, name: event.currentTarget.value })}
        />
      </label>

      <label>
        Text
        <textarea
          aria-label="Macro text step"
          value={draft.textInput}
          rows={2}
          disabled={disabled}
          onChange={(event) => onDraftChange({ ...draft, textInput: event.currentTarget.value })}
        />
      </label>

      <label>
        Text ending
        <select
          aria-label="Macro text line ending"
          value={draft.textLineEnding}
          disabled={disabled}
          onChange={(event) =>
            onDraftChange({ ...draft, textLineEnding: event.currentTarget.value as LineEnding })
          }
        >
          <option value="none">NONE</option>
          <option value="cr">CR</option>
          <option value="lf">LF</option>
          <option value="crlf">CRLF</option>
        </select>
      </label>

      <label>
        Hex
        <input
          aria-label="Macro hex step"
          value={draft.hexInput}
          disabled={disabled}
          onChange={(event) => onDraftChange({ ...draft, hexInput: event.currentTarget.value })}
        />
      </label>

      <label>
        Delay ms
        <input
          aria-label="Macro delay milliseconds"
          type="number"
          min={0}
          step={1}
          value={draft.delayMs}
          disabled={disabled}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              delayMs: Math.max(0, event.currentTarget.valueAsNumber || 0)
            })
          }
        />
      </label>

      <div className="macro-list" role="list" aria-label="Saved macros">
        {macros.length === 0 ? (
          <div className="macro-empty">No macros saved.</div>
        ) : (
          macros.map((macro) => (
            <div className="macro-item" role="listitem" key={macro.id}>
              <button
                type="button"
                onClick={() => onRun(macro)}
                disabled={disabled || !!runningMacroId}
              >
                {runningMacroId === macro.id ? "Running" : macro.name}
              </button>
              <button
                type="button"
                onClick={() => onStartAutomation(macro)}
                disabled={disabled || !!automationMacroId}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => onEdit(macro)}
                disabled={disabled || !!runningMacroId}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(macro.id)}
                disabled={disabled || !!runningMacroId}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      <label>
        Interval ms
        <input
          aria-label="Automation interval milliseconds"
          type="number"
          min={50}
          step={10}
          value={automationIntervalMs}
          disabled={disabled || !!automationMacroId}
          onChange={(event) =>
            onAutomationIntervalChange(Math.max(0, event.currentTarget.valueAsNumber || 0))
          }
        />
      </label>

      {automationMacroId ? (
        <div className="automation-controls">
          <span>Dropped {droppedAutomatedSends}</span>
          <button type="button" onClick={onStopAllAutomations}>
            Stop all
          </button>
        </div>
      ) : null}
    </section>
  );
}
