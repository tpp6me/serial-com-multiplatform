import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createInitialSessionTabState,
  requiresCloseConfirmation,
  SessionTabStore,
  type SessionTabSnapshot
} from "./sessionTabs";
import {
  buildLineView,
  createFilterProfile,
  FilterSearchPanel,
  FilterProfileStore,
  MAX_HIGHLIGHT_RULES,
  loadFilterProfiles,
  nextSearchIndex,
  previousSearchIndex,
  searchLines,
  saveFilterProfiles,
  type FilterProfile,
  type FilterRule,
  type HighlightRule,
  type LineHighlight,
  type MatchMode
} from "../filter";
import {
  DEFAULT_SEND_HISTORY_SIZE,
  DEFAULT_FILE_SEND_CHUNK_BYTES,
  DEFAULT_FILE_SEND_PACING_MS,
  AutomationBanner,
  appendAutomationSidecarLog,
  buildMacroFromFields,
  encodeSendInput,
  isAutomationIntervalAllowed,
  loadMacroConfig,
  loadSendHistory,
  MacroConfigStore,
  MacroPanel,
  readFileBytes,
  requiresFastAutomationConfirmation,
  runMacro,
  runFileSend,
  saveMacroConfig,
  saveSendHistory,
  SendBar,
  SendHistoryStore,
  shouldStopAutomationForKey,
  type AutomationSidecarEvent,
  type LineEnding,
  type MacroDraft,
  type SendHistoryEntry,
  type SendMacro,
  type SendMode
} from "../send";
import {
  DEFAULT_APP_SETTINGS,
  normalizeSettings,
  SettingsDialog,
  type AppSettings
} from "../settings";
import {
  loadShortcutBindings,
  matchesShortcut,
  saveShortcutBindings,
  type ShortcutBindings
} from "../shortcuts";
import {
  buildTerminalLines,
  TerminalPanel,
  TerminalSessionStore,
  type BackendRxBatch,
  type TerminalSessionSnapshot,
  type TimestampFormat
} from "../terminal";
import { runConfiguredUpdateCheck, updateStatusLabel, type UpdateCheckState } from "../updates";
import {
  browserMockLogStatus,
  browserMockSerialEnabled,
  closeBrowserMockSession,
  getBrowserMockWrites,
  listBrowserMockPorts,
  openBrowserMockSession,
  reconnectBrowserMockSession,
  setBrowserMockSignal,
  writeBrowserMockSerial
} from "./browserMockSerial";

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
  config: AppSettings;
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

type PortListChangedEvent = {
  ports: SerialPortSummary[];
};

type SerialWriteResult = {
  sessionId: string;
  bytesWritten: number;
  txBytes: number;
  droppedAutomatedSends: number;
  timestampWallMs: number;
};

type OpenSessionResult = {
  sessionId: string;
  state: "connected";
  config: {
    portPath: string;
    baudRate: number;
    dataBits: number;
    parity: string;
    stopBits: string;
    flowControl: string;
  };
};

type CloseSessionResult = {
  sessionId: string;
  state: "disconnected";
};

type StatusBanner = {
  kind: "info" | "warning" | "error";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type LogStatus = {
  sessionId: string;
  active: boolean;
  path: string | null;
  format: string | null;
  rxBytes: number;
  loggedBytes: number;
  logOverrunCount: number;
  currentSize: number;
  queuedBytes: number;
  error: string | null;
};

type SyntheticFeedOptions = {
  sessionId?: string;
  bytesPerSecond: number;
  durationMs: number;
  intervalMs?: number;
};

type SyntheticFeedResult = {
  sessionId: string;
  bytesSent: number;
  durationMs: number;
};

type TabConnectionSettings = {
  portPath: string;
  baudRate: string;
};

const fallbackEnvironment: EnvironmentInfo = {
  appName: "MultiSerial",
  appVersion: "0.1.0",
  environment: import.meta.env.MULTISERIAL_ENV ?? "browser-preview",
  configDir: import.meta.env.MULTISERIAL_CONFIG_DIR ?? ".dev-data/config",
  logDir: import.meta.env.MULTISERIAL_LOG_DIR ?? ".dev-data/logs",
  tempDir: import.meta.env.MULTISERIAL_TEMP_DIR ?? ".dev-data/tmp"
};

const emptyMacroDraft: MacroDraft = {
  id: null,
  name: "",
  textInput: "",
  textLineEnding: "none",
  hexInput: "",
  delayMs: 0
};

const browserPreviewSessionId = import.meta.env.MULTISERIAL_E2E_SESSION_ID;
let ruleCounter = 1;

declare global {
  interface Window {
    __MULTISERIAL_E2E_START_SYNTHETIC_FEED__?: (
      options: SyntheticFeedOptions
    ) => Promise<SyntheticFeedResult>;
    __MULTISERIAL_E2E_APPEND_RX_BYTES__?: (sessionId: string, bytes: number[]) => void;
    __MULTISERIAL_E2E_GET_MOCK_WRITES__?: (sessionId?: string) => Record<string, number[][]>;
    __MULTISERIAL_E2E_TRIGGER_MOCK_HOTPLUG__?: (sessionId?: string) => boolean;
  }
}

export function App() {
  const [environment, setEnvironment] = useState<EnvironmentInfo>(fallbackEnvironment);
  const [buildMetadata, setBuildMetadata] = useState<BuildMetadata | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigLoadResult | null>(null);
  const [ports, setPorts] = useState<SerialPortSummary[]>([]);
  const [portsRefreshing, setPortsRefreshing] = useState(false);
  const [portRefreshError, setPortRefreshError] = useState<string | null>(null);
  const terminalStoreRef = useRef(new TerminalSessionStore());
  const sessionTabStoreRef = useRef(
    new SessionTabStore(createInitialSessionTabState(browserPreviewSessionId))
  );
  const sendHistoryStoreRef = useRef(
    new SendHistoryStore(DEFAULT_SEND_HISTORY_SIZE, loadSendHistory(browserStorage()))
  );
  const macroConfigStoreRef = useRef(new MacroConfigStore(loadMacroConfig(browserStorage())));
  const filterProfileStoreRef = useRef(
    new FilterProfileStore(loadFilterProfiles(browserStorage()))
  );
  const fileSendAbortRef = useRef<AbortController | null>(null);
  const automationTimerRef = useRef<number | null>(null);
  const automationIntervalMsRef = useRef(1000);
  const automationMacroRef = useRef<SendMacro | null>(null);
  const droppedAutomatedSendsRef = useRef(0);
  const activeTerminalSessionIdRef = useRef<string | null>(browserPreviewSessionId ?? null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTerminalSessionId, setActiveTerminalSessionId] = useState<string | null>(
    browserPreviewSessionId ?? null
  );
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [shortcutBindings, setShortcutBindings] = useState<ShortcutBindings>(() =>
    loadShortcutBindings(browserStorage())
  );
  const [showMacrosPanel, setShowMacrosPanel] = useState(true);
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);
  const [sessionTabs, setSessionTabs] = useState<SessionTabSnapshot>(() =>
    sessionTabStoreRef.current.snapshot()
  );
  const [terminalSnapshot, setTerminalSnapshot] = useState<TerminalSessionSnapshot | null>(null);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [timestampFormat, setTimestampFormat] = useState<TimestampFormat>("time");
  const [wrapLines, setWrapLines] = useState(true);
  const [sendValue, setSendValue] = useState("");
  const [sendMode, setSendMode] = useState<SendMode>("text");
  const [lineEnding, setLineEnding] = useState<LineEnding>("none");
  const [echoTx, setEchoTx] = useState(true);
  const [dtrEnabled, setDtrEnabled] = useState(false);
  const [rtsEnabled, setRtsEnabled] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [updateState, setUpdateState] = useState<UpdateCheckState>({ status: "idle" });
  const [logStatus, setLogStatus] = useState<LogStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileSendProgress, setFileSendProgress] = useState<number | null>(null);
  const [fileSending, setFileSending] = useState(false);
  const [macros, setMacros] = useState<SendMacro[]>([]);
  const [macroDraft, setMacroDraft] = useState<MacroDraft>(emptyMacroDraft);
  const [runningMacroId, setRunningMacroId] = useState<string | null>(null);
  const [automationIntervalMs, setAutomationIntervalMs] = useState(1000);
  const [automationMacro, setAutomationMacro] = useState<SendMacro | null>(null);
  const [droppedAutomatedSends, setDroppedAutomatedSends] = useState(0);
  const [connectionSettingsByTab, setConnectionSettingsByTab] = useState<
    Record<string, TabConnectionSettings>
  >({});
  const [highlightRulesByTab, setHighlightRulesByTab] = useState<Record<string, HighlightRule[]>>(
    {}
  );
  const [filterRulesByTab, setFilterRulesByTab] = useState<Record<string, FilterRule[]>>({});
  const [filterProfiles, setFilterProfiles] = useState<FilterProfile[]>(() =>
    filterProfileStoreRef.current.list()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<MatchMode>("keyword");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const activeConnectionSettings =
    connectionSettingsByTab[sessionTabs.activeTabId] ?? defaultConnectionSettings(appSettings);
  const appStyle = {
    "--terminal-font-family": appSettings.display.fontFamily,
    "--terminal-font-size": `${appSettings.display.fontSize}px`
  } as CSSProperties;
  const highlightRules = useMemo(
    () => highlightRulesByTab[sessionTabs.activeTabId] ?? [],
    [highlightRulesByTab, sessionTabs.activeTabId]
  );
  const filterRules = useMemo(
    () => filterRulesByTab[sessionTabs.activeTabId] ?? [],
    [filterRulesByTab, sessionTabs.activeTabId]
  );
  const terminalLines = useMemo(
    () =>
      terminalSnapshot
        ? buildTerminalLines(terminalSnapshot.chunks, {
            viewMode: terminalSnapshot.viewMode,
            newlineMode: "lf",
            nowWallMs: Date.now()
          })
        : [],
    [terminalSnapshot]
  );
  const lineView = useMemo(
    () => buildLineView(terminalLines, { filters: filterRules, highlights: highlightRules }),
    [filterRules, highlightRules, terminalLines]
  );
  const filteredTerminalLines = useMemo(
    () => lineView.lines.map((entry) => entry.line),
    [lineView.lines]
  );
  const searchResult = useMemo(
    () =>
      searchLines(filteredTerminalLines, {
        query: searchQuery,
        mode: searchMode,
        activeIndex: activeSearchIndex
      }),
    [activeSearchIndex, filteredTerminalLines, searchMode, searchQuery]
  );
  const filterWarnings = useMemo(
    () => [...lineView.warnings, ...searchResult.warnings],
    [lineView.warnings, searchResult.warnings]
  );
  const highlightsByLineId = useMemo(
    () => buildHighlightsByLineId(lineView.lines, searchResult.matches, searchResult.activeIndex),
    [lineView.lines, searchResult.activeIndex, searchResult.matches]
  );
  const routeActiveSessionTab = useCallback((snapshot: SessionTabSnapshot) => {
    setSessionTabs(snapshot);
    activeTerminalSessionIdRef.current = snapshot.activeSerialSessionId;
    setActiveTerminalSessionId(snapshot.activeSerialSessionId);
    setHistoryCursor(null);

    setTerminalSnapshot(
      snapshot.activeSerialSessionId
        ? terminalStoreRef.current.snapshot(snapshot.activeSerialSessionId)
        : null
    );
  }, []);

  const appendRxBatch = useCallback(
    (batch: BackendRxBatch) => {
      const snapshot = terminalStoreRef.current.appendBatch(batch);
      const activeSessionId = activeTerminalSessionIdRef.current;

      if (!activeSessionId) {
        routeActiveSessionTab(
          sessionTabStoreRef.current.bindSerialSession(sessionTabs.activeTabId, batch.sessionId, {
            title: batch.sessionId
          })
        );
        setTerminalSnapshot(snapshot);
        return;
      }

      if (snapshot.sessionId === activeSessionId) {
        setTerminalSnapshot(snapshot);
      }
    },
    [routeActiveSessionTab, sessionTabs.activeTabId]
  );

  const createSessionTab = useCallback(() => {
    try {
      routeActiveSessionTab(sessionTabStoreRef.current.createTab());
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  }, [routeActiveSessionTab]);

  const activateSessionTab = (tabId: string) => {
    try {
      routeActiveSessionTab(sessionTabStoreRef.current.activate(tabId));
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  };

  const closeSessionTab = useCallback(
    async (tabId: string) => {
      const tab = sessionTabs.tabs.find((candidate) => candidate.id === tabId);

      if (!tab) {
        return;
      }

      if (
        requiresCloseConfirmation(tab) &&
        !window.confirm(`Close connected session "${tab.title}"?`)
      ) {
        return;
      }

      if (tab.serialSessionId) {
        try {
          if (browserMockSerialEnabled()) {
            closeBrowserMockSession(tab.serialSessionId);
          } else {
            await invoke("close_serial_session", { sessionId: tab.serialSessionId });
          }
          terminalStoreRef.current.removeSession(tab.serialSessionId);
        } catch (error) {
          setSendError(error instanceof Error ? error.message : String(error));
          return;
        }
      }

      routeActiveSessionTab(sessionTabStoreRef.current.close(tabId));
      setConnectionSettingsByTab((settings) => omitKey(settings, tabId));
      setHighlightRulesByTab((rules) => omitKey(rules, tabId));
      setFilterRulesByTab((rules) => omitKey(rules, tabId));
    },
    [routeActiveSessionTab, sessionTabs.tabs]
  );

  const connectActiveSession = useCallback(async () => {
    const activeTab = sessionTabs.activeTab;

    if (activeTab.serialSessionId) {
      return;
    }

    if (!activeConnectionSettings.portPath) {
      setSendError("Choose a serial port before connecting.");
      return;
    }

    const baudRate = Number(activeConnectionSettings.baudRate);

    if (!Number.isFinite(baudRate)) {
      setSendError("Choose a valid baud rate before connecting.");
      return;
    }

    routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "connecting"));
    setSendError(null);

    try {
      const request = {
        config: {
          portPath: activeConnectionSettings.portPath,
          baudRate,
          dataBits: appSettings.connection.defaultDataBits,
          parity: appSettings.connection.defaultParity,
          stopBits: appSettings.connection.defaultStopBits,
          flowControl: appSettings.connection.defaultFlowControl
        },
        autoLog: appSettings.logging.autoLogOnConnect
          ? buildAutoLogRequest(appSettings, activeConnectionSettings.portPath)
          : null
      };
      const result = browserMockSerialEnabled()
        ? openBrowserMockSession(request)
        : await invoke<OpenSessionResult>("open_serial_session", {
            request
          });
      const title =
        ports.find((port) => port.path === activeConnectionSettings.portPath)?.displayName ??
        activeConnectionSettings.portPath;
      routeActiveSessionTab(
        sessionTabStoreRef.current.bindSerialSession(activeTab.id, result.sessionId, {
          title,
          status: "connected"
        })
      );
      setTerminalSnapshot(terminalStoreRef.current.snapshot(result.sessionId));

      if (browserMockSerialEnabled()) {
        setLogStatus(browserMockLogStatus(result.sessionId));
      } else {
        invoke<LogStatus>("serial_log_status", { sessionId: result.sessionId })
          .then(setLogStatus)
          .catch(() => {
            // The session can still be connected if log status is unavailable.
          });
      }
    } catch (error) {
      routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "error"));
      setSendError(error instanceof Error ? error.message : String(error));
    }
  }, [activeConnectionSettings, appSettings, ports, routeActiveSessionTab, sessionTabs.activeTab]);

  const disconnectActiveSession = useCallback(async () => {
    const activeTab = sessionTabs.activeTab;

    if (!activeTab.serialSessionId) {
      return;
    }

    routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "disconnecting"));
    setSendError(null);

    try {
      const result = browserMockSerialEnabled()
        ? closeBrowserMockSession(activeTab.serialSessionId)
        : await invoke<CloseSessionResult>("close_serial_session", {
            sessionId: activeTab.serialSessionId
          });
      terminalStoreRef.current.removeSession(result.sessionId);
      setLogStatus(null);
      setDtrEnabled(false);
      setRtsEnabled(false);
      routeActiveSessionTab(sessionTabStoreRef.current.disconnectSerialSession(activeTab.id));
    } catch (error) {
      routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "error"));
      setSendError(error instanceof Error ? error.message : String(error));
    }
  }, [routeActiveSessionTab, sessionTabs.activeTab]);

  const reconnectActiveSession = useCallback(async () => {
    const activeTab = sessionTabs.activeTab;

    if (!activeTab.serialSessionId) {
      return;
    }

    routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "reconnecting"));
    setStatusBanner({
      kind: "info",
      message: `Reconnecting ${activeTab.title}...`
    });
    setSendError(null);

    try {
      const result = browserMockSerialEnabled()
        ? reconnectBrowserMockSession(activeTab.serialSessionId)
        : await invoke<OpenSessionResult>("reconnect_serial_session", {
            sessionId: activeTab.serialSessionId
          });
      routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "connected"));
      setTerminalSnapshot(terminalStoreRef.current.snapshot(result.sessionId));
      setStatusBanner(null);
    } catch (error) {
      routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(activeTab.id, "error"));
      setSendError(error instanceof Error ? error.message : String(error));
    }
  }, [routeActiveSessionTab, sessionTabs.activeTab]);

  const invokeSerialWrite = useCallback(
    async (request: { sessionId: string; bytes: number[] }, automated = false) => {
      if (browserMockSerialEnabled()) {
        return writeBrowserMockSerial(request, automated);
      }

      return invoke<SerialWriteResult>(automated ? "serial_automated_write" : "serial_write", {
        request
      });
    },
    []
  );

  const toggleActiveConnection = useCallback(async () => {
    if (sessionTabs.activeTab.serialSessionId) {
      await disconnectActiveSession();
      return;
    }

    await connectActiveSession();
  }, [connectActiveSession, disconnectActiveSession, sessionTabs.activeTab.serialSessionId]);

  const setLineSignal = async (signal: "dtr" | "rts", enabled: boolean) => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      setSendError("Open a serial session before changing line signals.");
      return;
    }

    try {
      if (browserMockSerialEnabled()) {
        setBrowserMockSignal(sessionId);
      } else {
        await invoke(signal === "dtr" ? "serial_set_dtr" : "serial_set_rts", {
          request: { sessionId, enabled }
        });
      }

      if (signal === "dtr") {
        setDtrEnabled(enabled);
      } else {
        setRtsEnabled(enabled);
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  };

  const updateActiveConnectionSettings = (settings: Partial<TabConnectionSettings>) => {
    setConnectionSettingsByTab((settingsByTab) => ({
      ...settingsByTab,
      [sessionTabs.activeTabId]: {
        ...defaultConnectionSettings(appSettings),
        ...settingsByTab[sessionTabs.activeTabId],
        ...settings
      }
    }));
  };

  const applySettings = useCallback((settings: AppSettings) => {
    const normalized = normalizeSettings(settings);
    setAppSettings(normalized);
    setShowTimestamps(normalized.display.timestampEnabled);
    setTimestampFormat(
      normalized.display.timestampFormat === "HH:mm:ss.SSS"
        ? "time"
        : normalized.display.timestampFormat
    );
    setWrapLines(normalized.display.lineWrap);
    setLineEnding(normalized.send.defaultLineEnding);
    setEchoTx(normalized.send.echoTx);
  }, []);

  const updateActiveHighlightRules = (update: (rules: HighlightRule[]) => HighlightRule[]) => {
    setHighlightRulesByTab((rulesByTab) => ({
      ...rulesByTab,
      [sessionTabs.activeTabId]: update(rulesByTab[sessionTabs.activeTabId] ?? [])
    }));
  };

  const updateActiveFilterRules = (update: (rules: FilterRule[]) => FilterRule[]) => {
    setFilterRulesByTab((rulesByTab) => ({
      ...rulesByTab,
      [sessionTabs.activeTabId]: update(rulesByTab[sessionTabs.activeTabId] ?? [])
    }));
  };

  const refreshPorts = useCallback(async () => {
    setPortsRefreshing(true);
    setPortRefreshError(null);

    try {
      setPorts(
        browserMockSerialEnabled()
          ? listBrowserMockPorts()
          : await invoke<SerialPortSummary[]>("list_serial_ports")
      );
    } catch (error) {
      setPortRefreshError(error instanceof Error ? error.message : String(error));
    } finally {
      setPortsRefreshing(false);
    }
  }, []);

  const checkForUpdates = useCallback(
    async (manual = false) => {
      const updateSettings = manual
        ? { ...appSettings.updates, autoCheck: true }
        : appSettings.updates;
      const result = await runConfiguredUpdateCheck(updateSettings, {
        onState: setUpdateState
      });

      if (manual && result.status === "error") {
        setStatusBanner({ kind: "error", message: result.message });
      }

      if (manual && result.status === "available") {
        setStatusBanner({
          kind: "info",
          message: `Update ${result.version} is available.`
        });
      }
    },
    [appSettings.updates]
  );

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
    update(invoke<ConfigLoadResult>("load_config"), (result) => {
      setConfigStatus(result);
      applySettings(result.config);
    });
    refreshPorts().catch(() => {
      // Error state is handled in refreshPorts.
    });

    return () => {
      cancelled = true;
    };
  }, [applySettings, refreshPorts]);

  useEffect(() => {
    if (!configStatus) {
      return;
    }

    checkForUpdates(false).catch(() => {
      // runConfiguredUpdateCheck converts failures into state; this catch only guards unexpected throws.
    });
  }, [checkForUpdates, configStatus]);

  useEffect(() => {
    activeTerminalSessionIdRef.current = activeTerminalSessionId;
    setMacros(
      activeTerminalSessionId ? macroConfigStoreRef.current.list(activeTerminalSessionId) : []
    );
  }, [activeTerminalSessionId]);

  useEffect(() => {
    let cancelled = false;

    if (!activeTerminalSessionId) {
      setLogStatus(null);
      return;
    }

    if (browserMockSerialEnabled()) {
      setLogStatus(browserMockLogStatus(activeTerminalSessionId));
      return;
    }

    setLogStatus(null);
    invoke<LogStatus>("serial_log_status", { sessionId: activeTerminalSessionId })
      .then((status) => {
        if (!cancelled) {
          setLogStatus(status);
        }
      })
      .catch(() => {
        // Browser preview and tests can bind synthetic sessions without backend log state.
      });

    return () => {
      cancelled = true;
    };
  }, [activeTerminalSessionId]);

  useEffect(() => {
    automationIntervalMsRef.current = automationIntervalMs;
  }, [automationIntervalMs]);

  useEffect(() => {
    automationMacroRef.current = automationMacro;
  }, [automationMacro]);

  useEffect(() => {
    droppedAutomatedSendsRef.current = droppedAutomatedSends;
  }, [droppedAutomatedSends]);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    listen<PortListChangedEvent>("serial-port-list-changed", (event) => {
      setPorts(event.payload.ports);
      setPortRefreshError(null);
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }

        removeListener = unlisten;
      })
      .catch(() => {
        // Browser preview runs without Tauri event IPC; keep static UI available.
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    listen<BackendRxBatch>("serial-rx-batch", (event) => {
      appendRxBatch(event.payload);
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }

        removeListener = unlisten;
      })
      .catch(() => {
        // Browser preview runs without Tauri event IPC; keep static UI available.
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [appendRxBatch]);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;

    listen<string>("serial-session-hot-unplugged", (event) => {
      const tab = sessionTabStoreRef.current.tabForSerialSession(event.payload);

      if (!tab) {
        return;
      }

      routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(tab.id, "hot-unplugged"));
      setStatusBanner({
        kind: "warning",
        message: `${tab.title} was unplugged.`,
        actionLabel: tab.id === sessionTabs.activeTabId ? "Reconnect" : undefined,
        onAction:
          tab.id === sessionTabs.activeTabId
            ? () => {
                void reconnectActiveSession();
              }
            : undefined
      });
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }

        removeListener = unlisten;
      })
      .catch(() => {
        // Browser preview runs without Tauri event IPC; keep static UI available.
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [reconnectActiveSession, routeActiveSessionTab, sessionTabs.activeTabId]);

  useEffect(() => {
    if (!browserMockSerialEnabled()) {
      return;
    }

    window.__MULTISERIAL_E2E_GET_MOCK_WRITES__ = getBrowserMockWrites;
    window.__MULTISERIAL_E2E_TRIGGER_MOCK_HOTPLUG__ = (sessionId) => {
      const targetSessionId = sessionId ?? activeTerminalSessionIdRef.current;

      if (!targetSessionId) {
        return false;
      }

      const tab = sessionTabStoreRef.current.tabForSerialSession(targetSessionId);

      if (!tab) {
        return false;
      }

      routeActiveSessionTab(sessionTabStoreRef.current.updateStatus(tab.id, "hot-unplugged"));
      setStatusBanner({
        kind: "warning",
        message: `${tab.title} was unplugged.`,
        actionLabel: tab.id === sessionTabs.activeTabId ? "Reconnect" : undefined,
        onAction:
          tab.id === sessionTabs.activeTabId
            ? () => {
                void reconnectActiveSession();
              }
            : undefined
      });

      return true;
    };

    return () => {
      delete window.__MULTISERIAL_E2E_GET_MOCK_WRITES__;
      delete window.__MULTISERIAL_E2E_TRIGGER_MOCK_HOTPLUG__;
    };
  }, [reconnectActiveSession, routeActiveSessionTab, sessionTabs.activeTabId]);

  useEffect(() => {
    if (sendError) {
      setStatusBanner({ kind: "error", message: sendError });
    }
  }, [sendError]);

  useEffect(() => {
    if (!browserPreviewSessionId) {
      return;
    }

    window.__MULTISERIAL_E2E_START_SYNTHETIC_FEED__ = (options) =>
      startSyntheticFeed(options, appendRxBatch);
    window.__MULTISERIAL_E2E_APPEND_RX_BYTES__ = (sessionId, bytes) => {
      appendRxBatch({
        sessionId,
        chunks: [{ sequence: Date.now(), timestampWallMs: Date.now(), bytes }],
        rxBytes: bytes.length,
        queuedBytes: 0,
        droppedRxBytes: 0,
        batchIntervalMs: 16,
        drainedAtWallMs: Date.now()
      });
    };

    return () => {
      delete window.__MULTISERIAL_E2E_START_SYNTHETIC_FEED__;
      delete window.__MULTISERIAL_E2E_APPEND_RX_BYTES__;
    };
  }, [appendRxBatch]);

  const clearTerminalDisplay = useCallback(() => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      return;
    }

    setTerminalSnapshot(terminalStoreRef.current.clearDisplay(sessionId));
  }, []);

  const saveSettings = async (settings: AppSettings, shortcuts: ShortcutBindings) => {
    setSettingsSaving(true);
    setSettingsError(null);

    try {
      const result = await invoke<ConfigLoadResult>("save_config", { config: settings });
      setConfigStatus(result);
      applySettings(result.config);
      setShortcutBindings(shortcuts);
      saveShortcutBindings(browserStorage(), shortcuts);
      setSettingsOpen(false);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingsSaving(false);
    }
  };

  const exportTerminalBuffer = useCallback(() => {
    if (filteredTerminalLines.length === 0) {
      setSendError("No terminal data is available to export.");
      return;
    }

    const payload = `${filteredTerminalLines
      .map(
        (line) =>
          `${new Date(line.timestampWallMs).toISOString()}\t${line.direction.toUpperCase()}\t${
            line.text
          }`
      )
      .join("\n")}\n`;
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeDownloadName(sessionTabs.activeTab.title)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredTerminalLines, sessionTabs.activeTab.title]);

  const exportTerminalHtml = useCallback(() => {
    if (filteredTerminalLines.length === 0) {
      setSendError("No terminal data is available to export.");
      return;
    }

    const rows = filteredTerminalLines
      .map(
        (line) =>
          `<tr><td>${escapeHtml(new Date(line.timestampWallMs).toISOString())}</td><td>${escapeHtml(
            line.direction.toUpperCase()
          )}</td><td><pre>${escapeHtml(line.text)}</pre></td></tr>`
      )
      .join("");
    const payload = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      sessionTabs.activeTab.title
    )}</title><style>body{font-family:system-ui,sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd4dd;padding:4px 6px;text-align:left;vertical-align:top}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><table><thead><tr><th>Timestamp</th><th>Direction</th><th>Data</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([payload], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeDownloadName(sessionTabs.activeTab.title)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredTerminalLines, sessionTabs.activeTab.title]);

  const openLogFile = async () => {
    if (!logStatus?.path) {
      setSendError("No active log file is available to open.");
      return;
    }

    await openPath(logStatus.path, "file", "Opened log file.");
  };

  const openLogDirectory = async () => {
    const directory = logStatus?.path
      ? parentPath(logStatus.path)
      : appSettings.logging.logDirectory || environment.logDir;

    await openPath(directory, "directory", "Opened log directory.");
  };

  const openPath = async (path: string, kind: "file" | "directory", successMessage: string) => {
    try {
      await invoke("open_path", { request: { path, kind } });
      setStatusBanner({ kind: "info", message: successMessage });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  };

  const sendCurrentInput = async () => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      setSendError("Open a serial session before sending data.");
      return;
    }

    const encoded = encodeSendInput(sendValue, {
      mode: sendMode,
      lineEnding
    });

    if (!encoded.ok) {
      setSendError(encoded.error);
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const result = await invokeSerialWrite({
        sessionId,
        bytes: [...encoded.bytes]
      });

      if (echoTx && result.bytesWritten > 0) {
        setTerminalSnapshot(
          terminalStoreRef.current.appendTxEcho(
            sessionId,
            encoded.bytes.slice(0, result.bytesWritten),
            result.timestampWallMs
          )
        );
      }

      const historyEntry: SendHistoryEntry = {
        input: sendValue,
        mode: sendMode,
        lineEnding
      };
      sendHistoryStoreRef.current.add(sessionId, historyEntry);
      saveSendHistory(browserStorage(), sendHistoryStoreRef.current.serialize());
      setHistoryCursor(null);
      setSendValue("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const restoreHistoryEntry = (entry: SendHistoryEntry) => {
    setSendValue(entry.input);
    setSendMode(entry.mode);
    setLineEnding(entry.lineEnding);
    setSendError(null);
  };

  const showPreviousHistoryEntry = () => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      return;
    }

    const entries = sendHistoryStoreRef.current.list(sessionId);

    if (entries.length === 0) {
      return;
    }

    const nextCursor = historyCursor === null ? entries.length - 1 : Math.max(0, historyCursor - 1);
    setHistoryCursor(nextCursor);
    restoreHistoryEntry(entries[nextCursor]);
  };

  const showNextHistoryEntry = () => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId || historyCursor === null) {
      return;
    }

    const entries = sendHistoryStoreRef.current.list(sessionId);
    const nextCursor = historyCursor + 1;

    if (nextCursor >= entries.length) {
      setHistoryCursor(null);
      setSendValue("");
      return;
    }

    setHistoryCursor(nextCursor);
    restoreHistoryEntry(entries[nextCursor]);
  };

  const sendSelectedFile = async () => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      setSendError("Open a serial session before sending a file.");
      return;
    }

    if (!selectedFile) {
      setSendError("Choose a file before starting file send.");
      return;
    }

    const abortController = new AbortController();
    fileSendAbortRef.current = abortController;
    setFileSending(true);
    setFileSendProgress(0);
    setSendError(null);

    try {
      const bytes = await readFileBytes(selectedFile);
      await runFileSend({
        bytes,
        chunkBytes: configStatus?.config.send.fileSendChunkBytes ?? DEFAULT_FILE_SEND_CHUNK_BYTES,
        pacingMs: configStatus?.config.send.fileSendPacingMs ?? DEFAULT_FILE_SEND_PACING_MS,
        signal: abortController.signal,
        writeChunk: async (chunk) => {
          if (activeTerminalSessionIdRef.current !== sessionId) {
            throw new DOMException(
              "file send aborted because the session disconnected",
              "AbortError"
            );
          }

          const result = await invokeSerialWrite({
            sessionId,
            bytes: [...chunk]
          });

          return result.bytesWritten;
        },
        onProgress: (progress) => {
          setFileSendProgress(Math.round((progress.sentBytes / progress.totalBytes) * 100));
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setSendError("File send canceled.");
      } else {
        setSendError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      fileSendAbortRef.current = null;
      setFileSending(false);
    }
  };

  const cancelFileSend = () => {
    fileSendAbortRef.current?.abort();
  };

  const persistMacros = (sessionId: string) => {
    setMacros(macroConfigStoreRef.current.list(sessionId));
    saveMacroConfig(browserStorage(), macroConfigStoreRef.current.serialize());
  };

  const saveMacroDraft = () => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      setSendError("Open a serial session before saving a macro.");
      return;
    }

    const macro = buildMacroFromFields({
      id: macroDraft.id ?? undefined,
      name: macroDraft.name,
      textInput: macroDraft.textInput,
      textLineEnding: macroDraft.textLineEnding,
      hexInput: macroDraft.hexInput,
      delayMs: macroDraft.delayMs
    });

    if (macro.steps.length === 0) {
      setSendError("Add at least one macro step before saving.");
      return;
    }

    macroConfigStoreRef.current.upsert(sessionId, macro);
    persistMacros(sessionId);
    setMacroDraft({ ...macroDraft, id: macro.id, name: macro.name });
    setSendError(null);
  };

  const editMacro = (macro: SendMacro) => {
    const textStep = macro.steps.find((step) => step.kind === "text");
    const hexStep = macro.steps.find((step) => step.kind === "hex");
    const delayStep = macro.steps.find((step) => step.kind === "delay");

    setMacroDraft({
      id: macro.id,
      name: macro.name,
      textInput: textStep?.kind === "text" ? textStep.input : "",
      textLineEnding: textStep?.kind === "text" ? textStep.lineEnding : "none",
      hexInput: hexStep?.kind === "hex" ? hexStep.input : "",
      delayMs: delayStep?.kind === "delay" ? delayStep.delayMs : 0
    });
  };

  const deleteMacro = (macroId: string) => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      return;
    }

    macroConfigStoreRef.current.delete(sessionId, macroId);
    persistMacros(sessionId);

    if (macroDraft.id === macroId) {
      setMacroDraft(emptyMacroDraft);
    }
  };

  const executeMacro = async (macro: SendMacro, automated = false) => {
    const sessionId = activeTerminalSessionIdRef.current;

    if (!sessionId) {
      setSendError("Open a serial session before running a macro.");
      return;
    }

    setRunningMacroId(macro.id);
    setSendError(null);

    try {
      await runMacro({
        macro,
        writeBytes: async (bytes) => {
          const result = await invokeSerialWrite(
            {
              sessionId,
              bytes: [...bytes]
            },
            automated
          );

          setDroppedAutomatedSends(result.droppedAutomatedSends);

          if (echoTx && result.bytesWritten > 0) {
            setTerminalSnapshot(
              terminalStoreRef.current.appendTxEcho(
                sessionId,
                bytes.slice(0, result.bytesWritten),
                result.timestampWallMs
              )
            );
          }

          return result.bytesWritten;
        }
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningMacroId(null);
    }
  };

  const recordAutomationSidecarEvent = useCallback(
    (event: AutomationSidecarEvent, macro: SendMacro) => {
      const sessionId = activeTerminalSessionIdRef.current;

      if (!sessionId) {
        return;
      }

      appendAutomationSidecarLog(browserStorage(), {
        sessionId,
        macroId: macro.id,
        macroName: macro.name,
        event,
        timestampWallMs: Date.now(),
        intervalMs: automationIntervalMsRef.current,
        droppedAutomatedSends: droppedAutomatedSendsRef.current
      });
    },
    []
  );

  const stopAutomation = useCallback(() => {
    const stoppedMacro = automationMacroRef.current;
    if (automationTimerRef.current !== null) {
      window.clearInterval(automationTimerRef.current);
      automationTimerRef.current = null;
    }

    setAutomationMacro(null);

    if (stoppedMacro) {
      recordAutomationSidecarEvent("stop", stoppedMacro);
    }
  }, [recordAutomationSidecarEvent]);

  const startAutomation = (macro: SendMacro) => {
    if (!isAutomationIntervalAllowed(automationIntervalMs)) {
      setSendError("Automation interval must be at least 50 ms.");
      return;
    }

    if (
      requiresFastAutomationConfirmation(automationIntervalMs) &&
      !window.confirm("Run macro with interval under 100 ms?")
    ) {
      return;
    }

    stopAutomation();
    setAutomationMacro(macro);
    recordAutomationSidecarEvent("start", macro);
    automationTimerRef.current = window.setInterval(() => {
      void executeMacro(macro, true);
    }, automationIntervalMs);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, shortcutBindings.toggleFilters)) {
        if (!isEditableShortcutTarget(event.target)) {
          event.preventDefault();
          setShowFiltersPanel((visible) => !visible);
        }
        return;
      }

      if (matchesShortcut(event, shortcutBindings.search)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.settings) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.connectToggle) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        void toggleActiveConnection();
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.exportText) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        exportTerminalBuffer();
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.clearTerminal) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        clearTerminalDisplay();
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.newTab) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        createSessionTab();
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.closeTab) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        void closeSessionTab(sessionTabs.activeTabId);
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.toggleMacros) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        setShowMacrosPanel((visible) => !visible);
        return;
      }

      if (
        matchesShortcut(event, shortcutBindings.refreshPorts) &&
        !isEditableShortcutTarget(event.target)
      ) {
        event.preventDefault();
        refreshPorts().catch(() => {
          // Error state is handled in refreshPorts.
        });
        return;
      }

      if (shouldStopAutomationForKey({ key: event.key, target: event.target })) {
        stopAutomation();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clearTerminalDisplay,
    closeSessionTab,
    createSessionTab,
    exportTerminalBuffer,
    refreshPorts,
    sessionTabs.activeTabId,
    shortcutBindings,
    stopAutomation,
    toggleActiveConnection
  ]);

  useEffect(
    () => () => {
      stopAutomation();
    },
    [stopAutomation]
  );

  const addHighlightRule = (rule: Omit<HighlightRule, "id" | "enabled">) => {
    updateActiveHighlightRules((rules) =>
      rules.length >= MAX_HIGHLIGHT_RULES
        ? rules
        : [...rules, { ...rule, id: createRuleId("highlight"), enabled: true }]
    );
  };

  const addFilterRule = (rule: Omit<FilterRule, "id" | "enabled">) => {
    updateActiveFilterRules((rules) => [
      ...rules,
      { ...rule, id: createRuleId("filter"), enabled: true }
    ]);
  };

  const persistFilterProfiles = () => {
    const profiles = filterProfileStoreRef.current.list();
    setFilterProfiles(profiles);
    saveFilterProfiles(browserStorage(), profiles);
  };

  const saveFilterProfile = (name: string) => {
    const profile = createFilterProfile({
      name,
      filterRules,
      highlightRules
    });

    filterProfileStoreRef.current.upsert(profile);
    persistFilterProfiles();
  };

  const applyFilterProfile = (profileId: string) => {
    const profile = filterProfileStoreRef.current.get(profileId);

    if (!profile) {
      return;
    }

    updateActiveFilterRules(() => profile.filterRules);
    updateActiveHighlightRules(() => profile.highlightRules);
    setActiveSearchIndex(0);
  };

  const deleteFilterProfile = (profileId: string) => {
    filterProfileStoreRef.current.delete(profileId);
    persistFilterProfiles();
  };

  return (
    <main
      className={`app-shell theme-${appSettings.display.theme} platform-${platformName()}`}
      style={appStyle}
    >
      <header className="top-bar">
        <div>
          <h1>MultiSerial</h1>
          <p>Serial communication workspace</p>
        </div>
        <div className="top-bar-actions">
          <span className="status-badge">{updateStatusLabel(updateState)}</span>
          <button
            type="button"
            onClick={() => {
              void checkForUpdates(true);
            }}
            disabled={updateState.status === "checking" || updateState.status === "downloading"}
          >
            Check updates
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <span className="status-badge">{formatStatusLabel(sessionTabs.activeTab.status)}</span>
        </div>
      </header>

      <section className="toolbar" aria-label="Connection controls">
        <select
          aria-label="Serial port"
          value={activeConnectionSettings.portPath}
          onChange={(event) =>
            updateActiveConnectionSettings({ portPath: event.currentTarget.value })
          }
        >
          {ports.length === 0 ? (
            <option value="">No ports loaded</option>
          ) : (
            <>
              <option value="">Choose port</option>
              {ports.map((port) => (
                <option key={port.path} value={port.path}>
                  {port.displayName}
                </option>
              ))}
            </>
          )}
        </select>
        <select
          aria-label="Baud rate"
          value={activeConnectionSettings.baudRate}
          onChange={(event) =>
            updateActiveConnectionSettings({ baudRate: event.currentTarget.value })
          }
        >
          {baudRateOptions(appSettings).map((baudRate) => (
            <option value={baudRate} key={baudRate}>
              {baudRate}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            refreshPorts().catch(() => {
              // Error state is handled in refreshPorts.
            });
          }}
          disabled={portsRefreshing}
          aria-busy={portsRefreshing}
        >
          {portsRefreshing ? "Refreshing" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={() => {
            void toggleActiveConnection();
          }}
          disabled={
            sessionTabs.activeTab.status === "connecting" ||
            sessionTabs.activeTab.status === "disconnecting"
          }
        >
          {sessionTabs.activeTab.serialSessionId ? "Disconnect" : "Connect"}
        </button>
        <button
          type="button"
          aria-pressed={dtrEnabled}
          title="DTR: Data Terminal Ready line. Toggle when the connected device requires host readiness signaling."
          onClick={() => {
            void setLineSignal("dtr", !dtrEnabled);
          }}
          disabled={!activeTerminalSessionId}
        >
          DTR
        </button>
        <button
          type="button"
          aria-pressed={rtsEnabled}
          title="RTS: Request To Send line. Toggle for devices that use manual hardware signaling."
          onClick={() => {
            void setLineSignal("rts", !rtsEnabled);
          }}
          disabled={!activeTerminalSessionId}
        >
          RTS
        </button>
        {portRefreshError ? (
          <span className="inline-error" role="status">
            {portRefreshError}
          </span>
        ) : null}
      </section>

      {statusBanner ? (
        <section className={`status-banner ${statusBanner.kind}`} role="status">
          <span>{statusBanner.message}</span>
          {statusBanner.onAction ? (
            <button type="button" onClick={statusBanner.onAction}>
              {statusBanner.actionLabel}
            </button>
          ) : null}
          <button type="button" aria-label="Dismiss status" onClick={() => setStatusBanner(null)}>
            x
          </button>
        </section>
      ) : null}

      <nav className="tab-bar" aria-label="Session tabs">
        {sessionTabs.tabs.map((tab) => (
          <div className="session-tab" key={tab.id}>
            <button
              type="button"
              aria-pressed={tab.id === sessionTabs.activeTabId}
              onClick={() => activateSessionTab(tab.id)}
            >
              {tab.title}
            </button>
            <span>{tab.status}</span>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => {
                void closeSessionTab(tab.id);
              }}
            >
              x
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label="New session tab"
          onClick={createSessionTab}
          disabled={!sessionTabs.canCreateTab}
        >
          New
        </button>
      </nav>

      <section className="workspace" aria-label="Terminal workspace">
        <aside className="sidebar">
          <button type="button">Ports</button>
          <button
            type="button"
            aria-pressed={showMacrosPanel}
            onClick={() => setShowMacrosPanel((visible) => !visible)}
          >
            Macros
          </button>
          <button
            type="button"
            aria-pressed={showFiltersPanel}
            onClick={() => setShowFiltersPanel((visible) => !visible)}
          >
            Filters
          </button>
          {showMacrosPanel ? (
            <MacroPanel
              macros={macros}
              draft={macroDraft}
              disabled={!activeTerminalSessionId || !!runningMacroId}
              runningMacroId={runningMacroId}
              automationIntervalMs={automationIntervalMs}
              automationMacroId={automationMacro?.id ?? null}
              droppedAutomatedSends={droppedAutomatedSends}
              onDraftChange={setMacroDraft}
              onNew={() => setMacroDraft(emptyMacroDraft)}
              onEdit={editMacro}
              onSave={saveMacroDraft}
              onDelete={deleteMacro}
              onRun={executeMacro}
              onAutomationIntervalChange={setAutomationIntervalMs}
              onStartAutomation={startAutomation}
              onStopAllAutomations={stopAutomation}
            />
          ) : null}
          {showFiltersPanel ? (
            <FilterSearchPanel
              highlightRules={highlightRules}
              filterRules={filterRules}
              filterProfiles={filterProfiles}
              warnings={filterWarnings}
              searchQuery={searchQuery}
              searchMode={searchMode}
              searchMatchCount={searchResult.matches.length}
              activeSearchIndex={searchResult.activeIndex}
              searchInputRef={searchInputRef}
              onAddHighlightRule={addHighlightRule}
              onToggleHighlightRule={(ruleId, enabled) =>
                updateActiveHighlightRules((rules) =>
                  rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule))
                )
              }
              onDeleteHighlightRule={(ruleId) =>
                updateActiveHighlightRules((rules) => rules.filter((rule) => rule.id !== ruleId))
              }
              onAddFilterRule={addFilterRule}
              onToggleFilterRule={(ruleId, enabled) =>
                updateActiveFilterRules((rules) =>
                  rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule))
                )
              }
              onDeleteFilterRule={(ruleId) =>
                updateActiveFilterRules((rules) => rules.filter((rule) => rule.id !== ruleId))
              }
              onSaveFilterProfile={saveFilterProfile}
              onApplyFilterProfile={applyFilterProfile}
              onDeleteFilterProfile={deleteFilterProfile}
              onSearchQueryChange={(query) => {
                setSearchQuery(query);
                setActiveSearchIndex(0);
              }}
              onSearchModeChange={(mode) => {
                setSearchMode(mode);
                setActiveSearchIndex(0);
              }}
              onSearchNext={() =>
                setActiveSearchIndex((index) => nextSearchIndex(index, searchResult.matches.length))
              }
              onSearchPrevious={() =>
                setActiveSearchIndex((index) =>
                  previousSearchIndex(index, searchResult.matches.length)
                )
              }
            />
          ) : null}
        </aside>
        <TerminalPanel
          snapshot={terminalSnapshot}
          lines={filteredTerminalLines}
          highlightsByLineId={highlightsByLineId}
          showTimestamps={showTimestamps}
          timestampFormat={timestampFormat}
          wrapLines={wrapLines}
          onToggleTimestamps={() => setShowTimestamps((value) => !value)}
          onTimestampFormatChange={setTimestampFormat}
          onViewModeChange={(viewMode) => {
            const sessionId = activeTerminalSessionIdRef.current;

            if (!sessionId) {
              return;
            }

            setTerminalSnapshot(terminalStoreRef.current.setViewMode(sessionId, viewMode));
          }}
          onToggleWrapLines={() => setWrapLines((value) => !value)}
          onClear={clearTerminalDisplay}
        />
      </section>

      {automationMacro ? (
        <AutomationBanner
          macroName={automationMacro.name}
          intervalMs={automationIntervalMs}
          droppedAutomatedSends={droppedAutomatedSends}
          onStopAll={stopAutomation}
        />
      ) : null}

      <SendBar
        value={sendValue}
        mode={sendMode}
        lineEnding={lineEnding}
        echoTx={echoTx}
        disabled={!activeTerminalSessionId}
        error={sendError}
        sending={sending}
        selectedFileName={selectedFile?.name ?? null}
        fileSendProgress={fileSendProgress}
        fileSending={fileSending}
        onValueChange={(value) => {
          setSendValue(value);
          setHistoryCursor(null);
        }}
        onModeChange={(mode) => {
          setSendMode(mode);
          setSendError(null);
        }}
        onLineEndingChange={setLineEnding}
        onEchoTxChange={setEchoTx}
        onSend={sendCurrentInput}
        onHistoryPrevious={showPreviousHistoryEntry}
        onHistoryNext={showNextHistoryEntry}
        onFileSelected={(file) => {
          setSelectedFile(file);
          setFileSendProgress(null);
          setSendError(null);
        }}
        onSendFile={sendSelectedFile}
        onCancelFileSend={cancelFileSend}
      />

      <footer className="status-bar">
        <span>{environment.appVersion}</span>
        {buildMetadata ? <span>{buildMetadata.gitCommit}</span> : null}
        <span>{environment.environment}</span>
        <span title={environment.configDir}>config: {environment.configDir}</span>
        <span title={environment.logDir}>logs: {environment.logDir}</span>
        {configStatus ? <span title={configStatus.path}>config loaded</span> : null}
        {logStatus?.path ? <span title={logStatus.path}>session log ready</span> : null}
        <button type="button" onClick={openLogFile} disabled={!logStatus?.path}>
          Open log file
        </button>
        <button type="button" onClick={openLogDirectory}>
          Open log directory
        </button>
        <button type="button" onClick={exportTerminalBuffer}>
          Export text
        </button>
        <button type="button" onClick={exportTerminalHtml}>
          Export HTML
        </button>
      </footer>
      <SettingsDialog
        open={settingsOpen}
        settings={appSettings}
        shortcuts={shortcutBindings}
        saving={settingsSaving}
        error={settingsError}
        onClose={() => setSettingsOpen(false)}
        onSave={(settings, shortcuts) => {
          void saveSettings(settings, shortcuts);
        }}
      />
    </main>
  );
}

function defaultConnectionSettings(settings: AppSettings): TabConnectionSettings {
  return {
    portPath: "",
    baudRate: String(settings.connection.defaultBaudRate)
  };
}

function baudRateOptions(settings: AppSettings): string[] {
  return [...new Set([String(settings.connection.defaultBaudRate), "9600", "115200"])];
}

function safeDownloadName(name: string): string {
  const normalized = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return normalized.length > 0 ? normalized : "terminal-buffer";
}

function buildAutoLogRequest(settings: AppSettings, portPath: string) {
  return {
    path: joinPath(settings.logging.logDirectory, renderLogFilename(settings, portPath)),
    format: settings.logging.logFormat,
    append: settings.logging.appendMode,
    rotationSizeBytes: settings.logging.rotationSizeMb * 1024 * 1024,
    rotationPeriod:
      settings.logging.rotationPeriod === "none" ? null : settings.logging.rotationPeriod,
    maxFilesToKeep: settings.logging.maxFilesToKeep
  };
}

function renderLogFilename(settings: AppSettings, portPath: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replaceAll(":", "-");

  return settings.logging.filenameTemplate
    .replaceAll("{port}", safeDownloadName(portPath.split(/[\\/]/).pop() ?? portPath))
    .replaceAll("{YYYY-MM-DD_HH-mm-ss}", `${date}_${time}`)
    .replaceAll("{YYYY-MM-DD}", date)
    .replaceAll("{HH-mm-ss}", time);
}

function joinPath(directory: string, filename: string): string {
  return `${directory.replace(/[\\/]$/, "")}/${filename}`;
}

function parentPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const separatorIndex = normalized.lastIndexOf("/");

  if (separatorIndex <= 0) {
    return ".";
  }

  return normalized.slice(0, separatorIndex);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatStatusLabel(status: string): string {
  return status
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function platformName(): "linux" | "macos" | "windows" | "other" {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes("linux") || userAgent.includes("linux")) {
    return "linux";
  }

  if (platform.includes("mac")) {
    return "macos";
  }

  if (platform.includes("win")) {
    return "windows";
  }

  return "other";
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function startSyntheticFeed(
  options: SyntheticFeedOptions,
  appendRxBatch: (batch: BackendRxBatch) => void
): Promise<SyntheticFeedResult> {
  const sessionId = options.sessionId ?? browserPreviewSessionId ?? "session-e2e";
  const intervalMs = options.intervalMs ?? 16;
  const totalBytes = Math.floor((options.bytesPerSecond * options.durationMs) / 1000);
  const startedAt = performance.now();
  let sentBytes = 0;
  let sequence = 1;

  return new Promise((resolve) => {
    const emit = () => {
      const elapsedMs = performance.now() - startedAt;
      const targetBytes = Math.min(
        totalBytes,
        Math.floor((options.bytesPerSecond * elapsedMs) / 1000)
      );
      const bytesToSend = targetBytes - sentBytes;

      if (bytesToSend > 0) {
        const bytes = syntheticBytes(sentBytes, bytesToSend);
        sentBytes += bytes.byteLength;
        appendRxBatch({
          sessionId,
          chunks: [{ sequence, timestampWallMs: Date.now(), bytes }],
          rxBytes: sentBytes,
          queuedBytes: 0,
          droppedRxBytes: 0,
          batchIntervalMs: intervalMs,
          drainedAtWallMs: Date.now()
        });
        sequence += 1;
      }

      if (sentBytes >= totalBytes) {
        resolve({
          sessionId,
          bytesSent: sentBytes,
          durationMs: Math.round(performance.now() - startedAt)
        });
        return;
      }

      window.setTimeout(emit, intervalMs);
    };

    emit();
  });
}

function syntheticBytes(offset: number, byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);

  for (let index = 0; index < byteCount; index += 1) {
    const absoluteIndex = offset + index;
    bytes[index] = absoluteIndex % 80 === 79 ? 0x0a : 0x41 + (absoluteIndex % 26);
  }

  return bytes;
}

function createRuleId(prefix: string): string {
  ruleCounter += 1;
  return `${prefix}-${ruleCounter}`;
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const nextRecord = { ...record };
  delete nextRecord[key];
  return nextRecord;
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function buildHighlightsByLineId(
  lines: Array<{ line: { id: string }; highlights: LineHighlight[] }>,
  searchMatches: Array<{ lineIndex: number; start: number; end: number }>,
  activeSearchIndex: number
): Record<string, LineHighlight[]> {
  const highlightsByLineId = Object.fromEntries(
    lines.map((entry) => [entry.line.id, [...entry.highlights]])
  ) as Record<string, LineHighlight[]>;

  searchMatches.forEach((match, index) => {
    const line = lines[match.lineIndex]?.line;

    if (!line) {
      return;
    }

    highlightsByLineId[line.id] ??= [];
    highlightsByLineId[line.id].push({
      ruleId: index === activeSearchIndex ? "search-active" : "search",
      color: index === activeSearchIndex ? "#ff8a65" : "#6fa8dc",
      start: match.start,
      end: match.end
    });
  });

  return highlightsByLineId;
}
