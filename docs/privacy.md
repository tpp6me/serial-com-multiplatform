# Privacy And Crash Reporting

## Local Data

MultiSerial stores settings locally and writes logs only when logging is enabled. Production logs default to `~/MultiSerial/logs`.

Serial payloads can contain sensitive device data. Do not attach logs to issues unless they have been reviewed and redacted.

## Telemetry

Crash reporting is disabled by default in the current config model. No telemetry upload flow is implemented unless explicitly added in a later release.

Crash-report data must pass through the local scrubber before any future upload flow is enabled. The scrubber redacts serial payload fields, terminal/log fields, local log file paths, serial port paths, and usernames in common macOS, Linux, and Windows paths.

## Update Checks

Update checks use the configured Tauri updater endpoint:

```text
https://updates.bifrost-sscom.com/multiserial/{{target}}/{{arch}}/{{current_version}}
```

The updater sends the app target, architecture, and current version through Tauri's updater request. MultiSerial also passes the selected release channel as the updater target, such as `multiserial-stable`.

Users can disable automatic checks in settings. Auto-download stores the signed update package locally through Tauri's updater plugin but does not install it without a separate install action.
