import {
  check,
  type CheckOptions,
  type DownloadEvent,
  type Update
} from "@tauri-apps/plugin-updater";
import type { AppSettings } from "../settings";

export type UpdateSettings = AppSettings["updates"];

export type UpdateCheckState =
  | { status: "idle" }
  | { status: "disabled" }
  | { status: "checking"; channel: UpdateSettings["releaseChannel"] }
  | { status: "current"; channel: UpdateSettings["releaseChannel"] }
  | {
      status: "available";
      channel: UpdateSettings["releaseChannel"];
      version: string;
      notes?: string;
    }
  | {
      status: "downloading";
      channel: UpdateSettings["releaseChannel"];
      version: string;
      downloadedBytes: number;
      contentLength?: number;
    }
  | {
      status: "downloaded";
      channel: UpdateSettings["releaseChannel"];
      version: string;
    }
  | {
      status: "error";
      channel: UpdateSettings["releaseChannel"];
      message: string;
    };

export type UpdateApi = {
  check(options?: CheckOptions): Promise<Update | null>;
};

export type UpdateCheckCallbacks = {
  onState?: (state: UpdateCheckState) => void;
};

const DEFAULT_UPDATE_TIMEOUT_MS = 10_000;

export function shouldAutoCheckUpdates(settings: UpdateSettings): boolean {
  return settings.autoCheck;
}

export function buildUpdateCheckOptions(settings: UpdateSettings): CheckOptions {
  return {
    target: `multiserial-${settings.releaseChannel}`,
    timeout: DEFAULT_UPDATE_TIMEOUT_MS,
    allowDowngrades: false
  };
}

export async function runConfiguredUpdateCheck(
  settings: UpdateSettings,
  callbacks: UpdateCheckCallbacks = {},
  api: UpdateApi = { check }
): Promise<UpdateCheckState> {
  if (!shouldAutoCheckUpdates(settings)) {
    const disabled: UpdateCheckState = { status: "disabled" };
    callbacks.onState?.(disabled);
    return disabled;
  }

  callbacks.onState?.({ status: "checking", channel: settings.releaseChannel });

  try {
    const update = await api.check(buildUpdateCheckOptions(settings));

    if (!update) {
      const current: UpdateCheckState = {
        status: "current",
        channel: settings.releaseChannel
      };
      callbacks.onState?.(current);
      return current;
    }

    if (!settings.autoDownload) {
      const available: UpdateCheckState = {
        status: "available",
        channel: settings.releaseChannel,
        version: update.version,
        notes: update.body
      };
      callbacks.onState?.(available);
      return available;
    }

    let downloadedBytes = 0;
    let contentLength: number | undefined;

    await update.download((event) => {
      const progress = reduceDownloadEvent(event, downloadedBytes, contentLength);
      downloadedBytes = progress.downloadedBytes;
      contentLength = progress.contentLength;

      callbacks.onState?.({
        status: "downloading",
        channel: settings.releaseChannel,
        version: update.version,
        downloadedBytes,
        contentLength
      });
    });

    const downloaded: UpdateCheckState = {
      status: "downloaded",
      channel: settings.releaseChannel,
      version: update.version
    };
    callbacks.onState?.(downloaded);
    return downloaded;
  } catch (error) {
    const failed: UpdateCheckState = {
      status: "error",
      channel: settings.releaseChannel,
      message: error instanceof Error ? error.message : String(error)
    };
    callbacks.onState?.(failed);
    return failed;
  }
}

export function updateStatusLabel(state: UpdateCheckState): string {
  switch (state.status) {
    case "idle":
      return "Updates idle";
    case "disabled":
      return "Updates off";
    case "checking":
      return `Checking ${state.channel}`;
    case "current":
      return `Current on ${state.channel}`;
    case "available":
      return `Update ${state.version}`;
    case "downloading":
      return state.contentLength
        ? `Downloading ${Math.round((state.downloadedBytes / state.contentLength) * 100)}%`
        : `Downloading ${state.version}`;
    case "downloaded":
      return `Downloaded ${state.version}`;
    case "error":
      return "Update check failed";
  }
}

function reduceDownloadEvent(
  event: DownloadEvent,
  downloadedBytes: number,
  contentLength?: number
): { downloadedBytes: number; contentLength?: number } {
  if (event.event === "Started") {
    return {
      downloadedBytes: 0,
      contentLength: event.data.contentLength
    };
  }

  if (event.event === "Progress") {
    return {
      downloadedBytes: downloadedBytes + event.data.chunkLength,
      contentLength
    };
  }

  return {
    downloadedBytes,
    contentLength
  };
}
