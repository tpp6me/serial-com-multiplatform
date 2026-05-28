mod config;
mod logging;
mod serial;

use config::{load_or_create_config, AppConfig, ConfigLoadResult};
use logging::{
    AutoLogRequest, LogFormat, LogRotationConfig, LogStatus, LogWriter, LogWriterOptions,
    StartLogRequest, StopLogRequest, StopLogResult,
};
use serde::Serialize;
use serial::{
    apply_config_to_builder, list_ports_with, transition, validate_serial_config,
    CloseSessionResult, HotplugPollResult, OpenSessionRequest, OpenSessionResult,
    RealSerialBackend, RxBatch, SerialConfig, SerialConfigInput, SerialPortSummary, SessionEvent,
    SessionManager, SessionState, SetLineSignalRequest, SetLineSignalResult, WriteRequest,
    WriteResult, HOTPLUG_POLL_INTERVAL_MS, RX_BATCH_INTERVAL_MS,
};
use std::env;
use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Emitter;

type AppSessionManager = Arc<Mutex<SessionManager<RealSerialBackend>>>;

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

#[tauri::command]
fn open_serial_session(
    app: tauri::AppHandle,
    manager: tauri::State<'_, AppSessionManager>,
    request: OpenSessionRequest,
) -> Result<OpenSessionResult, String> {
    let auto_log = request.auto_log.clone();
    let result = manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .open_session(request)
        .map_err(|error| error.to_string())?;

    if let Some(auto_log) = auto_log {
        if let Err(error) =
            start_log_for_session(manager.inner().clone(), result.session_id.clone(), auto_log)
        {
            let _ = manager
                .lock()
                .map_err(|_| "serial session manager lock poisoned".to_string())?
                .close_session(&result.session_id);
            return Err(error);
        }
    }

    start_serial_rx_worker(manager.inner().clone(), app, result.session_id.clone())?;

    Ok(result)
}

#[tauri::command]
fn close_serial_session(
    manager: tauri::State<'_, AppSessionManager>,
    session_id: String,
) -> Result<CloseSessionResult, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .close_session(&session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn reconnect_serial_session(
    app: tauri::AppHandle,
    manager: tauri::State<'_, AppSessionManager>,
    session_id: String,
) -> Result<OpenSessionResult, String> {
    let result = manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .reconnect_session(&session_id)
        .map_err(|error| error.to_string())?;

    start_serial_rx_worker(manager.inner().clone(), app, result.session_id.clone())?;

    Ok(result)
}

#[tauri::command]
fn serial_write(
    manager: tauri::State<'_, AppSessionManager>,
    request: WriteRequest,
) -> Result<WriteResult, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .write(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_set_dtr(
    manager: tauri::State<'_, AppSessionManager>,
    request: SetLineSignalRequest,
) -> Result<SetLineSignalResult, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .set_dtr(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_set_rts(
    manager: tauri::State<'_, AppSessionManager>,
    request: SetLineSignalRequest,
) -> Result<SetLineSignalResult, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .set_rts(request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_drain_rx(
    app: tauri::AppHandle,
    manager: tauri::State<'_, AppSessionManager>,
    session_id: String,
) -> Result<RxBatch, String> {
    let batch = manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .drain_rx(&session_id)
        .map_err(|error| error.to_string())?;

    emit_rx_batch(&app, &batch)?;
    Ok(batch)
}

#[tauri::command]
fn serial_session_state(
    manager: tauri::State<'_, AppSessionManager>,
    session_id: String,
) -> Result<SessionState, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .state(&session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_session_config(
    manager: tauri::State<'_, AppSessionManager>,
    session_id: String,
) -> Result<SerialConfig, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .config(&session_id)
        .cloned()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_start_log(
    manager: tauri::State<'_, AppSessionManager>,
    request: StartLogRequest,
) -> Result<LogStatus, String> {
    start_log_for_session(
        manager.inner().clone(),
        request.session_id,
        AutoLogRequest {
            path: request.path,
            format: request.format,
            append: request.append,
            rotation_size_bytes: request.rotation_size_bytes,
            rotation_period: request.rotation_period,
            max_files_to_keep: request.max_files_to_keep,
        },
    )
}

fn start_log_for_session(
    manager: AppSessionManager,
    session_id: String,
    request: AutoLogRequest,
) -> Result<LogStatus, String> {
    let format = LogFormat::try_from(request.format.as_str()).map_err(|error| error.to_string())?;
    let path = PathBuf::from(&request.path);
    let metadata = {
        let manager = manager
            .lock()
            .map_err(|_| "serial session manager lock poisoned".to_string())?;
        let status = manager
            .log_status(&session_id)
            .map_err(|error| error.to_string())?;

        if status.active {
            return Err("a log is already active for this session".to_string());
        }

        manager
            .log_metadata(&session_id)
            .map_err(|error| error.to_string())?
    };
    let rotation = LogRotationConfig::from_request(
        request.rotation_size_bytes,
        request.rotation_period.as_deref(),
        request.max_files_to_keep,
    )
    .map_err(|error| error.to_string())?;
    let writer = LogWriter::open_with_options(
        &path,
        format,
        &metadata,
        LogWriterOptions {
            append: request.append,
            rotation,
            started_at_wall_ms: metadata.started_at_wall_ms,
        },
    )
    .map_err(|error| error.to_string())?;
    let current_size = writer.current_size();
    let current_path = writer.current_path().display().to_string();
    let status = manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .start_log(&session_id, current_path, format, current_size)
        .map_err(|error| error.to_string())?;

    start_serial_log_worker(manager, session_id, writer)?;

    Ok(status)
}

#[tauri::command]
fn serial_stop_log(
    manager: tauri::State<'_, AppSessionManager>,
    request: StopLogRequest,
) -> Result<StopLogResult, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .request_stop_log(&request.session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn serial_log_status(
    manager: tauri::State<'_, AppSessionManager>,
    session_id: String,
) -> Result<LogStatus, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .log_status(&session_id)
        .map_err(|error| error.to_string())
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

fn start_serial_rx_worker(
    manager: AppSessionManager,
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    let should_start = manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .mark_rx_worker_started(&session_id)
        .map_err(|error| error.to_string())?;

    if !should_start {
        return Ok(());
    }

    thread::spawn(move || {
        let mut last_emit = Instant::now();

        loop {
            let mut read_failed = false;
            let mut batch_to_emit = None;

            {
                let Ok(mut manager) = manager.lock() else {
                    break;
                };

                match manager.state(&session_id) {
                    Ok(SessionState::Connected) => {}
                    Ok(_) | Err(_) => break,
                }

                if manager.poll_rx_once(&session_id).is_err() {
                    manager.mark_read_error(&session_id);
                    read_failed = true;
                }

                if last_emit.elapsed() >= Duration::from_millis(RX_BATCH_INTERVAL_MS) {
                    match manager.drain_rx(&session_id) {
                        Ok(batch) => batch_to_emit = Some(batch),
                        Err(_) => read_failed = true,
                    }
                    last_emit = Instant::now();
                }
            }

            if let Some(batch) = batch_to_emit {
                let _ = emit_rx_batch(&app, &batch);
            }

            if read_failed {
                break;
            }

            thread::sleep(Duration::from_millis(2));
        }

        if let Ok(mut manager) = manager.lock() {
            manager.mark_rx_worker_stopped(&session_id);
        }
    });

    Ok(())
}

fn start_serial_log_worker(
    manager: AppSessionManager,
    session_id: String,
    mut writer: LogWriter,
) -> Result<(), String> {
    let should_start = manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .mark_log_worker_started(&session_id)
        .map_err(|error| error.to_string())?;

    if !should_start {
        return Ok(());
    }

    thread::spawn(move || {
        loop {
            let records = {
                let Ok(mut manager) = manager.lock() else {
                    break;
                };

                match manager.drain_log_records(&session_id) {
                    Ok(records) => records,
                    Err(_) => break,
                }
            };

            if !records.is_empty() {
                match writer.write_records(&records) {
                    Ok(logged_bytes) => {
                        if let Ok(mut manager) = manager.lock() {
                            let _ = manager.record_logged_bytes(
                                &session_id,
                                logged_bytes,
                                writer.current_size(),
                                writer.current_path().display().to_string(),
                            );
                        }
                    }
                    Err(error) => {
                        mark_serial_log_error(&manager, &session_id, error);
                        break;
                    }
                }
            }

            let should_stop = {
                let Ok(manager) = manager.lock() else {
                    break;
                };

                match manager.log_status(&session_id) {
                    Ok(status) => !status.active && status.queued_bytes == 0,
                    Err(_) => true,
                }
            };

            if should_stop {
                break;
            }

            thread::sleep(Duration::from_millis(10));
        }

        if let Err(error) = writer.finish() {
            mark_serial_log_error(&manager, &session_id, error);
        }

        if let Ok(mut manager) = manager.lock() {
            manager.mark_log_worker_stopped(&session_id);
        }
    });

    Ok(())
}

fn mark_serial_log_error(manager: &AppSessionManager, session_id: &str, error: io::Error) {
    if let Ok(mut manager) = manager.lock() {
        let _ = manager.mark_log_error(session_id, error.to_string());
    }
}

fn start_serial_hotplug_worker(manager: AppSessionManager, app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut known_ports = manager
            .lock()
            .ok()
            .and_then(|manager| manager.current_ports().ok())
            .unwrap_or_default();

        loop {
            thread::sleep(Duration::from_millis(HOTPLUG_POLL_INTERVAL_MS));

            let poll_result = {
                let Ok(mut manager) = manager.lock() else {
                    break;
                };

                match manager.poll_hotplug(&known_ports) {
                    Ok(result) => result,
                    Err(_) => continue,
                }
            };

            known_ports = poll_result.ports.clone();

            if !poll_result.changes.is_empty() {
                let _ = emit_hotplug_poll_result(&app, &poll_result);
            }
        }
    });
}

fn emit_hotplug_poll_result(
    app: &tauri::AppHandle,
    poll_result: &HotplugPollResult,
) -> Result<(), String> {
    app.emit("serial-port-list-changed", poll_result)
        .map_err(|error| error.to_string())?;

    for session_id in &poll_result.hot_unplugged_sessions {
        app.emit("serial-session-hot-unplugged", session_id)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn emit_rx_batch(app: &tauri::AppHandle, batch: &RxBatch) -> Result<(), String> {
    if batch.chunks.is_empty() {
        return Ok(());
    }

    app.emit("serial-rx-batch", batch)
        .map_err(|error| error.to_string())
}

pub fn run() {
    let session_manager = Arc::new(Mutex::new(SessionManager::new(RealSerialBackend)));
    let hotplug_manager = session_manager.clone();

    tauri::Builder::default()
        .manage(session_manager)
        .setup(move |app| {
            start_serial_hotplug_worker(hotplug_manager.clone(), app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            environment_info,
            build_metadata,
            load_config,
            default_config,
            list_serial_ports,
            validate_serial_settings,
            validate_backend_serial_settings,
            next_session_state,
            open_serial_session,
            close_serial_session,
            reconnect_serial_session,
            serial_write,
            serial_set_dtr,
            serial_set_rts,
            serial_drain_rx,
            serial_session_state,
            serial_session_config,
            serial_start_log,
            serial_stop_log,
            serial_log_status
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
