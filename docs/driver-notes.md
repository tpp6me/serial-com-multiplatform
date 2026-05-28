# Platform Driver Notes

## macOS

Common adapters expose ports as `/dev/cu.*`. Prefer `/dev/cu.*` for initiating connections from MultiSerial instead of `/dev/tty.*`.

Apple Silicon and Intel builds should be verified separately unless a universal artifact is produced. CP210x, FTDI, CH340, and CDC-ACM adapters may require vendor drivers depending on macOS version and adapter firmware.

## Windows

Serial devices appear as `COMx`. WebView2 is required for the Tauri webview; the NSIS config uses the silent WebView2 bootstrapper.

Driver packages may be required for CP210x, FTDI, CH340, and some CDC-ACM devices. Verify COM port listing on both Windows 10 and Windows 11 before release.

## Linux

USB serial devices usually appear as `/dev/ttyUSB*` or `/dev/ttyACM*`. User permissions and ModemManager behavior are the most common connection issues.
