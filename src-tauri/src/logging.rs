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
    file: File,
    format: LogFormat,
    current_size: u64,
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
    pub fn open(
        path: impl AsRef<Path>,
        format: LogFormat,
        append: bool,
        metadata: &LogMetadata,
    ) -> Result<Self, LogError> {
        let path = path.as_ref();
        validate_log_path(path)?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| LogError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(append)
            .truncate(!append)
            .open(path)
            .map_err(|source| LogError::Io {
                path: path.to_path_buf(),
                source,
            })?;

        let mut current_size = file
            .metadata()
            .map_err(|source| LogError::Io {
                path: path.to_path_buf(),
                source,
            })?
            .len();

        let header = encode_header(format, metadata)?;
        file.write_all(&header).map_err(|source| LogError::Io {
            path: path.to_path_buf(),
            source,
        })?;
        current_size += header.len() as u64;

        Ok(Self {
            file,
            format,
            current_size,
        })
    }

    pub fn write_records(&mut self, records: &[LogRecord]) -> Result<u64, io::Error> {
        let mut logged_payload_bytes = 0;

        for record in records {
            let encoded = encode_record(self.format, record);
            self.file.write_all(&encoded)?;
            self.current_size += encoded.len() as u64;

            if record.direction == LogDirection::Rx {
                logged_payload_bytes += record.payload_len() as u64;
            }
        }

        self.file.flush()?;
        Ok(logged_payload_bytes)
    }

    pub fn current_size(&self) -> u64 {
        self.current_size
    }
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
}
