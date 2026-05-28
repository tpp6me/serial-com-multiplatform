export const DEFAULT_SCROLLBACK_BYTES = 1024 * 1024;

export const TERMINAL_VIEW_MODES = ["utf8", "hex", "mixed", "decimal", "binary"] as const;

export type TerminalViewMode = (typeof TERMINAL_VIEW_MODES)[number];

export type SessionId = string;

export type TerminalDirection = "rx" | "tx";

export type BackendRxChunk = {
  sequence: number;
  timestampWallMs: number;
  bytes: ArrayLike<number>;
};

export type RxChunk = {
  sequence: number;
  timestampWallMs: number;
  bytes: Uint8Array;
  byteLength: number;
  direction: TerminalDirection;
};

export type BackendRxBatch = {
  sessionId: SessionId;
  chunks: BackendRxChunk[];
  rxBytes: number;
  queuedBytes: number;
  droppedRxBytes: number;
  batchIntervalMs: number;
  drainedAtWallMs: number;
};

export type TerminalSessionSnapshot = {
  sessionId: SessionId;
  chunks: RxChunk[];
  viewMode: TerminalViewMode;
  retainedBytes: number;
  receivedBytes: number;
  droppedBytes: number;
  lastUpdatedAtWallMs: number | null;
};

type TerminalSessionState = {
  sessionId: SessionId;
  chunks: RxChunk[];
  viewMode: TerminalViewMode;
  retainedBytes: number;
  receivedBytes: number;
  droppedBytes: number;
  lastUpdatedAtWallMs: number | null;
};

export type TerminalSessionStoreOptions = {
  maxScrollbackBytes?: number;
  defaultViewMode?: TerminalViewMode;
};

export class TerminalSessionStore {
  readonly maxScrollbackBytes: number;

  readonly defaultViewMode: TerminalViewMode;

  private readonly sessions = new Map<SessionId, TerminalSessionState>();
  private nextTxSequence = 1_000_000_000;

  constructor(options: TerminalSessionStoreOptions = {}) {
    this.maxScrollbackBytes = normalizeScrollbackLimit(
      options.maxScrollbackBytes ?? DEFAULT_SCROLLBACK_BYTES
    );
    this.defaultViewMode = options.defaultViewMode ?? "utf8";
  }

  appendBatch(batch: BackendRxBatch): TerminalSessionSnapshot {
    const session = this.ensureSession(batch.sessionId);

    for (const chunk of batch.chunks) {
      const storedChunk = normalizeChunk(chunk, this.maxScrollbackBytes);
      session.receivedBytes += chunk.bytes.length;
      session.droppedBytes += storedChunk.droppedLeadingBytes;

      if (storedChunk.byteLength === 0) {
        continue;
      }

      session.chunks.push(storedChunk);
      session.retainedBytes += storedChunk.byteLength;
    }

    session.receivedBytes = Math.max(session.receivedBytes, batch.rxBytes);
    session.droppedBytes = Math.max(session.droppedBytes, batch.droppedRxBytes);
    session.lastUpdatedAtWallMs = batch.drainedAtWallMs;
    trimScrollback(session, this.maxScrollbackBytes);

    return snapshotSession(session);
  }

  appendTxEcho(
    sessionId: SessionId,
    bytes: ArrayLike<number>,
    timestampWallMs: number
  ): TerminalSessionSnapshot {
    const session = this.ensureSession(sessionId);
    const storedChunk = normalizeChunk(
      {
        sequence: this.nextTxSequence,
        timestampWallMs,
        bytes
      },
      this.maxScrollbackBytes,
      "tx"
    );
    this.nextTxSequence += 1;
    session.receivedBytes += bytes.length;
    session.droppedBytes += storedChunk.droppedLeadingBytes;

    if (storedChunk.byteLength > 0) {
      session.chunks.push(storedChunk);
      session.retainedBytes += storedChunk.byteLength;
    }

    session.lastUpdatedAtWallMs = timestampWallMs;
    trimScrollback(session, this.maxScrollbackBytes);

    return snapshotSession(session);
  }

  setViewMode(sessionId: SessionId, viewMode: TerminalViewMode): TerminalSessionSnapshot {
    const session = this.ensureSession(sessionId);
    session.viewMode = viewMode;
    return snapshotSession(session);
  }

  clearDisplay(sessionId: SessionId): TerminalSessionSnapshot {
    const session = this.ensureSession(sessionId);
    session.chunks = [];
    session.retainedBytes = 0;
    return snapshotSession(session);
  }

  snapshot(sessionId: SessionId): TerminalSessionSnapshot {
    return snapshotSession(this.ensureSession(sessionId));
  }

  listSessionIds(): SessionId[] {
    return [...this.sessions.keys()].sort();
  }

  removeSession(sessionId: SessionId): boolean {
    return this.sessions.delete(sessionId);
  }

  private ensureSession(sessionId: SessionId): TerminalSessionState {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      return existing;
    }

    const session: TerminalSessionState = {
      sessionId,
      chunks: [],
      viewMode: this.defaultViewMode,
      retainedBytes: 0,
      receivedBytes: 0,
      droppedBytes: 0,
      lastUpdatedAtWallMs: null
    };

    this.sessions.set(sessionId, session);
    return session;
  }
}

function normalizeScrollbackLimit(maxScrollbackBytes: number): number {
  if (!Number.isSafeInteger(maxScrollbackBytes) || maxScrollbackBytes <= 0) {
    throw new Error("maxScrollbackBytes must be a positive safe integer");
  }

  return maxScrollbackBytes;
}

function normalizeChunk(
  chunk: BackendRxChunk,
  maxScrollbackBytes: number,
  direction: TerminalDirection = "rx"
): RxChunk & { droppedLeadingBytes: number } {
  const copiedBytes = Uint8Array.from(chunk.bytes);
  const droppedLeadingBytes = Math.max(0, copiedBytes.byteLength - maxScrollbackBytes);
  const bytes =
    copiedBytes.byteLength > maxScrollbackBytes
      ? copiedBytes.slice(copiedBytes.byteLength - maxScrollbackBytes)
      : copiedBytes;

  return {
    sequence: chunk.sequence,
    timestampWallMs: chunk.timestampWallMs,
    bytes,
    byteLength: bytes.byteLength,
    direction,
    droppedLeadingBytes
  };
}

function trimScrollback(session: TerminalSessionState, maxScrollbackBytes: number) {
  while (session.retainedBytes > maxScrollbackBytes) {
    const dropped = session.chunks.shift();

    if (!dropped) {
      session.retainedBytes = 0;
      break;
    }

    session.retainedBytes -= dropped.byteLength;
    session.droppedBytes += dropped.byteLength;
  }
}

function snapshotSession(session: TerminalSessionState): TerminalSessionSnapshot {
  return {
    sessionId: session.sessionId,
    chunks: session.chunks.map(copyChunk),
    viewMode: session.viewMode,
    retainedBytes: session.retainedBytes,
    receivedBytes: session.receivedBytes,
    droppedBytes: session.droppedBytes,
    lastUpdatedAtWallMs: session.lastUpdatedAtWallMs
  };
}

function copyChunk(chunk: RxChunk): RxChunk {
  return {
    sequence: chunk.sequence,
    timestampWallMs: chunk.timestampWallMs,
    bytes: chunk.bytes.slice(),
    byteLength: chunk.byteLength,
    direction: chunk.direction
  };
}
