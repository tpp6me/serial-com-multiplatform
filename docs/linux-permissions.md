# Linux Permissions And ModemManager

## Serial Permissions

Most Linux distributions restrict `/dev/ttyUSB*`, `/dev/ttyACM*`, and similar devices to users in a serial group such as `dialout`.

Check a device:

```bash
ls -l /dev/ttyUSB0
groups
```

If needed, add the user to the group outside the app:

```bash
sudo usermod -aG dialout "$USER"
```

Log out and back in before testing again.

## WebKitGTK Packages

Linux builds rely on WebKitGTK and GTK runtime packages. The Debian bundle metadata declares WebKitGTK, GTK, and AppIndicator dependencies, but install behavior must be verified on Ubuntu 22.04 and 24.04.

## ModemManager Conflicts

ModemManager may probe USB serial adapters and temporarily hold the port. Symptoms include open failures, delayed reads, or reconnect churn.

Troubleshooting steps:

1. Wait a few seconds and retry connect.
2. Check whether ModemManager is touching the device with system logs.
3. Add a udev rule or disable ModemManager for the adapter only if your environment allows it.

Do not require users to disable ModemManager globally in product documentation.
