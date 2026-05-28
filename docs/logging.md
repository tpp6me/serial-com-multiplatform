# Logging Durability Guide

## Log Locations

Production logs default to:

```text
~/MultiSerial/logs
```

Development and test runs use isolated `.dev-data` paths. Do not use global user log paths for automated tests.

## Formats

- Plain text: RX/TX text output.
- Timestamped text: text output with direction and timestamp metadata.
- Binary: framed records that preserve all bytes, including nulls and invalid UTF-8.

## Rotation

Logging supports size and daily rotation. Retention removes old rotated files after the configured keep count.

## Failure Behavior

Log write errors pause logging and keep the serial session alive. The UI reports unavailable paths, permission failures, disk-full errors, and symlink rejection.

## Self-Test

Run deterministic logging tests with:

```bash
corepack pnpm rust:test
```

Use hardware logging tests only with a loopback adapter and a temporary log directory.

To verify auto-log ordering manually:

1. Set a temporary log directory under `.dev-data/logs`.
2. Enable auto-log-on-connect in settings.
3. Connect to a loopback adapter or browser mock serial session.
4. Send or inject a known first payload, for example `Hello\r\n`.
5. Confirm the first RX payload appears in the new session log and `rx_bytes` matches `logged_bytes`.

The backend starts the log worker before starting the RX worker for `open_serial_session`, so bytes read immediately after connect are queued for logging before they are delivered to the terminal.
