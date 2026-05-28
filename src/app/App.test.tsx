import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings";
import { App } from "./App";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock
}));

describe("App", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();

    invokeMock.mockImplementation((command: string) => {
      switch (command) {
        case "environment_info":
          return Promise.resolve({
            appName: "MultiSerial",
            appVersion: "0.1.0",
            environment: "test",
            configDir: ".dev-data/test-config",
            logDir: ".dev-data/test-logs",
            tempDir: ".dev-data/test-tmp"
          });
        case "build_metadata":
          return Promise.resolve({
            appName: "MultiSerial",
            appVersion: "0.1.0",
            gitCommit: "test",
            target: "test",
            profile: "test"
          });
        case "load_config":
          return Promise.resolve({
            config: DEFAULT_APP_SETTINGS,
            path: ".dev-data/test-config/config.json",
            created: false,
            migrated: false,
            backedUpInvalid: false,
            strippedUnknownKeys: false
          });
        case "list_serial_ports":
          return Promise.resolve([]);
        default:
          return Promise.reject(new Error(`Unexpected invoke command: ${command}`));
      }
    });
    listenMock.mockResolvedValue(() => undefined);
  });

  it("renders disconnected empty state", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    expect(screen.getByRole("heading", { name: "MultiSerial" })).toBeInTheDocument();
    expect(screen.getByText("No terminal data received.")).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("focuses the terminal search field with Cmd+F", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    fireEvent.keyDown(window, { key: "f", metaKey: true });

    expect(screen.getByLabelText("Search terminal")).toHaveFocus();
  });

  it("refreshes the serial port list on demand", async () => {
    let listCalls = 0;

    invokeMock.mockImplementation((command: string) => {
      if (command === "list_serial_ports") {
        listCalls += 1;

        return Promise.resolve(
          listCalls === 1
            ? []
            : [
                {
                  path: "/dev/cu.usbserial-test",
                  displayName: "USB Loopback",
                  vid: 0x10c4,
                  pid: 0xea60,
                  serialNumber: "0001",
                  manufacturer: "Silicon Labs",
                  product: "CP2102",
                  portType: "usb"
                }
              ]
        );
      }

      if (command === "load_config") {
        return Promise.resolve({
          config: DEFAULT_APP_SETTINGS,
          path: ".dev-data/test-config/config.json",
          created: false,
          migrated: false,
          backedUpInvalid: false,
          strippedUnknownKeys: false
        });
      }

      return Promise.resolve({});
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("USB Loopback")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("list_serial_ports");
  });

  it("creates up to four disconnected session tabs and closes them without confirmation", async () => {
    render(<App />);

    const newTab = await screen.findByRole("button", { name: "New session tab" });
    fireEvent.click(newTab);
    fireEvent.click(newTab);
    fireEvent.click(newTab);

    expect(screen.getByRole("button", { name: "Session 4" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(newTab).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Close Session 4" }));

    expect(screen.queryByRole("button", { name: "Session 4" })).not.toBeInTheDocument();
    expect(newTab).not.toBeDisabled();
  });

  it("handles tab and panel keyboard shortcuts", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    fireEvent.keyDown(window, { key: "t", metaKey: true });

    expect(screen.getByRole("button", { name: "Session 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.keyDown(window, { key: "m", metaKey: true, shiftKey: true });
    expect(screen.queryByLabelText("Macro name")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    expect(screen.queryByLabelText("Search terminal")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s", metaKey: true, shiftKey: true });
    expect(screen.getAllByText("No terminal data is available to export.").length).toBeGreaterThan(
      0
    );

    fireEvent.keyDown(window, { key: "w", metaKey: true });
    expect(screen.queryByRole("button", { name: "Session 2" })).not.toBeInTheDocument();
  });

  it("connects and disconnects the active tab with Cmd+K", async () => {
    let hotplugListener: ((event: { payload: string }) => void) | null = null;

    listenMock.mockImplementation((eventName: string, callback: unknown) => {
      if (eventName === "serial-session-hot-unplugged") {
        hotplugListener = callback as (event: { payload: string }) => void;
      }

      return Promise.resolve(() => undefined);
    });
    invokeMock.mockImplementation((command: string, args?: { sessionId?: string }) => {
      if (command === "list_serial_ports") {
        return Promise.resolve([
          {
            path: "/dev/cu.test",
            displayName: "USB Test",
            vid: 0x10c4,
            pid: 0xea60,
            serialNumber: "0001",
            manufacturer: "Silicon Labs",
            product: "CP2102",
            portType: "usb"
          }
        ]);
      }

      if (command === "open_serial_session") {
        return Promise.resolve({
          sessionId: "session-test",
          state: "connected",
          config: {
            portPath: "/dev/cu.test",
            baudRate: 115200,
            dataBits: 8,
            parity: "none",
            stopBits: "1",
            flowControl: "none"
          }
        });
      }

      if (command === "close_serial_session") {
        return Promise.resolve({
          sessionId: args?.sessionId ?? "session-test",
          state: "disconnected"
        });
      }

      if (command === "serial_log_status") {
        return Promise.resolve({
          sessionId: "session-test",
          active: true,
          path: ".dev-data/test-logs/session-test.log",
          format: "timestampedText",
          rxBytes: 0,
          loggedBytes: 0,
          logOverrunCount: 0,
          currentSize: 0,
          queuedBytes: 0,
          error: null
        });
      }

      if (command === "open_path") {
        return Promise.resolve({});
      }

      if (command === "serial_set_dtr" || command === "serial_set_rts") {
        return Promise.resolve({});
      }

      if (command === "load_config") {
        return Promise.resolve({
          config: DEFAULT_APP_SETTINGS,
          path: ".dev-data/test-config/config.json",
          created: false,
          migrated: false,
          backedUpInvalid: false,
          strippedUnknownKeys: false
        });
      }

      return Promise.resolve({});
    });

    render(<App />);

    await screen.findByText("USB Test");
    fireEvent.change(screen.getByLabelText("Serial port"), { target: { value: "/dev/cu.test" } });
    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(await screen.findByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "USB Test" })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Data Terminal Ready/));
    fireEvent.click(screen.getByTitle(/Request To Send/));
    expect(invokeMock).toHaveBeenCalledWith("serial_set_dtr", {
      request: { sessionId: "session-test", enabled: true }
    });
    expect(invokeMock).toHaveBeenCalledWith("serial_set_rts", {
      request: { sessionId: "session-test", enabled: true }
    });
    expect(await screen.findByText("session log ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open log file" }));
    fireEvent.click(screen.getByRole("button", { name: "Open log directory" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("open_path", {
        request: { path: ".dev-data/test-logs/session-test.log", kind: "file" }
      })
    );
    expect(invokeMock).toHaveBeenCalledWith("open_path", {
      request: { path: ".dev-data/test-logs", kind: "directory" }
    });
    await waitFor(() => expect(hotplugListener).not.toBeNull());

    await act(async () => {
      hotplugListener?.({ payload: "session-test" });
    });

    expect(screen.getByText("USB Test was unplugged.")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument()
    );
    expect(invokeMock).toHaveBeenCalledWith("close_serial_session", {
      sessionId: "session-test"
    });
  });

  it("keeps connection settings scoped to the active tab", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    fireEvent.change(screen.getByLabelText("Baud rate"), { target: { value: "9600" } });
    fireEvent.click(screen.getByRole("button", { name: "New session tab" }));

    expect(screen.getByLabelText("Baud rate")).toHaveValue("115200");

    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    expect(screen.getByLabelText("Baud rate")).toHaveValue("9600");
  });

  it("keeps filter rules scoped to the active tab", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    fireEvent.change(screen.getByLabelText("Filter pattern"), { target: { value: "ERR" } });
    const filtersSection = screen
      .getAllByText("Filters")
      .find((element) => element.tagName === "H2")
      ?.closest(".filter-section") as HTMLElement;
    fireEvent.click(within(filtersSection).getByText("Add"));

    expect(screen.getByText("ERR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New session tab" }));

    expect(screen.queryByText("ERR")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New session" }));

    expect(screen.getByText("ERR")).toBeInTheDocument();
  });

  it("routes terminal shortcuts to the active session", async () => {
    let rxBatchListener: ((event: { payload: BackendRxBatchFixture }) => void) | null = null;

    listenMock.mockImplementation((eventName: string, callback: unknown) => {
      if (eventName === "serial-rx-batch") {
        rxBatchListener = callback as (event: { payload: BackendRxBatchFixture }) => void;
      }

      return Promise.resolve(() => undefined);
    });

    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    await waitFor(() => expect(rxBatchListener).not.toBeNull());

    await act(async () => {
      rxBatchListener?.({ payload: rxBatch("session-a", "alpha\n") });
    });
    expect(screen.getByText("alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New session tab" }));

    await act(async () => {
      rxBatchListener?.({ payload: rxBatch("session-b", "beta\n") });
    });
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "session-a" }));
    expect(screen.getByText("alpha")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "l", metaKey: true });
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "session-b" }));
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("opens settings with Cmd+Comma and saves validated settings", async () => {
    invokeMock.mockImplementation(
      (command: string, args?: { config?: typeof DEFAULT_APP_SETTINGS }) => {
        if (command === "save_config") {
          return Promise.resolve({
            config: args?.config ?? DEFAULT_APP_SETTINGS,
            path: ".dev-data/test-config/config.json",
            created: false,
            migrated: false,
            backedUpInvalid: false,
            strippedUnknownKeys: false
          });
        }

        if (command === "load_config") {
          return Promise.resolve({
            config: DEFAULT_APP_SETTINGS,
            path: ".dev-data/test-config/config.json",
            created: false,
            migrated: false,
            backedUpInvalid: false,
            strippedUnknownKeys: false
          });
        }

        if (command === "list_serial_ports") {
          return Promise.resolve([]);
        }

        return Promise.resolve({});
      }
    );

    render(<App />);

    await screen.findByRole("button", { name: "Refresh" });
    fireEvent.keyDown(window, { key: ",", metaKey: true });

    fireEvent.change(screen.getByLabelText("Terminal font size"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("save_config", {
        config: expect.objectContaining({
          display: expect.objectContaining({ fontSize: 16 })
        })
      })
    );
  });
});

type BackendRxBatchFixture = {
  sessionId: string;
  chunks: Array<{
    sequence: number;
    timestampWallMs: number;
    bytes: number[];
  }>;
  rxBytes: number;
  queuedBytes: number;
  droppedRxBytes: number;
  batchIntervalMs: number;
  drainedAtWallMs: number;
};

function rxBatch(sessionId: string, text: string): BackendRxBatchFixture {
  const bytes = [...new TextEncoder().encode(text)];
  const timestampWallMs = Date.now() - 1_000;

  return {
    sessionId,
    chunks: [
      {
        sequence: 1,
        timestampWallMs,
        bytes
      }
    ],
    rxBytes: bytes.length,
    queuedBytes: 0,
    droppedRxBytes: 0,
    batchIntervalMs: 16,
    drainedAtWallMs: timestampWallMs
  };
}
