# Serial Connection Guide

## Port Discovery

MultiSerial lists serial ports through the Rust `serialport` backend. It deduplicates port paths and shows USB metadata such as VID, PID, serial number, manufacturer, and product when the OS exposes it.

Use Refresh after plugging in a new adapter. Hotplug polling updates active sessions and can reconnect sessions when the configured device returns.

## Supported Settings

- Baud: standard values and positive custom values accepted by the driver.
- Data bits: 5, 6, 7, or 8.
- Parity: none, even, odd. Mark and space return explicit unsupported errors with the current backend.
- Stop bits: 1 or 2. Stop bit 1.5 returns an explicit unsupported error.
- Flow control: none, software/XON-XOFF, hardware/RTS-CTS.

## Line Signals

DTR and RTS can be toggled while a session is connected. Availability depends on the adapter and driver. If the driver rejects a line update, the UI surfaces the backend error without closing the session.

## Hot-Unplug Behavior

If a connected port disappears, the session moves to a hot-unplugged state. The session can be closed manually or reconnected after the same port path appears again.

## Loopback Check

For a quick adapter check, short TX to RX, select `115200 8N1`, connect, send text, and verify the same bytes appear in the terminal.
