# Quick Start

## Install And Launch

Use the packaged installer for your platform once release artifacts are available. For local development on macOS:

```bash
corepack pnpm install
corepack pnpm tauri:dev
```

Development runs use `.dev-data/` for config, logs, and temp files.

## Connect To A Device

1. Connect a USB serial adapter or native serial device.
2. Select the port from the toolbar.
3. Confirm baud rate, data bits, parity, stop bits, and flow control.
4. Click Connect.
5. Use Refresh if the device was connected after launch.

## Send And Receive

Incoming data appears in the terminal immediately. Use the send bar for text or hex data. Text sends use the configured line ending. Hex sends accept byte pairs such as `01 02 ff`.

## Logging

Use Start log to record RX/TX traffic. Logs default to `~/MultiSerial/logs` in production and `.dev-data/logs` in development. Use the log file and log folder buttons to open generated logs.

## Settings

Open settings to adjust defaults for serial connections, display behavior, logging, send history, and shortcuts. Settings are stored in the platform app config directory in packaged builds.
