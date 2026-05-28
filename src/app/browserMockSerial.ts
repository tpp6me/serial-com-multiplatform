type SerialConfig = {
  portPath: string;
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: number;
  flowControl: string;
};

type OpenSessionRequest = {
  config: SerialConfig;
};

type SerialWriteRequest = {
  sessionId: string;
  bytes: number[];
};

type MockSession = {
  sessionId: string;
  portPath: string;
  config: SerialConfig;
  txBytes: number;
  droppedAutomatedSends: number;
  writes: number[][];
};

let nextSessionNumber = 1;
const sessions = new Map<string, MockSession>();

const ports = [
  mockPort("MOCK_A", "MOCK_A"),
  mockPort("MOCK_B", "MOCK_B"),
  mockPort("MOCK_ERROR", "MOCK_ERROR"),
  mockPort("MOCK_HOTUNPLUG", "MOCK_HOTUNPLUG")
];

export function browserMockSerialEnabled(): boolean {
  return import.meta.env.MULTISERIAL_E2E_MOCK_SERIAL === "1";
}

export function listBrowserMockPorts() {
  return ports.map((port) => ({ ...port }));
}

export function openBrowserMockSession(request: OpenSessionRequest) {
  if (request.config.portPath === "MOCK_ERROR") {
    throw new Error("mock driver rejected open");
  }

  const sessionId = `mock-${request.config.portPath.toLowerCase()}-${nextSessionNumber}`;
  nextSessionNumber += 1;
  sessions.set(sessionId, {
    sessionId,
    portPath: request.config.portPath,
    config: { ...request.config },
    txBytes: 0,
    droppedAutomatedSends: 0,
    writes: []
  });

  return {
    sessionId,
    state: "connected" as const,
    config: {
      portPath: request.config.portPath,
      baudRate: request.config.baudRate,
      dataBits: request.config.dataBits,
      parity: request.config.parity,
      stopBits: String(request.config.stopBits),
      flowControl: request.config.flowControl
    }
  };
}

export function reconnectBrowserMockSession(sessionId: string) {
  const session = requireSession(sessionId);

  return {
    sessionId,
    state: "connected" as const,
    config: {
      portPath: session.portPath,
      baudRate: session.config.baudRate,
      dataBits: session.config.dataBits,
      parity: session.config.parity,
      stopBits: String(session.config.stopBits),
      flowControl: session.config.flowControl
    }
  };
}

export function closeBrowserMockSession(sessionId: string) {
  sessions.delete(sessionId);

  return {
    sessionId,
    state: "disconnected" as const
  };
}

export function writeBrowserMockSerial(request: SerialWriteRequest, automated = false) {
  const session = requireSession(request.sessionId);
  const bytes = request.bytes.map((byte) => byte & 0xff);

  if (automated && session.droppedAutomatedSends > 0) {
    return resultFor(session, 0);
  }

  session.writes.push(bytes);
  session.txBytes += bytes.length;

  return resultFor(session, bytes.length);
}

export function setBrowserMockSignal(sessionId: string) {
  requireSession(sessionId);
}

export function browserMockLogStatus(sessionId: string) {
  return {
    sessionId,
    active: true,
    path: ".dev-data/test-logs/browser-mock.log",
    format: "timestampedText",
    rxBytes: 0,
    loggedBytes: 0,
    logOverrunCount: 0,
    currentSize: 0,
    queuedBytes: 0,
    error: null
  };
}

export function getBrowserMockWrites(sessionId?: string): Record<string, number[][]> {
  const entries = [...sessions.values()]
    .filter((session) => !sessionId || session.sessionId === sessionId)
    .map((session) => [session.sessionId, session.writes.map((bytes) => [...bytes])]);

  return Object.fromEntries(entries);
}

function resultFor(session: MockSession, bytesWritten: number) {
  return {
    sessionId: session.sessionId,
    bytesWritten,
    txBytes: session.txBytes,
    droppedAutomatedSends: session.droppedAutomatedSends,
    timestampWallMs: Date.now()
  };
}

function requireSession(sessionId: string): MockSession {
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`unknown mock serial session: ${sessionId}`);
  }

  return session;
}

function mockPort(path: string, displayName: string) {
  return {
    path,
    displayName,
    vid: 0x1d50,
    pid: 0x60c7,
    serialNumber: path,
    manufacturer: "MultiSerial",
    product: "Mock Serial",
    portType: "mock"
  };
}
