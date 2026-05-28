export type AppSettings = {
  schemaVersion: number;
  connection: {
    defaultBaudRate: number;
    defaultDataBits: number;
    defaultParity: "none" | "even" | "odd";
    defaultStopBits: 1 | 1.5 | 2;
    defaultFlowControl: "none" | "software" | "hardware";
    autoConnectOnLaunch: boolean;
    rememberPerDevice: boolean;
    reconnectOnHotplug: boolean;
    reconnectMaxRetries: number;
    reconnectBackoffMs: number;
  };
  display: {
    viewMode: "ascii" | "utf8" | "hex";
    fontFamily: string;
    fontSize: number;
    theme: "system" | "light" | "dark";
    timestampEnabled: boolean;
    timestampFormat: "time" | "iso" | "epochMs" | "HH:mm:ss.SSS";
    scrollbackLines: number;
    lineWrap: boolean;
    newlineMode: "lf" | "crlf" | "cr";
    partialLineTimeoutMs: number;
  };
  logging: {
    autoLogOnConnect: boolean;
    logDirectory: string;
    filenameTemplate: string;
    logFormat: "plaintext" | "timestamped-text" | "binary";
    appendMode: boolean;
    rotationSizeMb: number;
    rotationPeriod: "none" | "hourly" | "daily";
    maxFilesToKeep: number;
  };
  send: {
    defaultLineEnding: "none" | "lf" | "crlf" | "cr";
    echoTx: boolean;
    historySize: number;
    fileSendChunkBytes: number;
    fileSendPacingMs: number;
    automationMaxSendsPerMinute: number;
    automationMinIntervalMs: number;
  };
  filters: {
    regexMaxLengthChars: number;
    regexTimeoutMs: number;
  };
  updates: {
    autoCheck: boolean;
    autoDownload: boolean;
    releaseChannel: "stable" | "beta" | "nightly";
  };
  telemetry: {
    crashReportingEnabled: boolean;
  };
};

export type SettingsValidationResult =
  | { ok: true; value: AppSettings }
  | { ok: false; errors: string[] };

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  connection: {
    defaultBaudRate: 115200,
    defaultDataBits: 8,
    defaultParity: "none",
    defaultStopBits: 1,
    defaultFlowControl: "none",
    autoConnectOnLaunch: false,
    rememberPerDevice: true,
    reconnectOnHotplug: true,
    reconnectMaxRetries: 5,
    reconnectBackoffMs: 1000
  },
  display: {
    viewMode: "ascii",
    fontFamily: "JetBrains Mono",
    fontSize: 13,
    theme: "system",
    timestampEnabled: true,
    timestampFormat: "time",
    scrollbackLines: 100000,
    lineWrap: true,
    newlineMode: "crlf",
    partialLineTimeoutMs: 500
  },
  logging: {
    autoLogOnConnect: false,
    logDirectory: "~/MultiSerial/logs",
    filenameTemplate: "{port}_{YYYY-MM-DD_HH-mm-ss}.log",
    logFormat: "timestamped-text",
    appendMode: true,
    rotationSizeMb: 10,
    rotationPeriod: "daily",
    maxFilesToKeep: 30
  },
  send: {
    defaultLineEnding: "crlf",
    echoTx: true,
    historySize: 500,
    fileSendChunkBytes: 512,
    fileSendPacingMs: 10,
    automationMaxSendsPerMinute: 1000,
    automationMinIntervalMs: 50
  },
  filters: {
    regexMaxLengthChars: 512,
    regexTimeoutMs: 50
  },
  updates: {
    autoCheck: true,
    autoDownload: false,
    releaseChannel: "stable"
  },
  telemetry: {
    crashReportingEnabled: false
  }
};

export function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    display: {
      ...settings.display,
      timestampFormat:
        settings.display.timestampFormat === "HH:mm:ss.SSS"
          ? "time"
          : settings.display.timestampFormat
    }
  };
}

export function validateSettings(settings: AppSettings): SettingsValidationResult {
  const value = normalizeSettings(settings);
  const errors: string[] = [];

  requireRange(errors, "Default baud rate", value.connection.defaultBaudRate, 300, 4_000_000);
  requireAllowed(errors, "Data bits", value.connection.defaultDataBits, [5, 6, 7, 8]);
  requireAllowed(errors, "Parity", value.connection.defaultParity, ["none", "even", "odd"]);
  requireAllowed(errors, "Stop bits", value.connection.defaultStopBits, [1, 1.5, 2]);
  requireAllowed(errors, "Flow control", value.connection.defaultFlowControl, [
    "none",
    "software",
    "hardware"
  ]);
  requireRange(errors, "Reconnect retries", value.connection.reconnectMaxRetries, 0, 100);
  requireRange(errors, "Reconnect backoff", value.connection.reconnectBackoffMs, 0, 60_000);

  requireAllowed(errors, "View mode", value.display.viewMode, ["ascii", "utf8", "hex"]);
  requireText(errors, "Font family", value.display.fontFamily);
  requireRange(errors, "Font size", value.display.fontSize, 8, 32);
  requireAllowed(errors, "Theme", value.display.theme, ["system", "light", "dark"]);
  requireAllowed(errors, "Timestamp format", value.display.timestampFormat, [
    "time",
    "iso",
    "epochMs"
  ]);
  requireRange(errors, "Scrollback lines", value.display.scrollbackLines, 100, 1_000_000);
  requireAllowed(errors, "Newline mode", value.display.newlineMode, ["lf", "crlf", "cr"]);
  requireRange(errors, "Partial line timeout", value.display.partialLineTimeoutMs, 10, 60_000);

  requireText(errors, "Log directory", value.logging.logDirectory);
  requireText(errors, "Filename template", value.logging.filenameTemplate);
  requireAllowed(errors, "Log format", value.logging.logFormat, [
    "plaintext",
    "timestamped-text",
    "binary"
  ]);
  requireRange(errors, "Rotation size", value.logging.rotationSizeMb, 1, 1024);
  requireAllowed(errors, "Rotation period", value.logging.rotationPeriod, [
    "none",
    "hourly",
    "daily"
  ]);
  requireRange(errors, "Max files to keep", value.logging.maxFilesToKeep, 0, 10_000);

  requireAllowed(errors, "Default line ending", value.send.defaultLineEnding, [
    "none",
    "lf",
    "crlf",
    "cr"
  ]);
  requireRange(errors, "History size", value.send.historySize, 0, 10_000);
  requireRange(errors, "File send chunk", value.send.fileSendChunkBytes, 1, 65_536);
  requireRange(errors, "File send pacing", value.send.fileSendPacingMs, 0, 60_000);
  requireRange(
    errors,
    "Automation sends per minute",
    value.send.automationMaxSendsPerMinute,
    1,
    60_000
  );
  requireRange(
    errors,
    "Automation minimum interval",
    value.send.automationMinIntervalMs,
    50,
    60_000
  );
  requireRange(errors, "Regex max length", value.filters.regexMaxLengthChars, 1, 4096);
  requireRange(errors, "Regex timeout", value.filters.regexTimeoutMs, 1, 1000);
  requireAllowed(errors, "Release channel", value.updates.releaseChannel, [
    "stable",
    "beta",
    "nightly"
  ]);

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

function requireText(errors: string[], label: string, value: string) {
  if (value.trim().length === 0) {
    errors.push(`${label} is required.`);
  }
}

function requireRange(
  errors: string[],
  label: string,
  value: number,
  minimum: number,
  maximum: number
) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    errors.push(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

function requireAllowed<T>(errors: string[], label: string, value: T, allowed: T[]) {
  if (!allowed.includes(value)) {
    errors.push(`${label} has an unsupported value.`);
  }
}
