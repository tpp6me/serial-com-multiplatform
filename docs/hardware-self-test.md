# Hardware Self-Test Checklist

## Loopback Setup

Short TX to RX on the adapter. Leave flow-control pins disconnected unless explicitly testing RTS/CTS.

## Basic Test

```bash
MULTISERIAL_LOOPBACK_PORT=/dev/cu.SLAB_USBtoUART \
MULTISERIAL_LOOPBACK_BAUD=115200 \
MULTISERIAL_LOOPBACK_BYTES=289 \
node scripts/run-rust.mjs cargo test \
  --manifest-path src-tauri/Cargo.toml \
  --test loopback_hardware -- --ignored --nocapture
```

Adjust the port path for the host OS.

## High-Rate Test

Use a known-good adapter and short cable:

```bash
MULTISERIAL_LOOPBACK_PORT=/dev/cu.SLAB_USBtoUART \
MULTISERIAL_LOOPBACK_BAUD=921600 \
MULTISERIAL_LOOPBACK_BYTES=10485760 \
MULTISERIAL_LOOPBACK_TIMEOUT_SECS=180 \
node scripts/run-rust.mjs cargo test \
  --manifest-path src-tauri/Cargo.toml \
  --test loopback_hardware -- --ignored --nocapture
```

The test must report matching TX/RX byte counts and matching SHA-256 hashes.

## Hotplug Test

Run only when someone can unplug and replug the adapter:

```bash
MULTISERIAL_HOTPLUG_PORT=/dev/cu.usbserial-0001 \
MULTISERIAL_HOTPLUG_CYCLES=1 \
MULTISERIAL_HOTPLUG_TIMEOUT_SECS=45 \
MULTISERIAL_HOTPLUG_INTERACTIVE=1 \
node scripts/run-rust.mjs cargo test \
  --manifest-path src-tauri/Cargo.toml \
  --test hotplug_hardware -- --ignored --nocapture
```

Record adapter model, OS version, port path, baud rate, byte count, and result in `docs/spike-results.md` or a release test log.
