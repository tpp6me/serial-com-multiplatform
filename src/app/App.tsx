import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type EnvironmentInfo = {
  appName: string;
  appVersion: string;
  environment: string;
  configDir: string;
  logDir: string;
  tempDir: string;
};

type BuildMetadata = {
  appName: string;
  appVersion: string;
  gitCommit: string;
  target: string;
  profile: string;
};

type ConfigLoadResult = {
  path: string;
  created: boolean;
  migrated: boolean;
  backedUpInvalid: boolean;
  strippedUnknownKeys: boolean;
};

type SerialPortSummary = {
  path: string;
  displayName: string;
  vid: number | null;
  pid: number | null;
  serialNumber: string | null;
  manufacturer: string | null;
  product: string | null;
  portType: string;
};

const fallbackEnvironment: EnvironmentInfo = {
  appName: "MultiSerial",
  appVersion: "0.1.0",
  environment: import.meta.env.MULTISERIAL_ENV ?? "browser-preview",
  configDir: import.meta.env.MULTISERIAL_CONFIG_DIR ?? ".dev-data/config",
  logDir: import.meta.env.MULTISERIAL_LOG_DIR ?? ".dev-data/logs",
  tempDir: import.meta.env.MULTISERIAL_TEMP_DIR ?? ".dev-data/tmp"
};

export function App() {
  const [environment, setEnvironment] = useState<EnvironmentInfo>(fallbackEnvironment);
  const [buildMetadata, setBuildMetadata] = useState<BuildMetadata | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigLoadResult | null>(null);
  const [ports, setPorts] = useState<SerialPortSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    const update = <T,>(request: Promise<T>, setter: (value: T) => void) => {
      request
        .then((value) => {
          if (!cancelled) {
            setter(value);
          }
        })
        .catch(() => {
          // Browser preview runs without Tauri IPC; keep fallback UI available.
        });
    };

    update(invoke<EnvironmentInfo>("environment_info"), setEnvironment);
    update(invoke<BuildMetadata>("build_metadata"), setBuildMetadata);
    update(invoke<ConfigLoadResult>("load_config"), setConfigStatus);
    update(invoke<SerialPortSummary[]>("list_serial_ports"), setPorts);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <h1>MultiSerial</h1>
          <p>Serial communication workspace</p>
        </div>
        <span className="status-badge">Disconnected</span>
      </header>

      <section className="toolbar" aria-label="Connection controls">
        <select aria-label="Serial port" disabled>
          {ports.length === 0 ? (
            <option>No ports loaded</option>
          ) : (
            ports.map((port) => (
              <option key={port.path} value={port.path}>
                {port.displayName}
              </option>
            ))
          )}
        </select>
        <select aria-label="Baud rate" defaultValue="115200">
          <option value="115200">115200</option>
        </select>
        <button type="button" disabled>
          Connect
        </button>
      </section>

      <section className="workspace" aria-label="Terminal workspace">
        <aside className="sidebar">
          <button type="button">Ports</button>
          <button type="button">Macros</button>
          <button type="button">Filters</button>
        </aside>
        <section className="terminal" aria-label="Terminal output">
          <div className="empty-state">No port connected - select a port and click Connect.</div>
        </section>
      </section>

      <section className="send-bar" aria-label="Send data">
        <input aria-label="Send text" placeholder="Send data" disabled />
        <button type="button" disabled>
          Send
        </button>
      </section>

      <footer className="status-bar">
        <span>{environment.appVersion}</span>
        {buildMetadata ? <span>{buildMetadata.gitCommit}</span> : null}
        <span>{environment.environment}</span>
        <span title={environment.configDir}>config: {environment.configDir}</span>
        <span title={environment.logDir}>logs: {environment.logDir}</span>
        {configStatus ? <span title={configStatus.path}>config loaded</span> : null}
      </footer>
    </main>
  );
}
