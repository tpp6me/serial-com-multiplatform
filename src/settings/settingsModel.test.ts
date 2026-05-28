import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, normalizeSettings, validateSettings } from "./settingsModel";

describe("settingsModel", () => {
  it("validates default settings", () => {
    expect(validateSettings(DEFAULT_APP_SETTINGS).ok).toBe(true);
  });

  it("normalizes legacy timestamp format to the UI enum", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      display: {
        ...DEFAULT_APP_SETTINGS.display,
        timestampFormat: "HH:mm:ss.SSS" as const
      }
    };

    expect(normalizeSettings(settings).display.timestampFormat).toBe("time");
  });

  it("reports invalid numeric settings before save", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      send: {
        ...DEFAULT_APP_SETTINGS.send,
        fileSendChunkBytes: 0
      }
    };
    const result = validateSettings(settings);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain(
      "File send chunk must be between 1 and 65536."
    );
  });
});
