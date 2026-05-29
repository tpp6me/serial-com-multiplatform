use std::process::Command;

const APP_COMMANDS: &[&str] = &[
    "environment_info",
    "build_metadata",
    "load_config",
    "save_config",
    "default_config",
    "open_path",
    "write_text_file",
    "list_serial_ports",
    "validate_serial_settings",
    "validate_backend_serial_settings",
    "next_session_state",
    "open_serial_session",
    "close_serial_session",
    "reconnect_serial_session",
    "serial_write",
    "serial_automated_write",
    "serial_set_dtr",
    "serial_set_rts",
    "serial_drain_rx",
    "serial_session_state",
    "serial_session_config",
    "serial_start_log",
    "serial_stop_log",
    "serial_log_status",
];

fn main() {
    if let Ok(target) = std::env::var("TARGET") {
        println!("cargo:rustc-env=BUILD_TARGET={target}");
    }

    if let Ok(profile) = std::env::var("PROFILE") {
        println!("cargo:rustc-env=BUILD_PROFILE={profile}");
    }

    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
    {
        if output.status.success() {
            let hash = String::from_utf8_lossy(&output.stdout);
            println!("cargo:rustc-env=GIT_COMMIT={}", hash.trim());
        }
    }

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to build Tauri app metadata");
}
