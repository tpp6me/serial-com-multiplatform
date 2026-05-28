import type { LineEnding, SendMode } from "./sendModel";

export const SEND_HISTORY_STORAGE_KEY = "multiserial.sendHistory.v1";
export const DEFAULT_SEND_HISTORY_SIZE = 500;

export type SendHistoryEntry = {
  input: string;
  mode: SendMode;
  lineEnding: LineEnding;
};

export type SerializedSendHistory = Record<string, SendHistoryEntry[]>;

export class SendHistoryStore {
  private readonly entriesBySession = new Map<string, SendHistoryEntry[]>();

  constructor(
    readonly maxEntriesPerSession = DEFAULT_SEND_HISTORY_SIZE,
    initialHistory: SerializedSendHistory = {}
  ) {
    if (!Number.isSafeInteger(maxEntriesPerSession) || maxEntriesPerSession <= 0) {
      throw new Error("maxEntriesPerSession must be a positive safe integer");
    }

    for (const [sessionId, entries] of Object.entries(initialHistory)) {
      this.entriesBySession.set(sessionId, normalizeEntries(entries, maxEntriesPerSession));
    }
  }

  add(sessionId: string, entry: SendHistoryEntry) {
    const normalizedEntry = normalizeEntry(entry);

    if (!normalizedEntry.input) {
      return;
    }

    const entries = this.entriesBySession
      .get(sessionId)
      ?.filter((existing) => !sameEntry(existing, normalizedEntry));
    const nextEntries = [...(entries ?? []), normalizedEntry].slice(-this.maxEntriesPerSession);
    this.entriesBySession.set(sessionId, nextEntries);
  }

  list(sessionId: string): SendHistoryEntry[] {
    return [...(this.entriesBySession.get(sessionId) ?? [])];
  }

  at(sessionId: string, index: number): SendHistoryEntry | null {
    return this.entriesBySession.get(sessionId)?.[index] ?? null;
  }

  serialize(): SerializedSendHistory {
    return Object.fromEntries(
      [...this.entriesBySession.entries()].map(([sessionId, entries]) => [sessionId, [...entries]])
    );
  }
}

export function loadSendHistory(storage: Storage | null): SerializedSendHistory {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(SEND_HISTORY_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!isSerializedSendHistory(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

export function saveSendHistory(storage: Storage | null, history: SerializedSendHistory) {
  if (!storage) {
    return;
  }

  storage.setItem(SEND_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function normalizeEntries(
  entries: readonly SendHistoryEntry[],
  maxEntriesPerSession: number
): SendHistoryEntry[] {
  return entries
    .map(normalizeEntry)
    .filter((entry) => entry.input)
    .slice(-maxEntriesPerSession);
}

function normalizeEntry(entry: SendHistoryEntry): SendHistoryEntry {
  return {
    input: entry.input,
    mode: entry.mode,
    lineEnding: entry.lineEnding
  };
}

function sameEntry(left: SendHistoryEntry, right: SendHistoryEntry): boolean {
  return (
    left.input === right.input && left.mode === right.mode && left.lineEnding === right.lineEnding
  );
}

function isSerializedSendHistory(value: unknown): value is SerializedSendHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entries) =>
      Array.isArray(entries) &&
      entries.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof entry.input === "string" &&
          (entry.mode === "text" || entry.mode === "hex") &&
          (entry.lineEnding === "none" ||
            entry.lineEnding === "cr" ||
            entry.lineEnding === "lf" ||
            entry.lineEnding === "crlf")
      )
  );
}
