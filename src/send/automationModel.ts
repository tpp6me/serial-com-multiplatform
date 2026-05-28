export const MIN_AUTOMATION_INTERVAL_MS = 50;
export const FAST_AUTOMATION_CONFIRMATION_MS = 100;
export const AUTOMATION_SIDECAR_LOG_STORAGE_KEY = "multiserial.automationSidecarLog.v1";

export type AutomationSidecarEvent = "start" | "stop" | "drop";

export type AutomationSidecarLogEntry = {
  sessionId: string;
  macroId: string;
  macroName: string;
  event: AutomationSidecarEvent;
  timestampWallMs: number;
  intervalMs: number;
  droppedAutomatedSends: number;
};

export function normalizeAutomationInterval(intervalMs: number): number {
  return Math.max(0, Math.trunc(intervalMs || 0));
}

export function isAutomationIntervalAllowed(intervalMs: number): boolean {
  return normalizeAutomationInterval(intervalMs) >= MIN_AUTOMATION_INTERVAL_MS;
}

export function requiresFastAutomationConfirmation(intervalMs: number): boolean {
  const normalized = normalizeAutomationInterval(intervalMs);
  return normalized >= MIN_AUTOMATION_INTERVAL_MS && normalized < FAST_AUTOMATION_CONFIRMATION_MS;
}

export function shouldStopAutomationForKey(options: {
  key: string;
  target: EventTarget | null;
}): boolean {
  if (options.key !== "Escape") {
    return false;
  }

  const target = options.target;
  const targetElement = target instanceof HTMLElement ? target : null;

  return !(
    targetElement instanceof HTMLInputElement ||
    targetElement instanceof HTMLTextAreaElement ||
    targetElement instanceof HTMLSelectElement
  );
}

export function appendAutomationSidecarLog(
  storage: Storage | null,
  entry: AutomationSidecarLogEntry
) {
  if (!storage) {
    return;
  }

  const entries = loadAutomationSidecarLog(storage);
  entries.push(entry);
  storage.setItem(AUTOMATION_SIDECAR_LOG_STORAGE_KEY, JSON.stringify(entries));
}

export function loadAutomationSidecarLog(storage: Storage | null): AutomationSidecarLogEntry[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(AUTOMATION_SIDECAR_LOG_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every(isAutomationSidecarLogEntry) ? parsed : [];
  } catch {
    return [];
  }
}

function isAutomationSidecarLogEntry(value: unknown): value is AutomationSidecarLogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as AutomationSidecarLogEntry;
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.macroId === "string" &&
    typeof candidate.macroName === "string" &&
    (candidate.event === "start" || candidate.event === "stop" || candidate.event === "drop") &&
    typeof candidate.timestampWallMs === "number" &&
    typeof candidate.intervalMs === "number" &&
    typeof candidate.droppedAutomatedSends === "number"
  );
}
