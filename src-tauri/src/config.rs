use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub schema_version: u32,
    pub connection: ConnectionConfig,
    pub display: DisplayConfig,
    pub logging: LoggingConfig,
    pub send: SendConfig,
    pub filters: FiltersConfig,
    pub updates: UpdatesConfig,
    pub telemetry: TelemetryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub default_baud_rate: u32,
    pub default_data_bits: u8,
    pub default_parity: String,
    pub default_stop_bits: f32,
    pub default_flow_control: String,
    pub auto_connect_on_launch: bool,
    pub remember_per_device: bool,
    pub reconnect_on_hotplug: bool,
    pub reconnect_max_retries: u32,
    pub reconnect_backoff_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayConfig {
    pub view_mode: String,
    pub font_family: String,
    pub font_size: u8,
    pub theme: String,
    pub timestamp_enabled: bool,
    pub timestamp_format: String,
    pub scrollback_lines: u32,
    pub line_wrap: bool,
    pub newline_mode: String,
    pub partial_line_timeout_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoggingConfig {
    pub auto_log_on_connect: bool,
    pub log_directory: String,
    pub filename_template: String,
    pub log_format: String,
    pub append_mode: bool,
    pub rotation_size_mb: u32,
    pub rotation_period: String,
    pub max_files_to_keep: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SendConfig {
    pub default_line_ending: String,
    pub echo_tx: bool,
    pub history_size: u32,
    pub file_send_chunk_bytes: u32,
    pub file_send_pacing_ms: u32,
    pub automation_max_sends_per_minute: u32,
    pub automation_min_interval_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FiltersConfig {
    pub regex_max_length_chars: u32,
    pub regex_timeout_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdatesConfig {
    pub auto_check: bool,
    pub auto_download: bool,
    pub release_channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryConfig {
    pub crash_reporting_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigLoadResult {
    pub config: AppConfig,
    pub path: String,
    pub created: bool,
    pub migrated: bool,
    pub backed_up_invalid: bool,
    pub stripped_unknown_keys: bool,
}

#[derive(Debug)]
pub enum ConfigError {
    Io { path: PathBuf, source: io::Error },
    Serialize(serde_json::Error),
    Validation(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::Io { path, source } => {
                write!(
                    formatter,
                    "config file error at {}: {source}",
                    path.display()
                )
            }
            ConfigError::Serialize(source) => {
                write!(formatter, "config serialization error: {source}")
            }
            ConfigError::Validation(message) => {
                write!(formatter, "config validation error: {message}")
            }
        }
    }
}

impl std::error::Error for ConfigError {}

impl AppConfig {
    pub fn default_v1() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            connection: ConnectionConfig {
                default_baud_rate: 115200,
                default_data_bits: 8,
                default_parity: "none".to_string(),
                default_stop_bits: 1.0,
                default_flow_control: "none".to_string(),
                auto_connect_on_launch: false,
                remember_per_device: true,
                reconnect_on_hotplug: true,
                reconnect_max_retries: 5,
                reconnect_backoff_ms: 1000,
            },
            display: DisplayConfig {
                view_mode: "ascii".to_string(),
                font_family: "JetBrains Mono".to_string(),
                font_size: 13,
                theme: "system".to_string(),
                timestamp_enabled: true,
                timestamp_format: "HH:mm:ss.SSS".to_string(),
                scrollback_lines: 100000,
                line_wrap: true,
                newline_mode: "crlf".to_string(),
                partial_line_timeout_ms: 500,
            },
            logging: LoggingConfig {
                auto_log_on_connect: false,
                log_directory: "~/MultiSerial/logs".to_string(),
                filename_template: "{port}_{YYYY-MM-DD_HH-mm-ss}.log".to_string(),
                log_format: "timestamped-text".to_string(),
                append_mode: true,
                rotation_size_mb: 10,
                rotation_period: "daily".to_string(),
                max_files_to_keep: 30,
            },
            send: SendConfig {
                default_line_ending: "crlf".to_string(),
                echo_tx: true,
                history_size: 500,
                file_send_chunk_bytes: 512,
                file_send_pacing_ms: 10,
                automation_max_sends_per_minute: 1000,
                automation_min_interval_ms: 50,
            },
            filters: FiltersConfig {
                regex_max_length_chars: 512,
                regex_timeout_ms: 50,
            },
            updates: UpdatesConfig {
                auto_check: true,
                auto_download: false,
                release_channel: "stable".to_string(),
            },
            telemetry: TelemetryConfig {
                crash_reporting_enabled: false,
            },
        }
    }
}

pub fn load_or_create_config(
    config_dir: impl AsRef<Path>,
) -> Result<ConfigLoadResult, ConfigError> {
    let config_dir = config_dir.as_ref();
    fs::create_dir_all(config_dir).map_err(|source| ConfigError::Io {
        path: config_dir.to_path_buf(),
        source,
    })?;

    let path = config_dir.join("config.json");

    if !path.exists() {
        let config = AppConfig::default_v1();
        write_config_atomically(&path, &config)?;
        return Ok(ConfigLoadResult {
            config,
            path: path.display().to_string(),
            created: true,
            migrated: false,
            backed_up_invalid: false,
            stripped_unknown_keys: false,
        });
    }

    let raw = fs::read_to_string(&path).map_err(|source| ConfigError::Io {
        path: path.clone(),
        source,
    })?;

    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => {
            backup_invalid_config(&path)?;
            let config = AppConfig::default_v1();
            write_config_atomically(&path, &config)?;
            return Ok(ConfigLoadResult {
                config,
                path: path.display().to_string(),
                created: false,
                migrated: false,
                backed_up_invalid: true,
                stripped_unknown_keys: false,
            });
        }
    };

    let migrated = migrate_config_value(parsed);
    let config = match serde_json::from_value::<AppConfig>(migrated.value.clone()) {
        Ok(config) => config,
        Err(_) => {
            backup_invalid_config(&path)?;
            let config = AppConfig::default_v1();
            write_config_atomically(&path, &config)?;
            return Ok(ConfigLoadResult {
                config,
                path: path.display().to_string(),
                created: false,
                migrated: false,
                backed_up_invalid: true,
                stripped_unknown_keys: false,
            });
        }
    };

    let normalized = serde_json::to_value(&config).map_err(ConfigError::Serialize)?;
    let stripped_unknown_keys = normalized != migrated.value;

    if migrated.migrated || stripped_unknown_keys {
        write_config_atomically(&path, &config)?;
    }

    Ok(ConfigLoadResult {
        config,
        path: path.display().to_string(),
        created: false,
        migrated: migrated.migrated,
        backed_up_invalid: false,
        stripped_unknown_keys,
    })
}

pub fn save_config(
    config_dir: impl AsRef<Path>,
    config: AppConfig,
) -> Result<ConfigLoadResult, ConfigError> {
    validate_app_config(&config).map_err(ConfigError::Validation)?;

    let config_dir = config_dir.as_ref();
    fs::create_dir_all(config_dir).map_err(|source| ConfigError::Io {
        path: config_dir.to_path_buf(),
        source,
    })?;

    let path = config_dir.join("config.json");
    write_config_atomically(&path, &config)?;

    Ok(ConfigLoadResult {
        config,
        path: path.display().to_string(),
        created: false,
        migrated: false,
        backed_up_invalid: false,
        stripped_unknown_keys: false,
    })
}

pub fn validate_app_config(config: &AppConfig) -> Result<(), String> {
    require(
        config.schema_version == CURRENT_SCHEMA_VERSION,
        "unsupported schema version",
    )?;
    require(
        (300..=4_000_000).contains(&config.connection.default_baud_rate),
        "default baud rate must be between 300 and 4000000",
    )?;
    require(
        matches!(config.connection.default_data_bits, 5..=8),
        "default data bits must be 5, 6, 7, or 8",
    )?;
    require_enum(
        "default parity",
        &config.connection.default_parity,
        &["none", "even", "odd"],
    )?;
    require(
        matches!(config.connection.default_stop_bits, value if value == 1.0 || value == 1.5 || value == 2.0),
        "default stop bits must be 1, 1.5, or 2",
    )?;
    require_enum(
        "default flow control",
        &config.connection.default_flow_control,
        &["none", "software", "hardware"],
    )?;
    require(
        config.connection.reconnect_max_retries <= 100,
        "reconnect retries must be 100 or lower",
    )?;
    require(
        config.connection.reconnect_backoff_ms <= 60_000,
        "reconnect backoff must be 60000 ms or lower",
    )?;

    require_enum(
        "view mode",
        &config.display.view_mode,
        &["ascii", "utf8", "hex"],
    )?;
    require(
        !config.display.font_family.trim().is_empty(),
        "font family is required",
    )?;
    require(
        (8..=32).contains(&config.display.font_size),
        "font size must be between 8 and 32",
    )?;
    require_enum("theme", &config.display.theme, &["system", "light", "dark"])?;
    require_enum(
        "timestamp format",
        &config.display.timestamp_format,
        &["time", "iso", "epochMs", "HH:mm:ss.SSS"],
    )?;
    require(
        (100..=1_000_000).contains(&config.display.scrollback_lines),
        "scrollback lines must be between 100 and 1000000",
    )?;
    require_enum(
        "newline mode",
        &config.display.newline_mode,
        &["lf", "crlf", "cr"],
    )?;
    require(
        (10..=60_000).contains(&config.display.partial_line_timeout_ms),
        "partial line timeout must be between 10 and 60000 ms",
    )?;

    require(
        !config.logging.log_directory.trim().is_empty(),
        "log directory is required",
    )?;
    require(
        !config.logging.filename_template.trim().is_empty(),
        "log filename template is required",
    )?;
    require_enum(
        "log format",
        &config.logging.log_format,
        &["plaintext", "timestamped-text", "binary"],
    )?;
    require(
        (1..=1024).contains(&config.logging.rotation_size_mb),
        "log rotation size must be between 1 and 1024 MB",
    )?;
    require_enum(
        "rotation period",
        &config.logging.rotation_period,
        &["none", "hourly", "daily"],
    )?;
    require(
        config.logging.max_files_to_keep <= 10_000,
        "max files to keep must be 10000 or lower",
    )?;

    require_enum(
        "default line ending",
        &config.send.default_line_ending,
        &["none", "lf", "crlf", "cr"],
    )?;
    require(
        config.send.history_size <= 10_000,
        "send history size must be 10000 or lower",
    )?;
    require(
        (1..=65_536).contains(&config.send.file_send_chunk_bytes),
        "file send chunk size must be between 1 and 65536 bytes",
    )?;
    require(
        config.send.file_send_pacing_ms <= 60_000,
        "file send pacing must be 60000 ms or lower",
    )?;
    require(
        (1..=60_000).contains(&config.send.automation_max_sends_per_minute),
        "automation sends per minute must be between 1 and 60000",
    )?;
    require(
        (50..=60_000).contains(&config.send.automation_min_interval_ms),
        "automation minimum interval must be between 50 and 60000 ms",
    )?;

    require(
        (1..=4096).contains(&config.filters.regex_max_length_chars),
        "regex max length must be between 1 and 4096 characters",
    )?;
    require(
        (1..=1000).contains(&config.filters.regex_timeout_ms),
        "regex timeout must be between 1 and 1000 ms",
    )?;
    require_enum(
        "release channel",
        &config.updates.release_channel,
        &["stable", "beta", "nightly"],
    )?;

    Ok(())
}

fn migrate_config_value(mut value: Value) -> MigrationResult {
    let schema_version = value
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .unwrap_or_default();

    let migrated = schema_version < CURRENT_SCHEMA_VERSION as u64;

    if let Some(object) = value.as_object_mut() {
        object.insert(
            "schemaVersion".to_string(),
            Value::Number(CURRENT_SCHEMA_VERSION.into()),
        );
    }

    MigrationResult { value, migrated }
}

fn require(condition: bool, message: &str) -> Result<(), String> {
    if condition {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

fn require_enum(field: &str, value: &str, allowed: &[&str]) -> Result<(), String> {
    require(
        allowed.contains(&value),
        &format!("{field} must be one of {}", allowed.join(", ")),
    )
}

fn write_config_atomically(path: &Path, config: &AppConfig) -> Result<(), ConfigError> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|source| ConfigError::Io {
        path: parent.to_path_buf(),
        source,
    })?;

    let temp_path = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(config).map_err(ConfigError::Serialize)?;

    fs::write(&temp_path, bytes).map_err(|source| ConfigError::Io {
        path: temp_path.clone(),
        source,
    })?;

    fs::rename(&temp_path, path).map_err(|source| ConfigError::Io {
        path: path.to_path_buf(),
        source,
    })?;

    Ok(())
}

fn backup_invalid_config(path: &Path) -> Result<(), ConfigError> {
    let backup_path = path.with_file_name("config.json.bak");
    fs::copy(path, &backup_path).map_err(|source| ConfigError::Io {
        path: backup_path,
        source,
    })?;
    Ok(())
}

struct MigrationResult {
    value: Value,
    migrated: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn creates_default_config_when_missing() {
        let dir = test_dir("missing");

        let result = load_or_create_config(&dir).expect("config should be created");

        assert!(result.created);
        assert_eq!(result.config, AppConfig::default_v1());
        assert!(dir.join("config.json").exists());
    }

    #[test]
    fn backs_up_invalid_config_and_replaces_with_default() {
        let dir = test_dir("invalid");
        fs::create_dir_all(&dir).expect("test dir should exist");
        fs::write(dir.join("config.json"), "{ invalid json").expect("invalid config should write");

        let result = load_or_create_config(&dir).expect("invalid config should recover");

        assert!(result.backed_up_invalid);
        assert!(dir.join("config.json.bak").exists());
        assert_eq!(result.config, AppConfig::default_v1());
    }

    #[test]
    fn strips_unknown_keys_by_rewriting_normalized_config() {
        let dir = test_dir("unknown");
        fs::create_dir_all(&dir).expect("test dir should exist");
        let mut value = serde_json::to_value(AppConfig::default_v1()).expect("default serializes");
        value["unknown"] = Value::String("remove me".to_string());
        fs::write(
            dir.join("config.json"),
            serde_json::to_vec_pretty(&value).expect("value serializes"),
        )
        .expect("config should write");

        let result = load_or_create_config(&dir).expect("config should normalize");
        let normalized: Value =
            serde_json::from_str(&fs::read_to_string(dir.join("config.json")).unwrap()).unwrap();

        assert!(result.stripped_unknown_keys);
        assert!(normalized.get("unknown").is_none());
    }

    #[test]
    fn migrates_missing_schema_version_to_current_version() {
        let dir = test_dir("migration");
        fs::create_dir_all(&dir).expect("test dir should exist");
        let mut value = serde_json::to_value(AppConfig::default_v1()).expect("default serializes");
        value.as_object_mut().unwrap().remove("schemaVersion");
        fs::write(
            dir.join("config.json"),
            serde_json::to_vec_pretty(&value).expect("value serializes"),
        )
        .expect("config should write");

        let result = load_or_create_config(&dir).expect("config should migrate");

        assert!(result.migrated);
        assert_eq!(result.config.schema_version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn saves_valid_config_atomically() {
        let dir = test_dir("save");
        let mut config = AppConfig::default_v1();
        config.connection.default_baud_rate = 9600;

        let result = save_config(&dir, config.clone()).expect("config should save");

        assert_eq!(result.config, config);
        assert!(dir.join("config.json").exists());
        assert!(!dir.join("config.json.tmp").exists());
    }

    #[test]
    fn rejects_invalid_config_before_save() {
        let dir = test_dir("reject");
        let mut config = AppConfig::default_v1();
        config.display.font_size = 2;

        let error = save_config(&dir, config).expect_err("invalid config should fail");

        assert!(error.to_string().contains("font size"));
        assert!(!dir.join("config.json").exists());
    }

    fn test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("multiserial-config-{name}-{nanos}"))
    }
}
