import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SendBar } from ".";
import type { LineEnding, SendMode } from ".";

function renderSendBar(
  overrides: Partial<{
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
  }> = {}
) {
  return render(
    <SendBar
      value={overrides.value ?? ""}
      mode={overrides.mode ?? "text"}
      lineEnding={overrides.lineEnding ?? "none"}
      echoTx={overrides.echoTx ?? true}
      disabled={overrides.disabled ?? false}
      error={overrides.error ?? null}
      sending={overrides.sending ?? false}
      selectedFileName={overrides.selectedFileName ?? null}
      fileSendProgress={overrides.fileSendProgress ?? null}
      fileSending={overrides.fileSending ?? false}
      onValueChange={overrides.onValueChange ?? vi.fn()}
      onModeChange={overrides.onModeChange ?? vi.fn()}
      onLineEndingChange={overrides.onLineEndingChange ?? vi.fn()}
      onEchoTxChange={overrides.onEchoTxChange ?? vi.fn()}
      onSend={overrides.onSend ?? vi.fn()}
      onHistoryPrevious={overrides.onHistoryPrevious ?? vi.fn()}
      onHistoryNext={overrides.onHistoryNext ?? vi.fn()}
      onFileSelected={overrides.onFileSelected ?? vi.fn()}
      onSendFile={overrides.onSendFile ?? vi.fn()}
      onCancelFileSend={overrides.onCancelFileSend ?? vi.fn()}
    />
  );
}

describe("SendBar", () => {
  it("edits send input and sends on Enter", () => {
    const onValueChange = vi.fn();
    const onSend = vi.fn();

    renderSendBar({ onValueChange, onSend });

    const input = screen.getByLabelText("Send text");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("hello");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("allows Shift+Enter to insert a newline without sending", () => {
    const onSend = vi.fn();

    renderSendBar({ onSend });

    fireEvent.keyDown(screen.getByLabelText("Send text"), { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it("navigates command history with Up and Down", () => {
    const onHistoryPrevious = vi.fn();
    const onHistoryNext = vi.fn();

    renderSendBar({ onHistoryPrevious, onHistoryNext });

    const input = screen.getByLabelText("Send text");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(onHistoryPrevious).toHaveBeenCalledTimes(1);
    expect(onHistoryNext).toHaveBeenCalledTimes(1);
  });

  it("toggles hex mode, line ending, and TX echo", () => {
    const onModeChange = vi.fn();
    const onLineEndingChange = vi.fn();
    const onEchoTxChange = vi.fn();

    renderSendBar({ onModeChange, onLineEndingChange, onEchoTxChange });

    fireEvent.click(screen.getByRole("button", { name: "Hex" }));
    fireEvent.change(screen.getByLabelText("Line ending"), { target: { value: "crlf" } });
    fireEvent.click(screen.getByLabelText("Echo TX"));

    expect(onModeChange).toHaveBeenCalledWith("hex");
    expect(onLineEndingChange).toHaveBeenCalledWith("crlf");
    expect(onEchoTxChange).toHaveBeenCalledWith(false);
  });

  it("shows inline validation errors", () => {
    renderSendBar({ error: "Hex input must contain complete byte pairs." });

    expect(screen.getByRole("alert")).toHaveTextContent("complete byte pairs");
  });

  it("selects, sends, and cancels file transfer", () => {
    const onFileSelected = vi.fn();
    const onSendFile = vi.fn();
    const onCancelFileSend = vi.fn();
    const file = new File([Uint8Array.of(0x41)], "payload.bin");

    const { rerender } = renderSendBar({
      onFileSelected,
      onSendFile,
      selectedFileName: "payload.bin"
    });

    fireEvent.change(screen.getByLabelText("Choose file to send"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Send file" }));

    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(onSendFile).toHaveBeenCalledTimes(1);

    rerender(
      <SendBar
        value=""
        mode="text"
        lineEnding="none"
        echoTx
        disabled={false}
        error={null}
        sending={false}
        selectedFileName="payload.bin"
        fileSendProgress={50}
        fileSending
        onValueChange={vi.fn()}
        onModeChange={vi.fn()}
        onLineEndingChange={vi.fn()}
        onEchoTxChange={vi.fn()}
        onSend={vi.fn()}
        onHistoryPrevious={vi.fn()}
        onHistoryNext={vi.fn()}
        onFileSelected={vi.fn()}
        onSendFile={vi.fn()}
        onCancelFileSend={onCancelFileSend}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("File send progress")).toHaveValue(50);
    expect(onCancelFileSend).toHaveBeenCalledTimes(1);
  });

  it("allows choosing a file before a serial connection is active", () => {
    const onFileSelected = vi.fn();
    const file = new File([Uint8Array.of(0x41)], "payload.bin");

    renderSendBar({ disabled: true, onFileSelected, selectedFileName: "payload.bin" });

    fireEvent.change(screen.getByLabelText("Choose file to send"), { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(screen.getByRole("button", { name: "Choose file" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Send file" })).toBeDisabled();
  });
});
