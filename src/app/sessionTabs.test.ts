import { describe, expect, it } from "vitest";
import {
  MAX_SESSION_TABS,
  SessionTabStore,
  createInitialSessionTabState,
  requiresCloseConfirmation
} from "./sessionTabs";

describe("SessionTabStore", () => {
  it("creates an initial disconnected tab", () => {
    const store = new SessionTabStore();
    const snapshot = store.snapshot();

    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.activeTab.title).toBe("New session");
    expect(snapshot.activeSerialSessionId).toBeNull();
    expect(snapshot.canCreateTab).toBe(true);
  });

  it("creates new connection tabs and routes the active serial session", () => {
    const store = new SessionTabStore(createInitialSessionTabState("session-a"));
    const firstTabId = store.snapshot().activeTabId;

    const second = store.createTab();
    expect(second.activeSerialSessionId).toBeNull();

    const bound = store.bindSerialSession(second.activeTabId, "session-b", {
      title: "MOCK_B"
    });
    expect(bound.activeTab.title).toBe("MOCK_B");
    expect(bound.activeSerialSessionId).toBe("session-b");

    const first = store.activate(firstTabId);
    expect(first.activeSerialSessionId).toBe("session-a");
  });

  it("enforces the four-session limit", () => {
    const store = new SessionTabStore();

    for (let index = 1; index < MAX_SESSION_TABS; index += 1) {
      store.createTab();
    }

    expect(store.snapshot().tabs).toHaveLength(MAX_SESSION_TABS);
    expect(store.snapshot().canCreateTab).toBe(false);
    expect(() => store.createTab()).toThrow("Only 4 sessions");
  });

  it("moves active routing when closing tabs", () => {
    const store = new SessionTabStore(createInitialSessionTabState("session-a"));
    const firstTabId = store.snapshot().activeTabId;
    const second = store.createTab();
    store.bindSerialSession(second.activeTabId, "session-b");

    const afterClosingSecond = store.close(second.activeTabId);
    expect(afterClosingSecond.activeTabId).toBe(firstTabId);
    expect(afterClosingSecond.activeSerialSessionId).toBe("session-a");

    const afterClosingLast = store.close(firstTabId);
    expect(afterClosingLast.tabs).toHaveLength(1);
    expect(afterClosingLast.activeSerialSessionId).toBeNull();
  });

  it("disconnects a tab without closing it", () => {
    const store = new SessionTabStore(createInitialSessionTabState("session-a"));
    const tabId = store.snapshot().activeTabId;

    const snapshot = store.disconnectSerialSession(tabId);

    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.activeSerialSessionId).toBeNull();
    expect(snapshot.activeTab.status).toBe("disconnected");
  });

  it("requires confirmation only for connected tab close", () => {
    const store = new SessionTabStore();
    const disconnected = store.snapshot().activeTab;
    const connected = store.bindSerialSession(disconnected.id, "session-a").activeTab;

    expect(requiresCloseConfirmation(disconnected)).toBe(false);
    expect(requiresCloseConfirmation(connected)).toBe(true);
  });
});
