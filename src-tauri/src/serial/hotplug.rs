use std::thread;
use std::time::Duration;

use super::HOTPLUG_POLL_INTERVAL_MS;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotplugSourceKind {
    Macos,
    Windows,
    Linux,
    PollingFallback,
}

#[derive(Debug, Clone, Copy)]
pub struct PlatformHotplugSource {
    kind: HotplugSourceKind,
    poll_interval: Duration,
}

impl PlatformHotplugSource {
    pub fn current() -> Self {
        Self {
            kind: current_platform_hotplug_source_kind(),
            poll_interval: Duration::from_millis(HOTPLUG_POLL_INTERVAL_MS),
        }
    }

    pub fn wait_for_change_hint(&self) {
        match self.kind {
            HotplugSourceKind::Macos
            | HotplugSourceKind::Windows
            | HotplugSourceKind::Linux
            | HotplugSourceKind::PollingFallback => thread::sleep(self.poll_interval),
        }
    }
}

pub fn current_platform_hotplug_source_kind() -> HotplugSourceKind {
    if cfg!(target_os = "macos") {
        HotplugSourceKind::Macos
    } else if cfg!(target_os = "windows") {
        HotplugSourceKind::Windows
    } else if cfg!(target_os = "linux") {
        HotplugSourceKind::Linux
    } else {
        HotplugSourceKind::PollingFallback
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_current_platform_source() {
        let source = PlatformHotplugSource::current();

        if cfg!(target_os = "macos") {
            assert_eq!(source.kind, HotplugSourceKind::Macos);
        } else if cfg!(target_os = "windows") {
            assert_eq!(source.kind, HotplugSourceKind::Windows);
        } else if cfg!(target_os = "linux") {
            assert_eq!(source.kind, HotplugSourceKind::Linux);
        } else {
            assert_eq!(source.kind, HotplugSourceKind::PollingFallback);
        }
    }
}
