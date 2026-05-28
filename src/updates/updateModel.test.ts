import { describe, expect, it, vi } from "vitest";
import {
  buildUpdateCheckOptions,
  runConfiguredUpdateCheck,
  shouldAutoCheckUpdates,
  updateStatusLabel,
  type UpdateApi,
  type UpdateCheckState,
  type UpdateSettings
} from "./updateModel";

const stableSettings: UpdateSettings = {
  autoCheck: true,
  autoDownload: false,
  releaseChannel: "stable"
};

describe("updateModel", () => {
  it("skips checks when auto-check is disabled", async () => {
    const api: UpdateApi = {
      check: vi.fn()
    };
    const settings = { ...stableSettings, autoCheck: false };

    await expect(runConfiguredUpdateCheck(settings, {}, api)).resolves.toEqual({
      status: "disabled"
    });
    expect(shouldAutoCheckUpdates(settings)).toBe(false);
    expect(api.check).not.toHaveBeenCalled();
  });

  it("builds a stable-channel update target", () => {
    expect(buildUpdateCheckOptions(stableSettings)).toMatchObject({
      target: "multiserial-stable",
      timeout: 10_000,
      allowDowngrades: false
    });
  });

  it("reports current when no update is returned", async () => {
    const states: UpdateCheckState[] = [];
    const api: UpdateApi = {
      check: vi.fn().mockResolvedValue(null)
    };

    await expect(
      runConfiguredUpdateCheck(stableSettings, { onState: (state) => states.push(state) }, api)
    ).resolves.toEqual({
      status: "current",
      channel: "stable"
    });

    expect(states.map((state) => state.status)).toEqual(["checking", "current"]);
  });

  it("reports available update without downloading when auto-download is off", async () => {
    const api: UpdateApi = {
      check: vi.fn().mockResolvedValue({
        version: "0.2.0",
        body: "Release notes"
      })
    };

    await expect(runConfiguredUpdateCheck(stableSettings, {}, api)).resolves.toEqual({
      status: "available",
      channel: "stable",
      version: "0.2.0",
      notes: "Release notes"
    });
  });

  it("downloads an update when auto-download is enabled", async () => {
    const download = vi.fn(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 25 } });
      onEvent({ event: "Progress", data: { chunkLength: 75 } });
      onEvent({ event: "Finished" });
    });
    const api: UpdateApi = {
      check: vi.fn().mockResolvedValue({
        version: "0.2.0",
        download
      })
    };
    const states: UpdateCheckState[] = [];

    await expect(
      runConfiguredUpdateCheck(
        { ...stableSettings, autoDownload: true },
        { onState: (state) => states.push(state) },
        api
      )
    ).resolves.toEqual({
      status: "downloaded",
      channel: "stable",
      version: "0.2.0"
    });

    expect(download).toHaveBeenCalledTimes(1);
    expect(updateStatusLabel(states[2])).toBe("Downloading 25%");
    expect(updateStatusLabel(states[3])).toBe("Downloading 100%");
  });

  it("surfaces updater errors", async () => {
    const api: UpdateApi = {
      check: vi.fn().mockRejectedValue(new Error("network unavailable"))
    };

    await expect(runConfiguredUpdateCheck(stableSettings, {}, api)).resolves.toEqual({
      status: "error",
      channel: "stable",
      message: "network unavailable"
    });
  });
});
