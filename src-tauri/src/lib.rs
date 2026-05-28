mod config;
mod logging;
mod serial;

use config::{load_or_create_config, save_config as save_app_config, AppConfig, ConfigLoadResult};
use logging::{
    AutoLogRequest, LogFormat, LogRotationConfig, LogStatus, LogWriter, LogWriterOptions,
    StartLogRequest, StopLogRequest, StopLogResult,
};
use serde::Serialize;
use serial::{
    apply_config_to_builder, list_ports_with, transition, validate_serial_config,
    CloseSessionResult, HotplugPollResult, OpenSessionRequest, OpenSessionResult,
    PlatformHotplugSource, RealSerialBackend, RxBatch, SerialConfig, SerialConfigInput,
    SerialPortSummary, SessionEvent, SessionManager, SessionState, SetLineSignalRequest,
    SetLineSignalResult, WriteRequest, WriteResult, RX_BATCH_INTERVAL_MS,
};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenPathRequest {
    path: String,
    kind: OpenPathKind,
}

#[derive(Debug, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum OpenPathKind {
    File,
    Directory,
}

#[tauri::command]
fn environment_info() -> EnvironmentInfo {
    EnvironmentInfo {
        app_name: "MultiSerial",
        app_version: env!("CARGO_PKG_VERSION"),
        environment: env::var("MULTISERIAL_ENV").unwrap_or_else(|_| "production".to_string()),
        config_dir: env_path("MULTISERIAL_CONFIG_DIR", default_config_dir),
        log_dir: env_path("MULTISERIAL_LOG_DIR", default_log_dir),
        temp_dir: env_path("MULTISERIAL_TEMP_DIR", default_temp_dir),
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
fn save_config(config: AppConfig) -> Result<ConfigLoadResult, String> {
    save_app_config(config_dir(), config).map_err(|error| error.to_string())
}

#[tauri::command]
fn default_config() -> AppConfig {
    AppConfig::default_v1()
}

#[tauri::command]
fn open_path(request: OpenPathRequest) -> Result<(), String> {
    let target = resolve_open_target(&request).map_err(|error| error.to_string())?;
    open_platform_path(&target).map_err(|error| error.to_string())
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
fn serial_automated_write(
    manager: tauri::State<'_, AppSessionManager>,
    request: WriteRequest,
) -> Result<WriteResult, String> {
    manager
        .lock()
        .map_err(|_| "serial session manager lock poisoned".to_string())?
        .write_automated(request)
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
    let path = expand_tilde_path(&request.path);
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

fn env_path(key: &str, fallback: fn() -> PathBuf) -> String {
    env::var(key)
        .map(PathBuf::from)
        .unwrap_or_else(|_| fallback())
        .display()
        .to_string()
}

fn resolve_open_target(request: &OpenPathRequest) -> io::Result<PathBuf> {
    let path = expand_tilde_path(&request.path);

    match request.kind {
        OpenPathKind::File => {
            if !path.is_file() {
                return Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("log file does not exist: {}", path.display()),
                ));
            }
        }
        OpenPathKind::Directory => {
            fs::create_dir_all(&path)?;
            if !path.is_dir() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("log directory is not a directory: {}", path.display()),
                ));
            }
        }
    }

    Ok(path)
}

fn expand_tilde_path(path: &str) -> PathBuf {
    if path == "~" {
        return env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(path));
    }

    if let Some(remainder) = path.strip_prefix("~/") {
        if let Ok(home) = env::var("HOME") {
            return Path::new(&home).join(remainder);
        }
    }

    PathBuf::from(path)
}

fn open_platform_path(path: &Path) -> io::Result<()> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(path).status()?
    } else if cfg!(target_os = "windows") {
        Command::new("explorer").arg(path).status()?
    } else {
        Command::new("xdg-open").arg(path).status()?
    };

    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "open command failed with status {status}"
        )))
    }
}

fn config_dir() -> PathBuf {
    env::var("MULTISERIAL_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_config_dir())
}

fn default_config_dir() -> PathBuf {
    if cfg!(target_os = "macos") {
        home_dir()
            .map(|home| home.join("Library/Application Support/MultiSerial"))
            .unwrap_or_else(|| PathBuf::from("MultiSerial/config"))
    } else if cfg!(target_os = "windows") {
        env::var("APPDATA")
            .map(|app_data| PathBuf::from(app_data).join("MultiSerial"))
            .or_else(|_| {
                home_dir()
                    .map(|home| home.join("AppData/Roaming/MultiSerial"))
                    .ok_or(env::VarError::NotPresent)
            })
            .unwrap_or_else(|_| PathBuf::from("MultiSerial/config"))
    } else {
        env::var("XDG_CONFIG_HOME")
            .map(|config_home| PathBuf::from(config_home).join("MultiSerial"))
            .or_else(|_| {
                home_dir()
                    .map(|home| home.join(".config/MultiSerial"))
                    .ok_or(env::VarError::NotPresent)
            })
            .unwrap_or_else(|_| PathBuf::from("MultiSerial/config"))
    }
}

fn default_log_dir() -> PathBuf {
    home_dir()
        .map(|home| home.join("MultiSerial/logs"))
        .unwrap_or_else(|| PathBuf::from("MultiSerial/logs"))
}

fn default_temp_dir() -> PathBuf {
    env::temp_dir().join("MultiSerial")
}

fn home_dir() -> Option<PathBuf> {
    env::var("HOME").map(PathBuf::from).ok().or_else(|| {
        if cfg!(target_os = "windows") {
            env::var("USERPROFILE").map(PathBuf::from).ok()
        } else {
            None
        }
    })
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
        let hotplug_source = PlatformHotplugSource::current();
        let mut known_ports = manager
            .lock()
            .ok()
            .and_then(|manager| manager.current_ports().ok())
            .unwrap_or_default();

        loop {
            hotplug_source.wait_for_change_hint();

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
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            start_serial_hotplug_worker(hotplug_manager.clone(), app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            environment_info,
            build_metadata,
            load_config,
            save_config,
            default_config,
            open_path,
            list_serial_ports,
            validate_serial_settings,
            validate_backend_serial_settings,
            next_session_state,
            open_serial_session,
            close_serial_session,
            reconnect_serial_session,
            serial_write,
            serial_automated_write,
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
    fn environment_info_reports_active_data_paths() {
        let info = environment_info();

        assert_eq!(info.app_name, "MultiSerial");
        assert_eq!(
            info.config_dir,
            env::var("MULTISERIAL_CONFIG_DIR")
                .map(|path| PathBuf::from(path).display().to_string())
                .unwrap_or_else(|_| default_config_dir().display().to_string())
        );
        assert_eq!(
            info.log_dir,
            env::var("MULTISERIAL_LOG_DIR")
                .map(|path| PathBuf::from(path).display().to_string())
                .unwrap_or_else(|_| default_log_dir().display().to_string())
        );
        assert_eq!(
            info.temp_dir,
            env::var("MULTISERIAL_TEMP_DIR")
                .map(|path| PathBuf::from(path).display().to_string())
                .unwrap_or_else(|_| default_temp_dir().display().to_string())
        );
    }

    #[test]
    fn production_default_paths_do_not_use_dev_data() {
        assert!(!default_config_dir()
            .display()
            .to_string()
            .contains(".dev-data"));
        assert!(!default_log_dir()
            .display()
            .to_string()
            .contains(".dev-data"));
        assert!(!default_temp_dir()
            .display()
            .to_string()
            .contains(".dev-data"));
    }

    #[test]
    fn build_metadata_omits_payload_data() {
        let metadata = build_metadata();

        assert_eq!(metadata.app_name, "MultiSerial");
        assert!(!metadata.app_version.is_empty());
        assert!(!metadata.git_commit.contains("tty"));
    }

    #[test]
    fn open_path_resolution_expands_home_directory() {
        let home = env::var("HOME").expect("HOME should exist in test environment");

        let target = expand_tilde_path("~/MultiSerial");

        assert!(target.starts_with(home));
    }

    #[test]
    fn open_path_resolution_rejects_missing_file() {
        let request = OpenPathRequest {
            path: ".dev-data/does-not-exist/missing.log".to_string(),
            kind: OpenPathKind::File,
        };

        let error = resolve_open_target(&request).expect_err("missing file should fail");

        assert_eq!(error.kind(), io::ErrorKind::NotFound);
    }
}
