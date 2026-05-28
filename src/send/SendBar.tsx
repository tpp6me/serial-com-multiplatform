import type { KeyboardEvent } from "react";
import { LINE_ENDINGS, type LineEnding, type SendMode } from "./sendModel";

export type SendBarProps = {
  value: string;
  mode: SendMode;
  lineEnding: LineEnding;
  echoTx: boolean;
  disabled: boolean;
  error: string | null;
  sending: boolean;
  selectedFileName: string | null;
  fileSendProgress: number | null;
  fileSending: boolean;
  onValueChange: (value: string) => void;
  onModeChange: (mode: SendMode) => void;
  onLineEndingChange: (lineEnding: LineEnding) => void;
  onEchoTxChange: (enabled: boolean) => void;
  onSend: () => void;
  onHistoryPrevious: () => void;
  onHistoryNext: () => void;
  onFileSelected: (file: File | null) => void;
  onSendFile: () => void;
  onCancelFileSend: () => void;
};

export function SendBar({
  value,
  mode,
  lineEnding,
  echoTx,
  disabled,
  error,
  sending,
  selectedFileName,
  fileSendProgress,
  fileSending,
  onValueChange,
  onModeChange,
  onLineEndingChange,
  onEchoTxChange,
  onSend,
  onHistoryPrevious,
  onHistoryNext,
  onFileSelected,
  onSendFile,
  onCancelFileSend
}: SendBarProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "ArrowUp" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onHistoryPrevious();
      return;
    }

    if (event.key === "ArrowDown" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onHistoryNext();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    onSend();
  };

  return (
    <section className="send-bar" aria-label="Send data">
      <div className="send-controls">
        <button
          type="button"
          aria-pressed={mode === "text"}
          onClick={() => onModeChange("text")}
          disabled={disabled || sending || fileSending}
        >
          Text
        </button>
        <button
          type="button"
          aria-pressed={mode === "hex"}
          onClick={() => onModeChange("hex")}
          disabled={disabled || sending || fileSending}
        >
          Hex
        </button>
        <select
          aria-label="Line ending"
          value={lineEnding}
          disabled={disabled || sending || fileSending || mode === "hex"}
          onChange={(event) => onLineEndingChange(event.currentTarget.value as LineEnding)}
        >
          {LINE_ENDINGS.map((ending) => (
            <option value={ending} key={ending}>
              {ending.toUpperCase()}
            </option>
          ))}
        </select>
        <label className="send-checkbox">
          <input
            type="checkbox"
            checked={echoTx}
            disabled={disabled || sending || fileSending}
            onChange={(event) => onEchoTxChange(event.currentTarget.checked)}
          />
          Echo TX
        </label>
      </div>
      <textarea
        aria-label={mode === "hex" ? "Send hex" : "Send text"}
        placeholder={mode === "hex" ? "48 45 4C 4C 4F" : "Send data"}
        value={value}
        disabled={disabled || sending || fileSending}
        rows={2}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <button type="button" disabled={disabled || sending || fileSending} onClick={onSend}>
        {sending ? "Sending" : "Send"}
      </button>
      <div className="file-send-controls">
        <label className="file-picker">
          File
          <input
            aria-label="Choose file to send"
            type="file"
            disabled={disabled || sending || fileSending}
            onChange={(event) => onFileSelected(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        <span className="file-name">{selectedFileName ?? "No file selected"}</span>
        {fileSending ? (
          <button type="button" onClick={onCancelFileSend}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || sending || !selectedFileName}
            onClick={onSendFile}
          >
            Send file
          </button>
        )}
        {fileSendProgress === null ? null : (
          <progress aria-label="File send progress" value={fileSendProgress} max={100} />
        )}
      </div>
      {error ? (
        <div className="send-error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
