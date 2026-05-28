use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const LOG_QUEUE_CAPACITY_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LogFormat {
    PlainText,
    TimestampedText,
    Binary,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LogDirection {
    Rx,
    Tx,
    Marker,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartLogRequest {
    pub session_id: String,
    pub path: String,
    pub format: String,
    pub append: bool,
    #[serde(default)]
    pub rotation_size_bytes: Option<u64>,
    #[serde(default)]
    pub rotation_period: Option<String>,
    #[serde(default)]
    pub max_files_to_keep: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoLogRequest {
    pub path: String,
    pub format: String,
    pub append: bool,
    #[serde(default)]
    pub rotation_size_bytes: Option<u64>,
    #[serde(default)]
    pub rotation_period: Option<String>,
    #[serde(default)]
    pub max_files_to_keep: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StopLogRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogStatus {
    pub session_id: String,
    pub active: bool,
    pub path: Option<String>,
    pub format: Option<LogFormat>,
    pub rx_bytes: u64,
    pub logged_bytes: u64,
    pub log_overrun_count: u64,
    pub current_size: u64,
    pub queued_bytes: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StopLogResult {
    pub session_id: String,
    pub status: LogStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogRecord {
    pub direction: LogDirection,
    pub timestamp_wall_ms: u128,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogMetadata {
    pub session_id: String,
    pub port_path: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub parity: String,
    pub stop_bits: String,
    pub flow_control: String,
    pub started_at_wall_ms: u128,
}

pub struct LogWriter {
    file: LogFileHandle,
    path_template: PathBuf,
    current_path: PathBuf,
    format: LogFormat,
    metadata: LogMetadata,
    header_size: u64,
    current_size: u64,
    rotation: LogRotationConfig,
    segment_index: u64,
    current_period_key: Option<i64>,
    segment_paths: Vec<PathBuf>,
}

enum LogFileHandle {
    Real(File),
    #[cfg(test)]
    Failing(TestLogFile),
}

#[cfg(test)]
struct TestLogFile {
    len: u64,
    fail_write_kind: Option<io::ErrorKind>,
    fail_sync_kind: Option<io::ErrorKind>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogRotationPeriod {
    Never,
    Hourly,
    Daily,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogRotationConfig {
    pub size_bytes: Option<u64>,
    pub period: LogRotationPeriod,
    pub max_files_to_keep: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogWriterOptions {
    pub append: bool,
    pub rotation: LogRotationConfig,
    pub started_at_wall_ms: u128,
}

#[derive(Debug)]
pub enum LogError {
    InvalidFormat { value: String },
    InvalidPath { path: PathBuf, message: String },
    Io { path: PathBuf, source: io::Error },
    Serialize(serde_json::Error),
}

impl fmt::Display for LogError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogError::InvalidFormat { value } => {
                write!(formatter, "unsupported log format `{value}`")
            }
            LogError::InvalidPath { path, message } => {
                write!(
                    formatter,
                    "invalid log path `{}`: {message}",
                    path.display()
                )
            }
            LogError::Io { path, source } => {
                write!(formatter, "log file error at {}: {source}", path.display())
            }
            LogError::Serialize(source) => {
                write!(formatter, "log metadata serialization failed: {source}")
            }
        }
    }
}

impl std::error::Error for LogError {}

impl LogRecord {
    pub fn rx(timestamp_wall_ms: u128, bytes: Vec<u8>) -> Self {
        Self {
            direction: LogDirection::Rx,
            timestamp_wall_ms,
            bytes,
        }
    }

    pub fn tx(timestamp_wall_ms: u128, bytes: Vec<u8>) -> Self {
        Self {
            direction: LogDirection::Tx,
            timestamp_wall_ms,
            bytes,
        }
    }

    pub fn marker(timestamp_wall_ms: u128, message: impl Into<String>) -> Self {
        Self {
            direction: LogDirection::Marker,
            timestamp_wall_ms,
            bytes: message.into().into_bytes(),
        }
    }

    pub fn payload_len(&self) -> usize {
        self.bytes.len()
    }
}

impl TryFrom<&str> for LogFormat {
    type Error = LogError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match normalize_token(value).as_str() {
            "plaintext" | "ascii" => Ok(LogFormat::PlainText),
            "timestampedtext" | "timestamped" => Ok(LogFormat::TimestampedText),
            "binary" | "rawbinary" => Ok(LogFormat::Binary),
            _ => Err(LogError::InvalidFormat {
                value: value.to_string(),
            }),
        }
    }
}

impl LogWriter {
    #[cfg(test)]
    pub fn open(
        path: impl AsRef<Path>,
        format: LogFormat,
        append: bool,
        metadata: &LogMetadata,
    ) -> Result<Self, LogError> {
        Self::open_with_options(
            path,
            format,
            metadata,
            LogWriterOptions {
                append,
                rotation: LogRotationConfig::default(),
                started_at_wall_ms: metadata.started_at_wall_ms,
            },
        )
    }

    pub fn open_with_options(
        path: impl AsRef<Path>,
        format: LogFormat,
        metadata: &LogMetadata,
        options: LogWriterOptions,
    ) -> Result<Self, LogError> {
        let path_template = path.as_ref().to_path_buf();
        let current_path =
            resolve_log_path_template(&path_template, metadata, options.started_at_wall_ms);
        validate_log_path(&current_path)?;

        let header = encode_header(format, metadata)?;
        let file = LogFileHandle::Real(open_log_segment(&current_path, options.append)?);
        let existing_size = file.len().map_err(|source| LogError::Io {
            path: current_path.clone(),
            source,
        })?;

        let mut writer = Self {
            file,
            path_template,
            current_path,
            format,
            metadata: metadata.clone(),
            header_size: header.len() as u64,
            current_size: existing_size,
            rotation: options.rotation,
            segment_index: 0,
            current_period_key: period_key(LogRotationPeriod::Never, options.started_at_wall_ms),
            segment_paths: Vec::new(),
        };

        writer
            .file
            .write_all(&header)
            .map_err(|source| LogError::Io {
                path: writer.current_path.clone(),
                source,
            })?;
        writer.current_size += header.len() as u64;
        writer.current_period_key = period_key(writer.rotation.period, options.started_at_wall_ms);
        writer.segment_paths.push(writer.current_path.clone());

        Ok(writer)
    }

    pub fn write_records(&mut self, records: &[LogRecord]) -> Result<u64, io::Error> {
        let mut logged_payload_bytes = 0;

        for record in records {
            let encoded = encode_record(self.format, record);
            self.rotate_if_needed(record.timestamp_wall_ms, encoded.len() as u64)?;
            self.file.write_all(&encoded)?;
            self.current_size += encoded.len() as u64;

            if record.direction == LogDirection::Rx {
                logged_payload_bytes += record.payload_len() as u64;
            }
        }

        self.file.flush()?;
        Ok(logged_payload_bytes)
    }

    pub fn finish(&mut self) -> Result<(), io::Error> {
        self.file.flush()?;
        self.file.sync_all()
    }

    pub fn current_path(&self) -> &Path {
        &self.current_path
    }

    pub fn current_size(&self) -> u64 {
        self.current_size
    }

    fn rotate_if_needed(
        &mut self,
        record_timestamp_wall_ms: u128,
        next_record_size: u64,
    ) -> Result<(), io::Error> {
        if self.should_rotate_for_time(record_timestamp_wall_ms)
            || self.should_rotate_for_size(next_record_size)
        {
            self.rotate(record_timestamp_wall_ms)?;
        }

        Ok(())
    }

    fn should_rotate_for_time(&self, record_timestamp_wall_ms: u128) -> bool {
        if self.rotation.period == LogRotationPeriod::Never {
            return false;
        }

        let Some(current_period_key) = self.current_period_key else {
            return false;
        };

        period_key(self.rotation.period, record_timestamp_wall_ms)
            .is_some_and(|record_period_key| record_period_key != current_period_key)
    }

    fn should_rotate_for_size(&self, next_record_size: u64) -> bool {
        let Some(size_bytes) = self.rotation.size_bytes else {
            return false;
        };

        size_bytes > 0
            && self.current_size > self.header_size
            && self.current_size.saturating_add(next_record_size) > size_bytes
    }

    fn rotate(&mut self, record_timestamp_wall_ms: u128) -> Result<(), io::Error> {
        self.file.flush()?;
        self.file.sync_all()?;
        self.segment_index += 1;
        let next_path = rotated_segment_path(
            &self.path_template,
            &self.metadata,
            record_timestamp_wall_ms,
            self.segment_index,
        );
        let mut next_file = LogFileHandle::Real(
            open_log_segment(&next_path, false)
                .map_err(|error| io::Error::other(error.to_string()))?,
        );
        let header = encode_header(self.format, &self.metadata)
            .map_err(|error| io::Error::other(error.to_string()))?;
        next_file.write_all(&header)?;

        self.file = next_file;
        self.current_path = next_path;
        self.current_size = header.len() as u64;
        self.current_period_key = period_key(self.rotation.period, record_timestamp_wall_ms);
        self.segment_paths.push(self.current_path.clone());
        self.apply_retention()?;

        Ok(())
    }

    fn apply_retention(&mut self) -> Result<(), io::Error> {
        let Some(max_files_to_keep) = self.rotation.max_files_to_keep else {
            return Ok(());
        };

        while self.segment_paths.len() > max_files_to_keep {
            let expired_path = self.segment_paths.remove(0);
            if expired_path != self.current_path {
                match fs::remove_file(&expired_path) {
                    Ok(()) => {}
                    Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error),
                }
            }
        }

        Ok(())
    }
}

impl LogFileHandle {
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), io::Error> {
        match self {
            LogFileHandle::Real(file) => file.write_all(bytes),
            #[cfg(test)]
            LogFileHandle::Failing(file) => file.write_all(bytes),
        }
    }

    fn flush(&mut self) -> Result<(), io::Error> {
        match self {
            LogFileHandle::Real(file) => file.flush(),
            #[cfg(test)]
            LogFileHandle::Failing(file) => file.flush(),
        }
    }

    fn sync_all(&self) -> Result<(), io::Error> {
        match self {
            LogFileHandle::Real(file) => file.sync_all(),
            #[cfg(test)]
            LogFileHandle::Failing(file) => file.sync_all(),
        }
    }

    fn len(&self) -> Result<u64, io::Error> {
        match self {
            LogFileHandle::Real(file) => Ok(file.metadata()?.len()),
            #[cfg(test)]
            LogFileHandle::Failing(file) => Ok(file.len),
        }
    }
}

#[cfg(test)]
impl TestLogFile {
    fn write_all(&mut self, bytes: &[u8]) -> Result<(), io::Error> {
        if let Some(kind) = self.fail_write_kind {
            return Err(io::Error::new(kind, "simulated log write failure"));
        }

        self.len += bytes.len() as u64;
        Ok(())
    }

    fn flush(&mut self) -> Result<(), io::Error> {
        Ok(())
    }

    fn sync_all(&self) -> Result<(), io::Error> {
        if let Some(kind) = self.fail_sync_kind {
            return Err(io::Error::new(kind, "simulated log sync failure"));
        }

        Ok(())
    }
}

impl LogRotationConfig {
    pub fn from_request(
        size_bytes: Option<u64>,
        period: Option<&str>,
        max_files_to_keep: Option<u32>,
    ) -> Result<Self, LogError> {
        Ok(Self {
            size_bytes: size_bytes.filter(|value| *value > 0),
            period: LogRotationPeriod::try_from(period.unwrap_or("never"))?,
            max_files_to_keep: max_files_to_keep
                .filter(|value| *value > 0)
                .map(|value| value as usize),
        })
    }
}

impl Default for LogRotationConfig {
    fn default() -> Self {
        Self {
            size_bytes: None,
            period: LogRotationPeriod::Never,
            max_files_to_keep: None,
        }
    }
}

impl TryFrom<&str> for LogRotationPeriod {
    type Error = LogError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match normalize_token(value).as_str() {
            "" | "never" | "none" | "off" => Ok(Self::Never),
            "hourly" | "hour" => Ok(Self::Hourly),
            "daily" | "day" => Ok(Self::Daily),
            _ => Err(LogError::InvalidFormat {
                value: value.to_string(),
            }),
        }
    }
}

fn open_log_segment(path: &Path, append: bool) -> Result<File, LogError> {
    validate_log_path(path)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| LogError::Io {
            path: parent.to_path_buf(),
            source,
        })?;
    }

    OpenOptions::new()
        .create(true)
        .write(true)
        .append(append)
        .truncate(!append)
        .open(path)
        .map_err(|source| LogError::Io {
            path: path.to_path_buf(),
            source,
        })
}

fn validate_log_path(path: &Path) -> Result<(), LogError> {
    if path.as_os_str().is_empty() {
        return Err(LogError::InvalidPath {
            path: path.to_path_buf(),
            message: "path is required".to_string(),
        });
    }

    if path.file_name().is_none() {
        return Err(LogError::InvalidPath {
            path: path.to_path_buf(),
            message: "path must include a file name".to_string(),
        });
    }

    if path.is_dir() {
        return Err(LogError::InvalidPath {
            path: path.to_path_buf(),
            message: "path points to a directory".to_string(),
        });
    }

    Ok(())
}

pub fn resolve_log_path_template(
    path_template: impl AsRef<Path>,
    metadata: &LogMetadata,
    timestamp_wall_ms: u128,
) -> PathBuf {
    let date_time = utc_date_time_parts(timestamp_wall_ms);
    let rendered = path_template.as_ref().to_string_lossy().to_string();
    let rendered = rendered
        .replace("{port}", &sanitize_filename_token(&metadata.port_path))
        .replace(
            "{sessionId}",
            &sanitize_filename_token(&metadata.session_id),
        )
        .replace("{baudRate}", &metadata.baud_rate.to_string())
        .replace("{timestampWallMs}", &timestamp_wall_ms.to_string())
        .replace("{timestamp}", &timestamp_wall_ms.to_string())
        .replace(
            "{YYYY-MM-DD_HH-mm-ss}",
            &format!(
                "{:04}-{:02}-{:02}_{:02}-{:02}-{:02}",
                date_time.year,
                date_time.month,
                date_time.day,
                date_time.hour,
                date_time.minute,
                date_time.second
            ),
        )
        .replace(
            "{YYYYMMDD_HHmmss}",
            &format!(
                "{:04}{:02}{:02}_{:02}{:02}{:02}",
                date_time.year,
                date_time.month,
                date_time.day,
                date_time.hour,
                date_time.minute,
                date_time.second
            ),
        )
        .replace(
            "{date}",
            &format!(
                "{:04}-{:02}-{:02}",
                date_time.year, date_time.month, date_time.day
            ),
        )
        .replace(
            "{time}",
            &format!(
                "{:02}-{:02}-{:02}",
                date_time.hour, date_time.minute, date_time.second
            ),
        );

    PathBuf::from(rendered)
}

pub fn sanitize_filename_token(value: &str) -> String {
    let mut sanitized = String::new();
    let mut last_was_separator = false;

    for character in value.chars() {
        let next = if character.is_ascii_alphanumeric() || matches!(character, '-' | '.' | '_') {
            character
        } else {
            '_'
        };

        if next == '_' {
            if !last_was_separator {
                sanitized.push(next);
            }
            last_was_separator = true;
        } else {
            sanitized.push(next);
            last_was_separator = false;
        }
    }

    let sanitized = sanitized.trim_matches('_');
    if sanitized.is_empty() {
        "port".to_string()
    } else {
        sanitized.to_string()
    }
}

fn rotated_segment_path(
    path_template: &Path,
    metadata: &LogMetadata,
    timestamp_wall_ms: u128,
    segment_index: u64,
) -> PathBuf {
    let resolved = resolve_log_path_template(path_template, metadata, timestamp_wall_ms);
    if segment_index == 0 {
        return resolved;
    }

    let Some(file_name) = resolved.file_name().and_then(|value| value.to_str()) else {
        return resolved;
    };
    let suffix = format!("{segment_index:04}");
    let rotated_file_name = match (
        Path::new(file_name)
            .file_stem()
            .and_then(|value| value.to_str()),
        Path::new(file_name)
            .extension()
            .and_then(|value| value.to_str()),
    ) {
        (Some(stem), Some(extension)) => format!("{stem}.{suffix}.{extension}"),
        _ => format!("{file_name}.{suffix}"),
    };

    resolved.with_file_name(rotated_file_name)
}

fn period_key(period: LogRotationPeriod, timestamp_wall_ms: u128) -> Option<i64> {
    let seconds = timestamp_wall_ms.checked_div(1000)? as i64;
    match period {
        LogRotationPeriod::Never => None,
        LogRotationPeriod::Hourly => Some(seconds.div_euclid(60 * 60)),
        LogRotationPeriod::Daily => Some(seconds.div_euclid(24 * 60 * 60)),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DateTimeParts {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
}

fn utc_date_time_parts(timestamp_wall_ms: u128) -> DateTimeParts {
    let seconds = timestamp_wall_ms.checked_div(1000).unwrap_or_default() as i64;
    let days = seconds.div_euclid(24 * 60 * 60);
    let seconds_of_day = seconds.rem_euclid(24 * 60 * 60);
    let (year, month, day) = civil_from_days(days);

    DateTimeParts {
        year,
        month,
        day,
        hour: (seconds_of_day / (60 * 60)) as u32,
        minute: ((seconds_of_day % (60 * 60)) / 60) as u32,
        second: (seconds_of_day % 60) as u32,
    }
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 }.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524
        - day_of_era / 146_096)
        .div_euclid(365);
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2).div_euclid(153);
    let day = day_of_year - (153 * month_prime + 2).div_euclid(5) + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };

    (year as i32, month as u32, day as u32)
}

fn encode_header(format: LogFormat, metadata: &LogMetadata) -> Result<Vec<u8>, LogError> {
    match format {
        LogFormat::PlainText | LogFormat::TimestampedText => Ok(format!(
            "# MultiSerial log v1\n# sessionId: {}\n# portPath: {}\n# baudRate: {}\n# dataBits: {}\n# parity: {}\n# stopBits: {}\n# flowControl: {}\n# startedAtWallMs: {}\n",
            metadata.session_id,
            metadata.port_path,
            metadata.baud_rate,
            metadata.data_bits,
            metadata.parity,
            metadata.stop_bits,
            metadata.flow_control,
            metadata.started_at_wall_ms
        )
        .into_bytes()),
        LogFormat::Binary => {
            let mut header = b"MSLOG1\n".to_vec();
            header.extend(serde_json::to_vec(metadata).map_err(LogError::Serialize)?);
            header.push(b'\n');
            Ok(header)
        }
    }
}

fn encode_record(format: LogFormat, record: &LogRecord) -> Vec<u8> {
    match format {
        LogFormat::PlainText => record.bytes.clone(),
        LogFormat::TimestampedText => {
            let mut line = format!(
                "[{}] {} ",
                record.timestamp_wall_ms,
                direction_label(record.direction)
            )
            .into_bytes();
            append_escaped_ascii(&mut line, &record.bytes);
            line.push(b'\n');
            line
        }
        LogFormat::Binary => {
            let mut encoded = Vec::with_capacity(1 + 16 + 8 + record.bytes.len());
            encoded.push(match record.direction {
                LogDirection::Rx => 1,
                LogDirection::Tx => 2,
                LogDirection::Marker => 3,
            });
            encoded.extend(record.timestamp_wall_ms.to_le_bytes());
            encoded.extend((record.bytes.len() as u64).to_le_bytes());
            encoded.extend(&record.bytes);
            encoded
        }
    }
}

fn append_escaped_ascii(output: &mut Vec<u8>, bytes: &[u8]) {
    for byte in bytes {
        match byte {
            b'\r' => output.extend(b"\\r"),
            b'\n' => output.extend(b"\\n"),
            b'\t' => output.extend(b"\\t"),
            b'\\' => output.extend(b"\\\\"),
            0x20..=0x7e => output.push(*byte),
            _ => output.extend(format!("\\x{byte:02X}").as_bytes()),
        }
    }
}

fn direction_label(direction: LogDirection) -> &'static str {
    match direction {
        LogDirection::Rx => "RX",
        LogDirection::Tx => "TX",
        LogDirection::Marker => "MARK",
    }
}

fn normalize_token(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_supported_log_formats() {
        assert_eq!(
            LogFormat::try_from("plain-text").unwrap(),
            LogFormat::PlainText
        );
        assert_eq!(
            LogFormat::try_from("timestamped-text").unwrap(),
            LogFormat::TimestampedText
        );
        assert_eq!(LogFormat::try_from("binary").unwrap(), LogFormat::Binary);
    }

    #[test]
    fn timestamped_text_escapes_binary_bytes() {
        let record = LogRecord::rx(123, vec![b'A', b'\r', b'\n', 0x00, 0xff]);
        let encoded = encode_record(LogFormat::TimestampedText, &record);

        assert_eq!(encoded, b"[123] RX A\\r\\n\\x00\\xFF\n");
    }

    #[test]
    fn timestamped_text_prefixes_tx_records() {
        let record = LogRecord::tx(456, vec![b'O', b'K']);
        let encoded = encode_record(LogFormat::TimestampedText, &record);

        assert_eq!(encoded, b"[456] TX OK\n");
    }

    #[test]
    fn binary_record_includes_direction_timestamp_length_and_payload() {
        let record = LogRecord::rx(0x1122, vec![0x00, 0xff]);
        let encoded = encode_record(LogFormat::Binary, &record);

        assert_eq!(encoded[0], 1);
        assert_eq!(
            u128::from_le_bytes(encoded[1..17].try_into().unwrap()),
            0x1122
        );
        assert_eq!(u64::from_le_bytes(encoded[17..25].try_into().unwrap()), 2);
        assert_eq!(&encoded[25..], &[0x00, 0xff]);
    }

    #[test]
    fn writer_creates_parent_directory_and_tracks_logged_rx_bytes() {
        let dir = test_dir("writer");
        let path = dir.join("nested").join("capture.log");
        let metadata = test_metadata();
        let mut writer =
            LogWriter::open(&path, LogFormat::TimestampedText, false, &metadata).unwrap();

        let logged_bytes = writer
            .write_records(&[LogRecord::rx(123, vec![b'A', b'B'])])
            .unwrap();

        assert_eq!(logged_bytes, 2);
        assert!(writer.current_size() > 0);
        assert!(fs::read_to_string(path).unwrap().contains("[123] RX AB"));
    }

    #[test]
    fn writer_reports_log_path_unavailable() {
        let dir = test_dir("path-unavailable");
        fs::create_dir_all(&dir).unwrap();
        let parent_file = dir.join("not-a-directory");
        fs::write(&parent_file, b"blocking file").unwrap();
        let error = match LogWriter::open(
            parent_file.join("capture.log"),
            LogFormat::TimestampedText,
            false,
            &test_metadata(),
        ) {
            Ok(_) => panic!("file parent should make log path unavailable"),
            Err(error) => error,
        };

        assert!(matches!(error, LogError::Io { .. }));
    }

    #[test]
    fn writer_surfaces_disk_full_after_logging_starts() {
        let mut writer = test_writer_with_failing_file(io::ErrorKind::StorageFull);
        let error = writer
            .write_records(&[LogRecord::rx(123, b"payload".to_vec())])
            .expect_err("simulated disk full should fail writes");

        assert_eq!(error.kind(), io::ErrorKind::StorageFull);
    }

    #[test]
    fn writer_surfaces_permission_denied_after_logging_starts() {
        let mut writer = test_writer_with_failing_file(io::ErrorKind::PermissionDenied);
        let error = writer
            .write_records(&[LogRecord::rx(123, b"payload".to_vec())])
            .expect_err("simulated permission loss should fail writes");

        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
    }

    #[test]
    fn resolves_filename_template_tokens_and_sanitizes_port_names() {
        let mut metadata = test_metadata();
        metadata.port_path = "/dev/tty.usbserial-A/B".to_string();
        metadata.started_at_wall_ms = 1_704_164_645_000;
        let path = resolve_log_path_template(
            "logs/{port}_{sessionId}_{baudRate}_{YYYY-MM-DD_HH-mm-ss}.log",
            &metadata,
            metadata.started_at_wall_ms,
        );

        assert_eq!(
            path,
            PathBuf::from("logs/dev_tty.usbserial-A_B_session-1_115200_2024-01-02_03-04-05.log")
        );
    }

    #[test]
    fn binary_writer_round_trips_all_byte_values() {
        let dir = test_dir("binary-round-trip");
        let path = dir.join("capture.bin");
        let metadata = test_metadata();
        let payload = (0..=255).collect::<Vec<u8>>();
        let mut writer = LogWriter::open(&path, LogFormat::Binary, false, &metadata).unwrap();

        writer
            .write_records(&[LogRecord::rx(0x1122, payload.clone())])
            .unwrap();
        writer.finish().unwrap();

        let bytes = fs::read(path).unwrap();
        let record_offset = binary_record_offset(&bytes);
        assert_eq!(bytes[record_offset], 1);
        assert_eq!(
            u128::from_le_bytes(
                bytes[record_offset + 1..record_offset + 17]
                    .try_into()
                    .unwrap()
            ),
            0x1122
        );
        assert_eq!(
            u64::from_le_bytes(
                bytes[record_offset + 17..record_offset + 25]
                    .try_into()
                    .unwrap()
            ),
            256
        );
        assert_eq!(&bytes[record_offset + 25..], payload.as_slice());
    }

    #[test]
    fn writer_rotates_by_size_and_applies_retention() {
        let dir = test_dir("size-rotation");
        let path = dir.join("capture.log");
        let metadata = test_metadata();
        let mut writer = LogWriter::open_with_options(
            &path,
            LogFormat::PlainText,
            &metadata,
            LogWriterOptions {
                append: false,
                rotation: LogRotationConfig {
                    size_bytes: Some(1),
                    period: LogRotationPeriod::Never,
                    max_files_to_keep: Some(2),
                },
                started_at_wall_ms: metadata.started_at_wall_ms,
            },
        )
        .unwrap();

        let logged_bytes = writer
            .write_records(&[
                LogRecord::rx(1, b"one".to_vec()),
                LogRecord::rx(2, b"two".to_vec()),
                LogRecord::rx(3, b"three".to_vec()),
            ])
            .unwrap();
        writer.finish().unwrap();

        assert_eq!(logged_bytes, 11);
        assert!(!path.exists());
        assert!(dir.join("capture.0001.log").exists());
        assert!(dir.join("capture.0002.log").exists());
        assert_eq!(
            writer.current_path(),
            dir.join("capture.0002.log").as_path()
        );
        for retained_path in [dir.join("capture.0001.log"), dir.join("capture.0002.log")] {
            let contents = fs::read_to_string(retained_path).unwrap();
            assert!(contents.contains("# MultiSerial log v1"));
            assert!(contents.contains("# sessionId: session-1"));
        }
        assert!(fs::read_to_string(dir.join("capture.0002.log"))
            .unwrap()
            .contains("three"));
    }

    #[test]
    fn writer_rotates_by_time_period() {
        let dir = test_dir("time-rotation");
        let path = dir.join("{date}.log");
        let mut metadata = test_metadata();
        metadata.started_at_wall_ms = 1_704_067_200_000;
        let mut writer = LogWriter::open_with_options(
            &path,
            LogFormat::PlainText,
            &metadata,
            LogWriterOptions {
                append: false,
                rotation: LogRotationConfig {
                    size_bytes: None,
                    period: LogRotationPeriod::Daily,
                    max_files_to_keep: None,
                },
                started_at_wall_ms: metadata.started_at_wall_ms,
            },
        )
        .unwrap();

        writer
            .write_records(&[
                LogRecord::rx(1_704_067_200_000, b"first".to_vec()),
                LogRecord::rx(1_704_153_600_000, b"second".to_vec()),
            ])
            .unwrap();
        writer.finish().unwrap();

        assert!(dir.join("2024-01-01.log").exists());
        assert!(dir.join("2024-01-02.0001.log").exists());
        assert!(fs::read_to_string(dir.join("2024-01-02.0001.log"))
            .unwrap()
            .contains("second"));
    }

    fn test_metadata() -> LogMetadata {
        LogMetadata {
            session_id: "session-1".to_string(),
            port_path: "/dev/ttyUSB0".to_string(),
            baud_rate: 115200,
            data_bits: 8,
            parity: "none".to_string(),
            stop_bits: "1".to_string(),
            flow_control: "none".to_string(),
            started_at_wall_ms: 1,
        }
    }

    fn test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("multiserial-log-{name}-{nanos}"))
    }

    fn test_writer_with_failing_file(kind: io::ErrorKind) -> LogWriter {
        let metadata = test_metadata();
        let header_size = encode_header(LogFormat::TimestampedText, &metadata)
            .unwrap()
            .len() as u64;
        LogWriter {
            file: LogFileHandle::Failing(TestLogFile {
                len: header_size,
                fail_write_kind: Some(kind),
                fail_sync_kind: None,
            }),
            path_template: PathBuf::from("capture.log"),
            current_path: PathBuf::from("capture.log"),
            format: LogFormat::TimestampedText,
            metadata,
            header_size,
            current_size: header_size,
            rotation: LogRotationConfig::default(),
            segment_index: 0,
            current_period_key: None,
            segment_paths: vec![PathBuf::from("capture.log")],
        }
    }

    fn binary_record_offset(bytes: &[u8]) -> usize {
        let first_newline = bytes.iter().position(|byte| *byte == b'\n').unwrap();
        bytes[first_newline + 1..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|index| first_newline + 1 + index + 1)
            .unwrap()
    }
}
