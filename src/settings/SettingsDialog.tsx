import { useEffect, useState, type ReactNode } from "react";
import {
  SHORTCUT_DEFINITIONS,
  validateShortcutBindings,
  type ShortcutBindings
} from "../shortcuts";
import { validateSettings, type AppSettings } from "./settingsModel";

export type SettingsDialogProps = {
  open: boolean;
  settings: AppSettings;
  shortcuts: ShortcutBindings;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (settings: AppSettings, shortcuts: ShortcutBindings) => void;
};

export function SettingsDialog({
  open,
  settings,
  shortcuts,
  saving,
  error,
  onClose,
  onSave
}: SettingsDialogProps) {
  const [draft, setDraft] = useState(settings);
  const [shortcutDraft, setShortcutDraft] = useState(shortcuts);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setShortcutDraft(shortcuts);
      setValidationErrors([]);
    }
  }, [open, settings, shortcuts]);

  if (!open) {
    return null;
  }

  const saveDraft = () => {
    const validation = validateSettings(draft);
    const shortcutValidation = validateShortcutBindings(shortcutDraft);

    if (!validation.ok || !shortcutValidation.ok) {
      setValidationErrors([
        ...(validation.ok ? [] : validation.errors),
        ...(shortcutValidation.ok ? [] : shortcutValidation.errors)
      ]);
      return;
    }

    setValidationErrors([]);
    onSave(validation.value, shortcutValidation.value);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Global defaults for serial sessions and application behavior.</p>
          </div>
          <button type="button" aria-label="Close settings" onClick={onClose}>
            x
          </button>
        </header>

        <div className="settings-content">
          <SettingsSection title="Connection">
            <NumberField
              label="Default baud rate"
              value={draft.connection.defaultBaudRate}
              onChange={(defaultBaudRate) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, defaultBaudRate }
                })
              }
            />
            <SelectField
              label="Data bits"
              value={String(draft.connection.defaultDataBits)}
              options={["5", "6", "7", "8"]}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, defaultDataBits: Number(value) }
                })
              }
            />
            <SelectField
              label="Parity"
              value={draft.connection.defaultParity}
              options={["none", "even", "odd"]}
              onChange={(defaultParity) =>
                setDraft({
                  ...draft,
                  connection: {
                    ...draft.connection,
                    defaultParity: defaultParity as AppSettings["connection"]["defaultParity"]
                  }
                })
              }
            />
            <SelectField
              label="Stop bits"
              value={String(draft.connection.defaultStopBits)}
              options={["1", "1.5", "2"]}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  connection: {
                    ...draft.connection,
                    defaultStopBits: Number(value) as AppSettings["connection"]["defaultStopBits"]
                  }
                })
              }
            />
            <SelectField
              label="Flow control"
              title="Flow control selects none, software XON/XOFF, or hardware RTS/CTS for new serial connections."
              value={draft.connection.defaultFlowControl}
              options={["none", "software", "hardware"]}
              onChange={(defaultFlowControl) =>
                setDraft({
                  ...draft,
                  connection: {
                    ...draft.connection,
                    defaultFlowControl:
                      defaultFlowControl as AppSettings["connection"]["defaultFlowControl"]
                  }
                })
              }
            />
            <NumberField
              label="Reconnect retries"
              value={draft.connection.reconnectMaxRetries}
              onChange={(reconnectMaxRetries) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, reconnectMaxRetries }
                })
              }
            />
            <NumberField
              label="Reconnect backoff ms"
              value={draft.connection.reconnectBackoffMs}
              onChange={(reconnectBackoffMs) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, reconnectBackoffMs }
                })
              }
            />
            <CheckboxField
              label="Auto-connect on launch"
              checked={draft.connection.autoConnectOnLaunch}
              onChange={(autoConnectOnLaunch) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, autoConnectOnLaunch }
                })
              }
            />
            <CheckboxField
              label="Remember per device"
              checked={draft.connection.rememberPerDevice}
              onChange={(rememberPerDevice) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, rememberPerDevice }
                })
              }
            />
            <CheckboxField
              label="Reconnect on hotplug"
              checked={draft.connection.reconnectOnHotplug}
              onChange={(reconnectOnHotplug) =>
                setDraft({
                  ...draft,
                  connection: { ...draft.connection, reconnectOnHotplug }
                })
              }
            />
          </SettingsSection>

          <SettingsSection title="Display">
            <SelectField
              label="Theme"
              value={draft.display.theme}
              options={["system", "light", "dark"]}
              onChange={(theme) =>
                setDraft({
                  ...draft,
                  display: { ...draft.display, theme: theme as AppSettings["display"]["theme"] }
                })
              }
            />
            <SelectField
              label="Default view"
              value={draft.display.viewMode}
              options={["ascii", "utf8", "hex"]}
              onChange={(viewMode) =>
                setDraft({
                  ...draft,
                  display: {
                    ...draft.display,
                    viewMode: viewMode as AppSettings["display"]["viewMode"]
                  }
                })
              }
            />
            <TextField
              label="Terminal font"
              value={draft.display.fontFamily}
              onChange={(fontFamily) =>
                setDraft({ ...draft, display: { ...draft.display, fontFamily } })
              }
            />
            <NumberField
              label="Terminal font size"
              value={draft.display.fontSize}
              onChange={(fontSize) =>
                setDraft({ ...draft, display: { ...draft.display, fontSize } })
              }
            />
            <NumberField
              label="Scrollback lines"
              value={draft.display.scrollbackLines}
              onChange={(scrollbackLines) =>
                setDraft({ ...draft, display: { ...draft.display, scrollbackLines } })
              }
            />
            <CheckboxField
              label="Show timestamps"
              checked={draft.display.timestampEnabled}
              onChange={(timestampEnabled) =>
                setDraft({ ...draft, display: { ...draft.display, timestampEnabled } })
              }
            />
            <SelectField
              label="Timestamp format"
              value={draft.display.timestampFormat}
              options={["time", "iso", "epochMs"]}
              onChange={(timestampFormat) =>
                setDraft({
                  ...draft,
                  display: {
                    ...draft.display,
                    timestampFormat: timestampFormat as AppSettings["display"]["timestampFormat"]
                  }
                })
              }
            />
            <SelectField
              label="Newline mode"
              value={draft.display.newlineMode}
              options={["lf", "crlf", "cr"]}
              onChange={(newlineMode) =>
                setDraft({
                  ...draft,
                  display: {
                    ...draft.display,
                    newlineMode: newlineMode as AppSettings["display"]["newlineMode"]
                  }
                })
              }
            />
            <NumberField
              label="Partial line timeout ms"
              value={draft.display.partialLineTimeoutMs}
              onChange={(partialLineTimeoutMs) =>
                setDraft({ ...draft, display: { ...draft.display, partialLineTimeoutMs } })
              }
            />
            <CheckboxField
              label="Wrap lines"
              checked={draft.display.lineWrap}
              onChange={(lineWrap) =>
                setDraft({ ...draft, display: { ...draft.display, lineWrap } })
              }
            />
          </SettingsSection>

          <SettingsSection title="Logging">
            <CheckboxField
              label="Auto-log on connect"
              checked={draft.logging.autoLogOnConnect}
              onChange={(autoLogOnConnect) =>
                setDraft({ ...draft, logging: { ...draft.logging, autoLogOnConnect } })
              }
            />
            <TextField
              label="Log directory"
              value={draft.logging.logDirectory}
              onChange={(logDirectory) =>
                setDraft({ ...draft, logging: { ...draft.logging, logDirectory } })
              }
            />
            <TextField
              label="Filename template"
              value={draft.logging.filenameTemplate}
              onChange={(filenameTemplate) =>
                setDraft({ ...draft, logging: { ...draft.logging, filenameTemplate } })
              }
            />
            <SelectField
              label="Log format"
              value={draft.logging.logFormat}
              options={["plaintext", "timestamped-text", "binary"]}
              onChange={(logFormat) =>
                setDraft({
                  ...draft,
                  logging: {
                    ...draft.logging,
                    logFormat: logFormat as AppSettings["logging"]["logFormat"]
                  }
                })
              }
            />
            <CheckboxField
              label="Append mode"
              checked={draft.logging.appendMode}
              onChange={(appendMode) =>
                setDraft({ ...draft, logging: { ...draft.logging, appendMode } })
              }
            />
            <NumberField
              label="Rotation size MB"
              value={draft.logging.rotationSizeMb}
              onChange={(rotationSizeMb) =>
                setDraft({ ...draft, logging: { ...draft.logging, rotationSizeMb } })
              }
            />
            <SelectField
              label="Rotation period"
              value={draft.logging.rotationPeriod}
              options={["none", "hourly", "daily"]}
              onChange={(rotationPeriod) =>
                setDraft({
                  ...draft,
                  logging: {
                    ...draft.logging,
                    rotationPeriod: rotationPeriod as AppSettings["logging"]["rotationPeriod"]
                  }
                })
              }
            />
            <NumberField
              label="Max files to keep"
              value={draft.logging.maxFilesToKeep}
              onChange={(maxFilesToKeep) =>
                setDraft({ ...draft, logging: { ...draft.logging, maxFilesToKeep } })
              }
            />
          </SettingsSection>

          <SettingsSection title="Send">
            <SelectField
              label="Default line ending"
              value={draft.send.defaultLineEnding}
              options={["none", "lf", "crlf", "cr"]}
              onChange={(defaultLineEnding) =>
                setDraft({
                  ...draft,
                  send: {
                    ...draft.send,
                    defaultLineEnding: defaultLineEnding as AppSettings["send"]["defaultLineEnding"]
                  }
                })
              }
            />
            <CheckboxField
              label="Echo TX"
              checked={draft.send.echoTx}
              onChange={(echoTx) => setDraft({ ...draft, send: { ...draft.send, echoTx } })}
            />
            <NumberField
              label="History size"
              value={draft.send.historySize}
              onChange={(historySize) =>
                setDraft({ ...draft, send: { ...draft.send, historySize } })
              }
            />
            <NumberField
              label="File chunk bytes"
              value={draft.send.fileSendChunkBytes}
              onChange={(fileSendChunkBytes) =>
                setDraft({ ...draft, send: { ...draft.send, fileSendChunkBytes } })
              }
            />
            <NumberField
              label="File pacing ms"
              value={draft.send.fileSendPacingMs}
              onChange={(fileSendPacingMs) =>
                setDraft({ ...draft, send: { ...draft.send, fileSendPacingMs } })
              }
            />
            <NumberField
              label="Automation sends/min"
              value={draft.send.automationMaxSendsPerMinute}
              onChange={(automationMaxSendsPerMinute) =>
                setDraft({ ...draft, send: { ...draft.send, automationMaxSendsPerMinute } })
              }
            />
            <NumberField
              label="Automation min interval ms"
              value={draft.send.automationMinIntervalMs}
              onChange={(automationMinIntervalMs) =>
                setDraft({ ...draft, send: { ...draft.send, automationMinIntervalMs } })
              }
            />
          </SettingsSection>

          <SettingsSection title="Filters, Updates, Privacy">
            <NumberField
              label="Regex max chars"
              value={draft.filters.regexMaxLengthChars}
              onChange={(regexMaxLengthChars) =>
                setDraft({ ...draft, filters: { ...draft.filters, regexMaxLengthChars } })
              }
            />
            <NumberField
              label="Regex timeout ms"
              value={draft.filters.regexTimeoutMs}
              onChange={(regexTimeoutMs) =>
                setDraft({ ...draft, filters: { ...draft.filters, regexTimeoutMs } })
              }
            />
            <CheckboxField
              label="Auto-check updates"
              checked={draft.updates.autoCheck}
              onChange={(autoCheck) =>
                setDraft({ ...draft, updates: { ...draft.updates, autoCheck } })
              }
            />
            <CheckboxField
              label="Auto-download updates"
              checked={draft.updates.autoDownload}
              onChange={(autoDownload) =>
                setDraft({ ...draft, updates: { ...draft.updates, autoDownload } })
              }
            />
            <SelectField
              label="Release channel"
              value={draft.updates.releaseChannel}
              options={["stable", "beta", "nightly"]}
              onChange={(releaseChannel) =>
                setDraft({
                  ...draft,
                  updates: {
                    ...draft.updates,
                    releaseChannel: releaseChannel as AppSettings["updates"]["releaseChannel"]
                  }
                })
              }
            />
            <CheckboxField
              label="Crash reporting"
              checked={draft.telemetry.crashReportingEnabled}
              onChange={(crashReportingEnabled) =>
                setDraft({ ...draft, telemetry: { crashReportingEnabled } })
              }
            />
          </SettingsSection>

          <SettingsSection title="Keyboard Shortcuts">
            {SHORTCUT_DEFINITIONS.map((definition) => (
              <TextField
                key={definition.id}
                label={definition.label}
                value={shortcutDraft[definition.id]}
                onChange={(binding) =>
                  setShortcutDraft({ ...shortcutDraft, [definition.id]: binding })
                }
              />
            ))}
          </SettingsSection>
        </div>

        {validationErrors.length > 0 || error ? (
          <div className="settings-errors" role="alert">
            {error ? <p>{error}</p> : null}
            {validationErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}

        <footer className="settings-footer">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={saveDraft} disabled={saving}>
            {saving ? "Saving" : "Save settings"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      <div className="settings-grid">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="text" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  title,
  value,
  options,
  onChange
}: {
  label: string;
  title?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label title={title}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
