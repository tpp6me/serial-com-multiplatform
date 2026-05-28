mod config;
mod serial;

use config::{load_or_create_config, AppConfig, ConfigLoadResult};
use serde::Serialize;
use serial::{
    apply_config_to_builder, list_ports_with, transition, validate_serial_config,
    RealSerialBackend, SerialConfig, SerialConfigInput, SerialPortSummary, SessionEvent,
    SessionState,
};
use std::env;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentInfo {
    app_name: &'static str,
    app_version: &'static str,
    environment: String,
    config_dir: String,
    log_dir: String,
    temp_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildMetadata {
    app_name: &'static str,
    app_version: &'static str,
    git_commit: &'static str,
    target: &'static str,
    profile: &'static str,
}

#[tauri::command]
fn environment_info() -> EnvironmentInfo {
    EnvironmentInfo {
        app_name: "MultiSerial",
        app_version: env!("CARGO_PKG_VERSION"),
        environment: env::var("MULTISERIAL_ENV").unwrap_or_else(|_| "production".to_string()),
        config_dir: env_path("MULTISERIAL_CONFIG_DIR", ".dev-data/config"),
        log_dir: env_path("MULTISERIAL_LOG_DIR", ".dev-data/logs"),
        temp_dir: env_path("MULTISERIAL_TEMP_DIR", ".dev-data/tmp"),
    }
}

#[tauri::command]
fn build_metadata() -> BuildMetadata {
    BuildMetadata {
        app_name: "MultiSerial",
        app_version: env!("CARGO_PKG_VERSION"),
        git_commit: option_env!("GIT_COMMIT").unwrap_or("unknown"),
        target: option_env!("BUILD_TARGET").unwrap_or("unknown"),
        profile: option_env!("BUILD_PROFILE").unwrap_or("unknown"),
    }
}

#[tauri::command]
fn load_config() -> Result<ConfigLoadResult, String> {
    load_or_create_config(config_dir()).map_err(|error| error.to_string())
}

#[tauri::command]
fn default_config() -> AppConfig {
    AppConfig::default_v1()
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<SerialPortSummary>, String> {
    list_ports_with(&RealSerialBackend).map_err(|error| error.to_string())
}

#[tauri::command]
fn validate_serial_settings(input: SerialConfigInput) -> Result<SerialConfig, String> {
    validate_serial_config(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn validate_backend_serial_settings(input: SerialConfigInput) -> Result<SerialConfig, String> {
    let config = validate_serial_config(input).map_err(|error| error.to_string())?;
    apply_config_to_builder(&config).map_err(|error| error.to_string())?;
    Ok(config)
}

#[tauri::command]
fn next_session_state(state: SessionState, event: SessionEvent) -> Result<SessionState, String> {
    transition(state, event).map_err(|error| error.to_string())
}

fn env_path(key: &str, fallback: &str) -> String {
    env::var(key)
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(fallback))
        .display()
        .to_string()
}

fn config_dir() -> PathBuf {
    env::var("MULTISERIAL_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".dev-data/config"))
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            environment_info,
            build_metadata,
            load_config,
            default_config,
            list_serial_ports,
            validate_serial_settings,
            validate_backend_serial_settings,
            next_session_state
        ])
        .run(tauri::generate_context!())
        .expect("failed to run MultiSerial");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn environment_info_uses_dev_data_fallbacks() {
        let info = environment_info();

        assert_eq!(info.app_name, "MultiSerial");
        assert_eq!(info.config_dir, ".dev-data/config");
        assert_eq!(info.log_dir, ".dev-data/logs");
        assert_eq!(info.temp_dir, ".dev-data/tmp");
    }

    #[test]
    fn build_metadata_omits_payload_data() {
        let metadata = build_metadata();

        assert_eq!(metadata.app_name, "MultiSerial");
        assert!(!metadata.app_version.is_empty());
        assert!(!metadata.git_commit.contains("tty"));
    }
}
