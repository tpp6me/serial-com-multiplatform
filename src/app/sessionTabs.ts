export const MAX_SESSION_TABS = 4;

export type SessionTabStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "hot-unplugged"
  | "reconnecting"
  | "error";

export type SessionTab = {
  id: string;
  title: string;
  serialSessionId: string | null;
  status: SessionTabStatus;
};

export type SessionTabState = {
  tabs: SessionTab[];
  activeTabId: string;
};

export type SessionTabSnapshot = SessionTabState & {
  activeTab: SessionTab;
  activeSerialSessionId: string | null;
  canCreateTab: boolean;
};

export class SessionTabStore {
  private state: SessionTabState;
  private nextTabNumber: number;

  constructor(initialState: SessionTabState = createInitialSessionTabState()) {
    if (initialState.tabs.length === 0) {
      throw new Error("session tab state must contain at least one tab");
    }

    if (initialState.tabs.length > MAX_SESSION_TABS) {
      throw new Error(`session tab state cannot exceed ${MAX_SESSION_TABS} tabs`);
    }

    if (!initialState.tabs.some((tab) => tab.id === initialState.activeTabId)) {
      throw new Error("active tab must exist");
    }

    this.state = copyState(initialState);
    this.nextTabNumber = initialState.tabs.length + 1;
  }

  snapshot(): SessionTabSnapshot {
    return snapshotState(this.state);
  }

  createTab(): SessionTabSnapshot {
    if (this.state.tabs.length >= MAX_SESSION_TABS) {
      throw new Error(`Only ${MAX_SESSION_TABS} sessions can be open at once.`);
    }

    const tab = createSessionTab(this.nextTabNumber);
    this.nextTabNumber += 1;
    this.state = {
      tabs: [...this.state.tabs, tab],
      activeTabId: tab.id
    };

    return this.snapshot();
  }

  activate(tabId: string): SessionTabSnapshot {
    this.requireTab(tabId);
    this.state = { ...this.state, activeTabId: tabId };
    return this.snapshot();
  }

  close(tabId: string): SessionTabSnapshot {
    this.requireTab(tabId);

    if (this.state.tabs.length === 1) {
      const replacement = createSessionTab(this.nextTabNumber);
      this.nextTabNumber += 1;
      this.state = {
        tabs: [replacement],
        activeTabId: replacement.id
      };
      return this.snapshot();
    }

    const tabIndex = this.state.tabs.findIndex((tab) => tab.id === tabId);
    const tabs = this.state.tabs.filter((tab) => tab.id !== tabId);
    const activeTabId =
      this.state.activeTabId === tabId
        ? tabs[Math.max(0, tabIndex - 1)].id
        : this.state.activeTabId;

    this.state = { tabs, activeTabId };
    return this.snapshot();
  }

  bindSerialSession(
    tabId: string,
    serialSessionId: string,
    options: { title?: string; status?: SessionTabStatus } = {}
  ): SessionTabSnapshot {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              serialSessionId,
              title: options.title ?? tab.title,
              status: options.status ?? "connected"
            }
          : tab
      )
    };
    this.requireTab(tabId);
    return this.snapshot();
  }

  updateStatus(tabId: string, status: SessionTabStatus): SessionTabSnapshot {
    this.requireTab(tabId);
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((tab) => (tab.id === tabId ? { ...tab, status } : tab))
    };
    return this.snapshot();
  }

  disconnectSerialSession(tabId: string): SessionTabSnapshot {
    this.requireTab(tabId);
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: tab.title.startsWith("Session") ? tab.title : "New session",
              serialSessionId: null,
              status: "disconnected"
            }
          : tab
      )
    };
    return this.snapshot();
  }

  tabForSerialSession(serialSessionId: string): SessionTab | null {
    return this.state.tabs.find((tab) => tab.serialSessionId === serialSessionId) ?? null;
  }

  private requireTab(tabId: string): SessionTab {
    const tab = this.state.tabs.find((candidate) => candidate.id === tabId);

    if (!tab) {
      throw new Error(`Unknown session tab: ${tabId}`);
    }

    return tab;
  }
}

export function createInitialSessionTabState(initialSessionId?: string): SessionTabState {
  const firstTab = createSessionTab(1, {
    serialSessionId: initialSessionId ?? null,
    status: initialSessionId ? "connected" : "disconnected",
    title: initialSessionId ? "Session 1" : "New session"
  });

  return {
    tabs: [firstTab],
    activeTabId: firstTab.id
  };
}

export function requiresCloseConfirmation(tab: SessionTab): boolean {
  return tab.status === "connected";
}

function createSessionTab(
  tabNumber: number,
  overrides: Partial<Omit<SessionTab, "id">> = {}
): SessionTab {
  return {
    id: `tab-${tabNumber}`,
    title: `Session ${tabNumber}`,
    serialSessionId: null,
    status: "disconnected",
    ...overrides
  };
}

function snapshotState(state: SessionTabState): SessionTabSnapshot {
  const copied = copyState(state);
  const activeTab = copied.tabs.find((tab) => tab.id === copied.activeTabId);

  if (!activeTab) {
    throw new Error("active tab must exist");
  }

  return {
    ...copied,
    activeTab,
    activeSerialSessionId: activeTab.serialSessionId,
    canCreateTab: copied.tabs.length < MAX_SESSION_TABS
  };
}

function copyState(state: SessionTabState): SessionTabState {
  return {
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((tab) => ({ ...tab }))
  };
}
