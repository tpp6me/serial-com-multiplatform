const SENSITIVE_KEYS = new Set([
  "bytes",
  "chunks",
  "log",
  "logContent",
  "logs",
  "payload",
  "rx",
  "serialData",
  "serialPayload",
  "terminalBuffer",
  "terminalLines",
  "tx"
]);

export type CrashReportValue =
  | null
  | boolean
  | number
  | string
  | CrashReportValue[]
  | { [key: string]: CrashReportValue };

export function scrubCrashReport(value: CrashReportValue): CrashReportValue {
  if (Array.isArray(value)) {
    return value.map((item) => scrubCrashReport(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(key) ? "[redacted]" : scrubCrashReport(item)
      ])
    );
  }

  if (typeof value === "string") {
    return scrubCrashReportString(value);
  }

  return value;
}

export function scrubCrashReportString(value: string): string {
  return value
    .replace(
      /\/Users\/[^/\s]+\/MultiSerial\/logs\/[^\s)]+/g,
      "/Users/<user>/MultiSerial/logs/<log-file>"
    )
    .replace(
      /\/home\/[^/\s]+\/MultiSerial\/logs\/[^\s)]+/g,
      "/home/<user>/MultiSerial/logs/<log-file>"
    )
    .replace(/([A-Z]:\\Users\\)[^\\\s]+(\\MultiSerial\\logs\\)[^\s)]+/gi, "$1<user>$2<log-file>")
    .replace(/\.dev-data\/logs\/[^\s)]+/g, ".dev-data/logs/<log-file>")
    .replace(/\/Users\/[^/\s]+/g, "/Users/<user>")
    .replace(/\/home\/[^/\s]+/g, "/home/<user>")
    .replace(/([A-Z]:\\Users\\)[^\\\s]+/gi, "$1<user>")
    .replace(/\/dev\/(?:cu|tty)\.[^\s,)]+/g, "/dev/<serial-port>")
    .replace(/\/dev\/tty(?:USB|ACM)\d+/g, "/dev/<serial-port>")
    .replace(/\bCOM\d+\b/g, "COM<port>");
}
