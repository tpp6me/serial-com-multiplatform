import { describe, expect, it } from "vitest";
import { scrubCrashReport, scrubCrashReportString } from "./crashReportScrubber";

describe("crashReportScrubber", () => {
  it("redacts usernames in common local paths", () => {
    expect(scrubCrashReportString("/Users/praveen/work/app")).toBe("/Users/<user>/work/app");
    expect(scrubCrashReportString("/home/alice/.config/multiserial")).toBe(
      "/home/<user>/.config/multiserial"
    );
    expect(scrubCrashReportString("C:\\Users\\Alice\\AppData\\Local")).toBe(
      "C:\\Users\\<user>\\AppData\\Local"
    );
  });

  it("redacts log file paths and serial port names", () => {
    expect(
      scrubCrashReportString(
        "log=/Users/praveen/MultiSerial/logs/session-a.log port=/dev/cu.SLAB_USBtoUART"
      )
    ).toBe("log=/Users/<user>/MultiSerial/logs/<log-file> port=/dev/<serial-port>");
    expect(scrubCrashReportString("log=.dev-data/logs/test.log port=COM12")).toBe(
      "log=.dev-data/logs/<log-file> port=COM<port>"
    );
  });

  it("redacts serial payload and log fields recursively", () => {
    expect(
      scrubCrashReport({
        message: "panic while rendering /Users/praveen/project",
        serialPayload: "SECRET DEVICE DATA",
        nested: {
          terminalLines: ["token=secret"],
          context: "port /dev/ttyUSB0"
        }
      })
    ).toEqual({
      message: "panic while rendering /Users/<user>/project",
      serialPayload: "[redacted]",
      nested: {
        terminalLines: "[redacted]",
        context: "port /dev/<serial-port>"
      }
    });
  });
});
