use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fmt;
use std::io::{ErrorKind, Read, Write};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

pub const RX_BATCH_INTERVAL_MS: u64 = 16;
pub const HOTPLUG_POLL_INTERVAL_MS: u64 = 1000;
const RX_QUEUE_CAPACITY_BYTES: usize = 1024 * 1024;
const RX_READ_CHUNK_SIZE: usize = 4096;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortSummary {
    pub path: String,
    pub display_name: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub port_type: String,
}

pub trait SerialBackend {
    fn list_ports(&self) -> Result<Vec<SerialPortSummary>, SerialError>;
    fn open_port(&self, config: &SerialConfig) -> Result<Box<dyn SerialPortHandle>, SerialError>;
}

pub trait SerialPortHandle: Send {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<usize, SerialError>;
    fn read_available(&mut self, buffer: &mut [u8]) -> Result<usize, SerialError>;
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfigInput {
    pub port_path: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub parity: String,
    pub stop_bits: f32,
    pub flow_control: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SerialConfig {
    pub port_path: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub parity: String,
    pub stop_bits: String,
    pub flow_control: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionState {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
    HotUnplugged,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionEvent {
    ConnectRequested,
    ConnectSucceeded,
    ConnectFailed,
    DisconnectRequested,
    DisconnectCompleted,
    HotUnplugDetected,
    ReconnectRequested,
    ReconnectSucceeded,
    RetryCancelled,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionRequest {
    pub config: SerialConfigInput,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionResult {
    pub session_id: String,
    pub state: SessionState,
    pub config: SerialConfig,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
    pub session_id: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub session_id: String,
    pub bytes_written: usize,
    pub tx_bytes: u64,
    pub timestamp_wall_ms: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RxChunk {
    pub sequence: u64,
    pub timestamp_wall_ms: u128,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RxBatch {
    pub session_id: String,
    pub chunks: Vec<RxChunk>,
    pub rx_bytes: u64,
    pub queued_bytes: usize,
    pub dropped_rx_bytes: u64,
    pub batch_interval_ms: u64,
    pub drained_at_wall_ms: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloseSessionResult {
    pub session_id: String,
    pub state: SessionState,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum PortChangeKind {
    Inserted,
    Removed,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortChange {
    pub kind: PortChangeKind,
    pub port: SerialPortSummary,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HotplugPollResult {
    pub ports: Vec<SerialPortSummary>,
    pub changes: Vec<PortChange>,
    pub hot_unplugged_sessions: Vec<String>,
}

pub struct SessionManager<B: SerialBackend> {
    backend: B,
    sessions: HashMap<String, SerialSession>,
    next_session_number: u64,
}

struct SerialSession {
    config: SerialConfig,
    state: SessionState,
    port: Option<Box<dyn SerialPortHandle>>,
    tx_bytes: u64,
    rx_bytes: u64,
    dropped_rx_bytes: u64,
    next_rx_sequence: u64,
    rx_queue_bytes: usize,
    rx_queue_capacity_bytes: usize,
    rx_queue: VecDeque<RxChunk>,
    rx_worker_running: bool,
}

#[derive(Debug, Default)]
pub struct RealSerialBackend;

impl SerialBackend for RealSerialBackend {
    fn list_ports(&self) -> Result<Vec<SerialPortSummary>, SerialError> {
        let ports = serialport::available_ports().map_err(|source| SerialError::ListPorts {
            message: source.to_string(),
        })?;

        Ok(ports.into_iter().map(SerialPortSummary::from).collect())
    }

    fn open_port(&self, config: &SerialConfig) -> Result<Box<dyn SerialPortHandle>, SerialError> {
        let port =
            apply_config_to_builder(config)?
                .open()
                .map_err(|source| SerialError::OpenPort {
                    port_path: config.port_path.clone(),
                    message: source.to_string(),
                })?;

        Ok(Box::new(RealSerialPortHandle { port }))
    }
}

struct RealSerialPortHandle {
    port: Box<dyn serialport::SerialPort>,
}

impl SerialPortHandle for RealSerialPortHandle {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<usize, SerialError> {
        self.port.write(bytes).map_err(|source| SerialError::Write {
            message: source.to_string(),
        })
    }

    fn read_available(&mut self, buffer: &mut [u8]) -> Result<usize, SerialError> {
        let available = self
            .port
            .bytes_to_read()
            .map_err(|source| SerialError::Read {
                message: source.to_string(),
            })?;

        if available == 0 || buffer.is_empty() {
            return Ok(0);
        }

        let read_len = buffer.len().min(available as usize);
        match self.port.read(&mut buffer[..read_len]) {
            Ok(bytes_read) => Ok(bytes_read),
            Err(source) if matches!(source.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) => {
                Ok(0)
            }
            Err(source) => Err(SerialError::Read {
                message: source.to_string(),
            }),
        }
    }
}

#[cfg(test)]
#[derive(Debug, Clone)]
struct MockSerialBackend {
    ports: Vec<SerialPortSummary>,
    fail_open: bool,
    scripted_rx: Vec<Vec<u8>>,
}

#[cfg(test)]
impl MockSerialBackend {
    fn new(ports: Vec<SerialPortSummary>) -> Self {
        Self {
            ports,
            fail_open: false,
            scripted_rx: Vec::new(),
        }
    }

    fn failing_open(ports: Vec<SerialPortSummary>) -> Self {
        Self {
            ports,
            fail_open: true,
            scripted_rx: Vec::new(),
        }
    }

    fn with_rx(ports: Vec<SerialPortSummary>, scripted_rx: Vec<Vec<u8>>) -> Self {
        Self {
            ports,
            fail_open: false,
            scripted_rx,
        }
    }
}

#[cfg(test)]
impl SerialBackend for MockSerialBackend {
    fn list_ports(&self) -> Result<Vec<SerialPortSummary>, SerialError> {
        Ok(self.ports.clone())
    }

    fn open_port(&self, config: &SerialConfig) -> Result<Box<dyn SerialPortHandle>, SerialError> {
        if self.fail_open {
            return Err(SerialError::OpenPort {
                port_path: config.port_path.clone(),
                message: "mock driver rejected open".to_string(),
            });
        }

        Ok(Box::new(MockSerialPortHandle {
            scripted_rx: VecDeque::from(self.scripted_rx.clone()),
            written: Vec::new(),
        }))
    }
}

#[cfg(test)]
#[derive(Debug, Default)]
struct MockSerialPortHandle {
    written: Vec<u8>,
    scripted_rx: VecDeque<Vec<u8>>,
}

#[cfg(test)]
impl SerialPortHandle for MockSerialPortHandle {
    fn write_bytes(&mut self, bytes: &[u8]) -> Result<usize, SerialError> {
        self.written.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn read_available(&mut self, buffer: &mut [u8]) -> Result<usize, SerialError> {
        let Some(mut chunk) = self.scripted_rx.pop_front() else {
            return Ok(0);
        };

        let bytes_read = buffer.len().min(chunk.len());
        buffer[..bytes_read].copy_from_slice(&chunk[..bytes_read]);

        if bytes_read < chunk.len() {
            let remainder = chunk.split_off(bytes_read);
            self.scripted_rx.push_front(remainder);
        }

        Ok(bytes_read)
    }
}

#[derive(Debug)]
pub enum SerialError {
    ListPorts {
        message: String,
    },
    OpenPort {
        port_path: String,
        message: String,
    },
    SessionNotFound {
        session_id: String,
    },
    SessionNotConnected {
        session_id: String,
        state: SessionState,
    },
    Write {
        message: String,
    },
    Read {
        message: String,
    },
    InvalidConfig {
        field: &'static str,
        message: String,
    },
    UnsupportedConfig {
        field: &'static str,
        message: String,
    },
    InvalidTransition {
        from: SessionState,
        event: SessionEvent,
    },
}

impl fmt::Display for SerialError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SerialError::ListPorts { message } => {
                write!(formatter, "failed to list serial ports: {message}")
            }
            SerialError::OpenPort { port_path, message } => {
                write!(
                    formatter,
                    "failed to open serial port `{port_path}`: {message}"
                )
            }
            SerialError::SessionNotFound { session_id } => {
                write!(formatter, "serial session `{session_id}` was not found")
            }
            SerialError::SessionNotConnected { session_id, state } => {
                write!(
                    formatter,
                    "serial session `{session_id}` is not connected; current state is {state:?}"
                )
            }
            SerialError::Write { message } => {
                write!(formatter, "serial write failed: {message}")
            }
            SerialError::Read { message } => {
                write!(formatter, "serial read failed: {message}")
            }
            SerialError::InvalidConfig { field, message } => {
                write!(formatter, "invalid serial config `{field}`: {message}")
            }
            SerialError::UnsupportedConfig { field, message } => {
                write!(formatter, "unsupported serial config `{field}`: {message}")
            }
            SerialError::InvalidTransition { from, event } => {
                write!(
                    formatter,
                    "invalid session transition from {from:?} on {event:?}"
                )
            }
        }
    }
}

impl std::error::Error for SerialError {}

impl From<serialport::SerialPortInfo> for SerialPortSummary {
    fn from(info: serialport::SerialPortInfo) -> Self {
        match info.port_type {
            serialport::SerialPortType::UsbPort(usb) => {
                let display_name = friendly_display_name(&info.port_name, usb.product.as_deref());

                Self {
                    path: info.port_name,
                    display_name,
                    vid: Some(usb.vid),
                    pid: Some(usb.pid),
                    serial_number: usb.serial_number,
                    manufacturer: usb.manufacturer,
                    product: usb.product,
                    port_type: "usb".to_string(),
                }
            }
            serialport::SerialPortType::BluetoothPort => Self {
                display_name: info.port_name.clone(),
                path: info.port_name,
                vid: None,
                pid: None,
                serial_number: None,
                manufacturer: None,
                product: None,
                port_type: "bluetooth".to_string(),
            },
            serialport::SerialPortType::PciPort => Self {
                display_name: info.port_name.clone(),
                path: info.port_name,
                vid: None,
                pid: None,
                serial_number: None,
                manufacturer: None,
                product: None,
                port_type: "pci".to_string(),
            },
            serialport::SerialPortType::Unknown => Self {
                display_name: info.port_name.clone(),
                path: info.port_name,
                vid: None,
                pid: None,
                serial_number: None,
                manufacturer: None,
                product: None,
                port_type: "unknown".to_string(),
            },
        }
    }
}

fn friendly_display_name(port_name: &str, product: Option<&str>) -> String {
    product
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("{value} ({port_name})"))
        .unwrap_or_else(|| port_name.to_string())
}

pub fn list_ports_with<B: SerialBackend>(
    backend: &B,
) -> Result<Vec<SerialPortSummary>, SerialError> {
    let mut ports = backend.list_ports()?;
    ports.sort_by(|left, right| left.path.cmp(&right.path));
    ports.dedup_by(|left, right| left.path == right.path);
    Ok(ports)
}

pub fn diff_port_lists(
    previous_ports: &[SerialPortSummary],
    current_ports: &[SerialPortSummary],
) -> Vec<PortChange> {
    let previous_by_path: HashMap<&str, &SerialPortSummary> = previous_ports
        .iter()
        .map(|port| (port.path.as_str(), port))
        .collect();
    let current_by_path: HashMap<&str, &SerialPortSummary> = current_ports
        .iter()
        .map(|port| (port.path.as_str(), port))
        .collect();

    let mut changes = Vec::new();

    for port in current_ports {
        if !previous_by_path.contains_key(port.path.as_str()) {
            changes.push(PortChange {
                kind: PortChangeKind::Inserted,
                port: port.clone(),
            });
        }
    }

    for port in previous_ports {
        if !current_by_path.contains_key(port.path.as_str()) {
            changes.push(PortChange {
                kind: PortChangeKind::Removed,
                port: port.clone(),
            });
        }
    }

    changes.sort_by(|left, right| {
        left.port
            .path
            .cmp(&right.port.path)
            .then(left.kind.cmp(&right.kind))
    });

    changes
}

pub fn validate_serial_config(input: SerialConfigInput) -> Result<SerialConfig, SerialError> {
    if input.port_path.trim().is_empty() {
        return Err(SerialError::InvalidConfig {
            field: "portPath",
            message: "port path is required".to_string(),
        });
    }

    if input.baud_rate == 0 {
        return Err(SerialError::InvalidConfig {
            field: "baudRate",
            message: "baud rate must be a positive integer".to_string(),
        });
    }

    if !matches!(input.data_bits, 5..=8) {
        return Err(SerialError::InvalidConfig {
            field: "dataBits",
            message: "supported values are 5, 6, 7, and 8".to_string(),
        });
    }

    let parity = normalize_token(&input.parity);
    if !matches!(parity.as_str(), "none" | "even" | "odd" | "mark" | "space") {
        return Err(SerialError::InvalidConfig {
            field: "parity",
            message: "supported values are none, even, odd, mark, and space".to_string(),
        });
    }

    let stop_bits = if nearly_equal(input.stop_bits, 1.0) {
        "1"
    } else if nearly_equal(input.stop_bits, 1.5) {
        "1.5"
    } else if nearly_equal(input.stop_bits, 2.0) {
        "2"
    } else {
        return Err(SerialError::InvalidConfig {
            field: "stopBits",
            message: "supported values are 1, 1.5, and 2".to_string(),
        });
    };

    let flow_control = normalize_token(&input.flow_control);
    if !matches!(
        flow_control.as_str(),
        "none" | "rtscts" | "xonxoff" | "dtrdsr"
    ) {
        return Err(SerialError::InvalidConfig {
            field: "flowControl",
            message: "supported values are none, rtsCts, xonXoff, and dtrDsr".to_string(),
        });
    }

    Ok(SerialConfig {
        port_path: input.port_path,
        baud_rate: input.baud_rate,
        data_bits: input.data_bits,
        parity,
        stop_bits: stop_bits.to_string(),
        flow_control,
    })
}

pub fn apply_config_to_builder(
    config: &SerialConfig,
) -> Result<serialport::SerialPortBuilder, SerialError> {
    let builder = serialport::new(&config.port_path, config.baud_rate)
        .timeout(Duration::from_millis(100))
        .data_bits(match config.data_bits {
            5 => serialport::DataBits::Five,
            6 => serialport::DataBits::Six,
            7 => serialport::DataBits::Seven,
            8 => serialport::DataBits::Eight,
            _ => {
                return Err(SerialError::InvalidConfig {
                    field: "dataBits",
                    message: "supported values are 5, 6, 7, and 8".to_string(),
                });
            }
        })
        .parity(match config.parity.as_str() {
            "none" => serialport::Parity::None,
            "even" => serialport::Parity::Even,
            "odd" => serialport::Parity::Odd,
            "mark" | "space" => {
                return Err(SerialError::UnsupportedConfig {
                    field: "parity",
                    message: "mark and space parity are not exposed by the current serial backend"
                        .to_string(),
                });
            }
            _ => {
                return Err(SerialError::InvalidConfig {
                    field: "parity",
                    message: "unsupported parity value".to_string(),
                });
            }
        })
        .stop_bits(match config.stop_bits.as_str() {
            "1" => serialport::StopBits::One,
            "2" => serialport::StopBits::Two,
            "1.5" => {
                return Err(SerialError::UnsupportedConfig {
                    field: "stopBits",
                    message: "1.5 stop bits are not exposed by the current serial backend"
                        .to_string(),
                });
            }
            _ => {
                return Err(SerialError::InvalidConfig {
                    field: "stopBits",
                    message: "unsupported stop bits value".to_string(),
                });
            }
        })
        .flow_control(match config.flow_control.as_str() {
            "none" => serialport::FlowControl::None,
            "rtscts" => serialport::FlowControl::Hardware,
            "xonxoff" => serialport::FlowControl::Software,
            "dtrdsr" => {
                return Err(SerialError::UnsupportedConfig {
                    field: "flowControl",
                    message: "DTR/DSR flow control is not exposed by the current serial backend"
                        .to_string(),
                });
            }
            _ => {
                return Err(SerialError::InvalidConfig {
                    field: "flowControl",
                    message: "unsupported flow control value".to_string(),
                });
            }
        });

    Ok(builder)
}

pub fn transition(state: SessionState, event: SessionEvent) -> Result<SessionState, SerialError> {
    let next = match (state, event) {
        (SessionState::Disconnected, SessionEvent::ConnectRequested) => SessionState::Connecting,
        (SessionState::Connecting, SessionEvent::ConnectSucceeded) => SessionState::Connected,
        (SessionState::Connecting, SessionEvent::ConnectFailed) => SessionState::Error,
        (SessionState::Connected, SessionEvent::DisconnectRequested) => SessionState::Disconnecting,
        (SessionState::Disconnecting, SessionEvent::DisconnectCompleted) => {
            SessionState::Disconnected
        }
        (SessionState::Connected, SessionEvent::HotUnplugDetected) => SessionState::HotUnplugged,
        (SessionState::HotUnplugged, SessionEvent::ReconnectRequested) => {
            SessionState::Reconnecting
        }
        (SessionState::Reconnecting, SessionEvent::ReconnectSucceeded) => SessionState::Connected,
        (SessionState::Reconnecting, SessionEvent::RetryCancelled) => SessionState::Disconnected,
        (SessionState::HotUnplugged, SessionEvent::RetryCancelled) => SessionState::Disconnected,
        (SessionState::Error, SessionEvent::RetryCancelled) => SessionState::Disconnected,
        (from, event) => {
            return Err(SerialError::InvalidTransition { from, event });
        }
    };

    Ok(next)
}

impl<B: SerialBackend> SessionManager<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            sessions: HashMap::new(),
            next_session_number: 1,
        }
    }

    pub fn open_session(
        &mut self,
        request: OpenSessionRequest,
    ) -> Result<OpenSessionResult, SerialError> {
        let config = validate_serial_config(request.config)?;
        let port = self.backend.open_port(&config)?;
        let session_id = self.allocate_session_id();

        self.sessions.insert(
            session_id.clone(),
            SerialSession {
                config: config.clone(),
                state: SessionState::Connected,
                port: Some(port),
                tx_bytes: 0,
                rx_bytes: 0,
                dropped_rx_bytes: 0,
                next_rx_sequence: 1,
                rx_queue_bytes: 0,
                rx_queue_capacity_bytes: RX_QUEUE_CAPACITY_BYTES,
                rx_queue: VecDeque::new(),
                rx_worker_running: false,
            },
        );

        Ok(OpenSessionResult {
            session_id,
            state: SessionState::Connected,
            config,
        })
    }

    pub fn close_session(&mut self, session_id: &str) -> Result<CloseSessionResult, SerialError> {
        let session =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| SerialError::SessionNotFound {
                    session_id: session_id.to_string(),
                })?;

        session.state = match session.state {
            SessionState::Connected => {
                transition(session.state, SessionEvent::DisconnectRequested)?
            }
            SessionState::HotUnplugged | SessionState::Reconnecting | SessionState::Error => {
                transition(session.state, SessionEvent::RetryCancelled)?
            }
            state => transition(state, SessionEvent::DisconnectRequested)?,
        };
        session.port.take();
        if session.state == SessionState::Disconnecting {
            session.state = transition(session.state, SessionEvent::DisconnectCompleted)?;
        }

        Ok(CloseSessionResult {
            session_id: session_id.to_string(),
            state: session.state,
        })
    }

    pub fn reconnect_session(
        &mut self,
        session_id: &str,
    ) -> Result<OpenSessionResult, SerialError> {
        let config = {
            let session =
                self.sessions
                    .get_mut(session_id)
                    .ok_or_else(|| SerialError::SessionNotFound {
                        session_id: session_id.to_string(),
                    })?;

            session.state = transition(session.state, SessionEvent::ReconnectRequested)?;
            session.config.clone()
        };

        match self.backend.open_port(&config) {
            Ok(port) => {
                let session = self.sessions.get_mut(session_id).ok_or_else(|| {
                    SerialError::SessionNotFound {
                        session_id: session_id.to_string(),
                    }
                })?;

                session.port = Some(port);
                session.state = transition(session.state, SessionEvent::ReconnectSucceeded)?;
                session.rx_worker_running = false;

                Ok(OpenSessionResult {
                    session_id: session_id.to_string(),
                    state: session.state,
                    config,
                })
            }
            Err(error) => {
                if let Some(session) = self.sessions.get_mut(session_id) {
                    session.state = SessionState::Error;
                    session.port.take();
                    session.rx_worker_running = false;
                }
                Err(error)
            }
        }
    }

    pub fn poll_hotplug(
        &mut self,
        previous_ports: &[SerialPortSummary],
    ) -> Result<HotplugPollResult, SerialError> {
        let ports = self.current_ports()?;
        let changes = diff_port_lists(previous_ports, &ports);
        let mut hot_unplugged_sessions = Vec::new();

        for change in &changes {
            if change.kind == PortChangeKind::Removed {
                hot_unplugged_sessions.extend(self.mark_port_removed(&change.port.path)?);
            }
        }

        hot_unplugged_sessions.sort();
        hot_unplugged_sessions.dedup();

        Ok(HotplugPollResult {
            ports,
            changes,
            hot_unplugged_sessions,
        })
    }

    pub fn mark_port_removed(&mut self, port_path: &str) -> Result<Vec<String>, SerialError> {
        let mut hot_unplugged_sessions = Vec::new();

        for (session_id, session) in &mut self.sessions {
            if session.config.port_path == port_path && session.state == SessionState::Connected {
                session.state = transition(session.state, SessionEvent::HotUnplugDetected)?;
                session.port.take();
                session.rx_worker_running = false;
                hot_unplugged_sessions.push(session_id.clone());
            }
        }

        Ok(hot_unplugged_sessions)
    }

    pub fn current_ports(&self) -> Result<Vec<SerialPortSummary>, SerialError> {
        list_ports_with(&self.backend)
    }

    pub fn write(&mut self, request: WriteRequest) -> Result<WriteResult, SerialError> {
        let session = self.sessions.get_mut(&request.session_id).ok_or_else(|| {
            SerialError::SessionNotFound {
                session_id: request.session_id.clone(),
            }
        })?;

        if session.state != SessionState::Connected {
            return Err(SerialError::SessionNotConnected {
                session_id: request.session_id,
                state: session.state,
            });
        }

        if request.bytes.is_empty() {
            return Ok(WriteResult {
                session_id: request.session_id,
                bytes_written: 0,
                tx_bytes: session.tx_bytes,
                timestamp_wall_ms: timestamp_wall_ms(),
            });
        }

        let port = session
            .port
            .as_mut()
            .ok_or_else(|| SerialError::SessionNotConnected {
                session_id: request.session_id.clone(),
                state: session.state,
            })?;

        let timestamp_wall_ms = timestamp_wall_ms();
        let bytes_written = port.write_bytes(&request.bytes)?;
        session.tx_bytes += bytes_written as u64;

        Ok(WriteResult {
            session_id: request.session_id,
            bytes_written,
            tx_bytes: session.tx_bytes,
            timestamp_wall_ms,
        })
    }

    pub fn poll_rx_once(&mut self, session_id: &str) -> Result<Option<RxChunk>, SerialError> {
        let session =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| SerialError::SessionNotFound {
                    session_id: session_id.to_string(),
                })?;

        if session.state != SessionState::Connected {
            return Err(SerialError::SessionNotConnected {
                session_id: session_id.to_string(),
                state: session.state,
            });
        }

        let port = session
            .port
            .as_mut()
            .ok_or_else(|| SerialError::SessionNotConnected {
                session_id: session_id.to_string(),
                state: session.state,
            })?;

        let mut buffer = vec![0; RX_READ_CHUNK_SIZE];
        let bytes_read = port.read_available(&mut buffer)?;

        if bytes_read == 0 {
            return Ok(None);
        }

        buffer.truncate(bytes_read);
        let chunk = RxChunk {
            sequence: session.next_rx_sequence,
            timestamp_wall_ms: timestamp_wall_ms(),
            bytes: buffer,
        };

        session.next_rx_sequence += 1;
        session.rx_bytes += bytes_read as u64;
        push_rx_chunk(session, chunk.clone());

        Ok(Some(chunk))
    }

    pub fn drain_rx(&mut self, session_id: &str) -> Result<RxBatch, SerialError> {
        let session =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| SerialError::SessionNotFound {
                    session_id: session_id.to_string(),
                })?;

        let chunks = session.rx_queue.drain(..).collect();
        session.rx_queue_bytes = 0;

        Ok(RxBatch {
            session_id: session_id.to_string(),
            chunks,
            rx_bytes: session.rx_bytes,
            queued_bytes: session.rx_queue_bytes,
            dropped_rx_bytes: session.dropped_rx_bytes,
            batch_interval_ms: RX_BATCH_INTERVAL_MS,
            drained_at_wall_ms: timestamp_wall_ms(),
        })
    }

    pub fn mark_rx_worker_started(&mut self, session_id: &str) -> Result<bool, SerialError> {
        let session =
            self.sessions
                .get_mut(session_id)
                .ok_or_else(|| SerialError::SessionNotFound {
                    session_id: session_id.to_string(),
                })?;

        if session.rx_worker_running {
            return Ok(false);
        }

        session.rx_worker_running = true;
        Ok(true)
    }

    pub fn mark_rx_worker_stopped(&mut self, session_id: &str) {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.rx_worker_running = false;
        }
    }

    pub fn mark_read_error(&mut self, session_id: &str) {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.state = SessionState::Error;
            session.port.take();
        }
    }

    pub fn state(&self, session_id: &str) -> Result<SessionState, SerialError> {
        self.sessions
            .get(session_id)
            .map(|session| session.state)
            .ok_or_else(|| SerialError::SessionNotFound {
                session_id: session_id.to_string(),
            })
    }

    pub fn config(&self, session_id: &str) -> Result<&SerialConfig, SerialError> {
        self.sessions
            .get(session_id)
            .map(|session| &session.config)
            .ok_or_else(|| SerialError::SessionNotFound {
                session_id: session_id.to_string(),
            })
    }

    fn allocate_session_id(&mut self) -> String {
        let session_id = format!("session-{}", self.next_session_number);
        self.next_session_number += 1;
        session_id
    }
}

fn push_rx_chunk(session: &mut SerialSession, mut chunk: RxChunk) {
    let chunk_len = chunk.bytes.len();
    if chunk_len > session.rx_queue_capacity_bytes {
        let bytes_to_keep = session.rx_queue_capacity_bytes;
        session.dropped_rx_bytes += (chunk_len - bytes_to_keep) as u64;
        chunk.bytes = chunk.bytes[chunk_len - bytes_to_keep..].to_vec();
    }

    while session.rx_queue_bytes + chunk.bytes.len() > session.rx_queue_capacity_bytes {
        let Some(dropped) = session.rx_queue.pop_front() else {
            break;
        };

        let dropped_len = dropped.bytes.len();
        session.rx_queue_bytes -= dropped_len;
        session.dropped_rx_bytes += dropped_len as u64;
    }

    session.rx_queue_bytes += chunk.bytes.len();
    session.rx_queue.push_back(chunk);
}

fn timestamp_wall_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn normalize_token(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn nearly_equal(left: f32, right: f32) -> bool {
    (left - right).abs() < f32::EPSILON
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_backend_lists_ports_sorted_and_deduplicated() {
        let backend = MockSerialBackend::new(vec![
            mock_port("/dev/ttyUSB1", "Adapter B"),
            mock_port("/dev/ttyUSB0", "Adapter A"),
            mock_port("/dev/ttyUSB0", "Adapter A Duplicate"),
        ]);

        let ports = list_ports_with(&backend).expect("mock list should pass");

        assert_eq!(ports.len(), 2);
        assert_eq!(ports[0].path, "/dev/ttyUSB0");
        assert_eq!(ports[1].path, "/dev/ttyUSB1");
    }

    #[test]
    fn port_diff_reports_insertions_and_removals() {
        let previous = vec![
            mock_port("/dev/ttyUSB0", "Adapter A"),
            mock_port("/dev/ttyUSB1", "Adapter B"),
        ];
        let current = vec![
            mock_port("/dev/ttyUSB1", "Adapter B"),
            mock_port("/dev/ttyUSB2", "Adapter C"),
        ];

        let changes = diff_port_lists(&previous, &current);

        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0].kind, PortChangeKind::Removed);
        assert_eq!(changes[0].port.path, "/dev/ttyUSB0");
        assert_eq!(changes[1].kind, PortChangeKind::Inserted);
        assert_eq!(changes[1].port.path, "/dev/ttyUSB2");
    }

    #[test]
    fn friendly_display_name_falls_back_to_port_path() {
        assert_eq!(friendly_display_name("COM3", None), "COM3");
        assert_eq!(friendly_display_name("COM3", Some("")), "COM3");
        assert_eq!(
            friendly_display_name("COM3", Some("CP2102")),
            "CP2102 (COM3)"
        );
    }

    #[test]
    fn validates_supported_serial_config() {
        let config = validate_serial_config(SerialConfigInput {
            port_path: "/dev/tty.usbserial-test".to_string(),
            baud_rate: 115200,
            data_bits: 8,
            parity: "None".to_string(),
            stop_bits: 1.0,
            flow_control: "RTS/CTS".to_string(),
        })
        .expect("config should validate");

        assert_eq!(config.baud_rate, 115200);
        assert_eq!(config.parity, "none");
        assert_eq!(config.flow_control, "rtscts");
    }

    #[test]
    fn rejects_invalid_serial_config_values() {
        let error = validate_serial_config(SerialConfigInput {
            port_path: "".to_string(),
            baud_rate: 115200,
            data_bits: 8,
            parity: "none".to_string(),
            stop_bits: 1.0,
            flow_control: "none".to_string(),
        })
        .expect_err("empty port path should fail");

        assert!(matches!(
            error,
            SerialError::InvalidConfig {
                field: "portPath",
                ..
            }
        ));
    }

    #[test]
    fn maps_backend_supported_serial_config_to_builder() {
        let config = validate_serial_config(SerialConfigInput {
            port_path: "/dev/tty.usbserial-test".to_string(),
            baud_rate: 921600,
            data_bits: 7,
            parity: "even".to_string(),
            stop_bits: 2.0,
            flow_control: "xonXoff".to_string(),
        })
        .expect("config should validate");

        apply_config_to_builder(&config).expect("builder should be created");
    }

    #[test]
    fn surfaces_backend_unsupported_serial_config() {
        let config = validate_serial_config(SerialConfigInput {
            port_path: "/dev/tty.usbserial-test".to_string(),
            baud_rate: 115200,
            data_bits: 8,
            parity: "mark".to_string(),
            stop_bits: 1.0,
            flow_control: "none".to_string(),
        })
        .expect("config should validate at API boundary");

        let error =
            apply_config_to_builder(&config).expect_err("backend should reject mark parity");

        assert!(matches!(
            error,
            SerialError::UnsupportedConfig {
                field: "parity",
                ..
            }
        ));
    }

    #[test]
    fn session_state_transitions_cover_documented_core_flow() {
        let state = transition(SessionState::Disconnected, SessionEvent::ConnectRequested).unwrap();
        let state = transition(state, SessionEvent::ConnectSucceeded).unwrap();
        let state = transition(state, SessionEvent::DisconnectRequested).unwrap();
        let state = transition(state, SessionEvent::DisconnectCompleted).unwrap();

        assert_eq!(state, SessionState::Disconnected);
    }

    #[test]
    fn session_state_transitions_cover_hot_unplug_reconnect_flow() {
        let state = transition(SessionState::Connected, SessionEvent::HotUnplugDetected).unwrap();
        let state = transition(state, SessionEvent::ReconnectRequested).unwrap();
        let state = transition(state, SessionEvent::ReconnectSucceeded).unwrap();

        assert_eq!(state, SessionState::Connected);
    }

    #[test]
    fn session_state_transitions_cover_connect_error_flow() {
        let state = transition(SessionState::Disconnected, SessionEvent::ConnectRequested).unwrap();
        let state = transition(state, SessionEvent::ConnectFailed).unwrap();
        let state = transition(state, SessionEvent::RetryCancelled).unwrap();

        assert_eq!(state, SessionState::Disconnected);
    }

    #[test]
    fn session_state_transitions_cover_reconnect_cancel_flow() {
        let state = transition(SessionState::Connected, SessionEvent::HotUnplugDetected).unwrap();
        let state = transition(state, SessionEvent::ReconnectRequested).unwrap();
        let state = transition(state, SessionEvent::RetryCancelled).unwrap();

        assert_eq!(state, SessionState::Disconnected);
    }

    #[test]
    fn session_state_transitions_cover_hot_unplug_cancel_flow() {
        let state = transition(SessionState::Connected, SessionEvent::HotUnplugDetected).unwrap();
        let state = transition(state, SessionEvent::RetryCancelled).unwrap();

        assert_eq!(state, SessionState::Disconnected);
    }

    #[test]
    fn session_state_rejects_invalid_transition() {
        let error = transition(
            SessionState::Disconnected,
            SessionEvent::DisconnectRequested,
        )
        .expect_err("disconnect from disconnected should fail");

        assert!(matches!(error, SerialError::InvalidTransition { .. }));
    }

    #[test]
    fn session_manager_opens_and_closes_mock_session() {
        let mut manager = SessionManager::new(MockSerialBackend::new(vec![mock_port(
            "/dev/ttyUSB0",
            "Adapter A",
        )]));

        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        assert_eq!(opened.state, SessionState::Connected);
        assert_eq!(
            manager.config(&opened.session_id).unwrap().port_path,
            "/dev/ttyUSB0"
        );

        let closed = manager
            .close_session(&opened.session_id)
            .expect("session should close");

        assert_eq!(closed.state, SessionState::Disconnected);
    }

    #[test]
    fn session_manager_surfaces_driver_open_error() {
        let mut manager = SessionManager::new(MockSerialBackend::failing_open(vec![mock_port(
            "/dev/ttyUSB0",
            "Adapter A",
        )]));

        let error = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect_err("mock driver should reject open");

        assert!(matches!(error, SerialError::OpenPort { .. }));
    }

    #[test]
    fn session_manager_writes_and_counts_tx_bytes() {
        let mut manager = SessionManager::new(MockSerialBackend::new(vec![mock_port(
            "/dev/ttyUSB0",
            "Adapter A",
        )]));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        let first = manager
            .write(WriteRequest {
                session_id: opened.session_id.clone(),
                bytes: vec![0x41, 0x54],
            })
            .expect("write should pass");
        let second = manager
            .write(WriteRequest {
                session_id: opened.session_id,
                bytes: vec![0x0d, 0x0a],
            })
            .expect("write should pass");

        assert_eq!(first.bytes_written, 2);
        assert_eq!(first.tx_bytes, 2);
        assert_eq!(second.bytes_written, 2);
        assert_eq!(second.tx_bytes, 4);
    }

    #[test]
    fn session_manager_rejects_write_to_closed_session() {
        let mut manager = SessionManager::new(MockSerialBackend::new(vec![mock_port(
            "/dev/ttyUSB0",
            "Adapter A",
        )]));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");
        manager.close_session(&opened.session_id).unwrap();

        let error = manager
            .write(WriteRequest {
                session_id: opened.session_id,
                bytes: vec![0x41],
            })
            .expect_err("closed session write should fail");

        assert!(matches!(error, SerialError::SessionNotConnected { .. }));
    }

    #[test]
    fn session_manager_marks_active_session_hot_unplugged_on_removed_port() {
        let previous_ports = vec![mock_port("/dev/ttyUSB0", "Adapter A")];
        let mut manager = SessionManager::new(MockSerialBackend::new(Vec::new()));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        let poll_result = manager
            .poll_hotplug(&previous_ports)
            .expect("hotplug poll should pass");

        assert_eq!(poll_result.changes.len(), 1);
        assert_eq!(poll_result.changes[0].kind, PortChangeKind::Removed);
        assert_eq!(
            poll_result.hot_unplugged_sessions,
            vec![opened.session_id.clone()]
        );
        assert_eq!(
            manager.state(&opened.session_id).unwrap(),
            SessionState::HotUnplugged
        );
    }

    #[test]
    fn session_manager_can_close_hot_unplugged_session() {
        let mut manager = SessionManager::new(MockSerialBackend::new(vec![mock_port(
            "/dev/ttyUSB0",
            "Adapter A",
        )]));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        let affected = manager.mark_port_removed("/dev/ttyUSB0").unwrap();
        let closed = manager.close_session(&opened.session_id).unwrap();

        assert_eq!(affected, vec![opened.session_id]);
        assert_eq!(closed.state, SessionState::Disconnected);
    }

    #[test]
    fn session_manager_reconnects_hot_unplugged_session() {
        let mut manager = SessionManager::new(MockSerialBackend::new(vec![mock_port(
            "/dev/ttyUSB0",
            "Adapter A",
        )]));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        manager.mark_port_removed("/dev/ttyUSB0").unwrap();
        let reconnected = manager
            .reconnect_session(&opened.session_id)
            .expect("session should reconnect");

        assert_eq!(reconnected.session_id, opened.session_id);
        assert_eq!(reconnected.state, SessionState::Connected);
        assert_eq!(
            manager.state(&reconnected.session_id).unwrap(),
            SessionState::Connected
        );
    }

    #[test]
    fn session_manager_polls_rx_with_sequence_timestamp_and_counter() {
        let mut manager = SessionManager::new(MockSerialBackend::with_rx(
            vec![mock_port("/dev/ttyUSB0", "Adapter A")],
            vec![vec![0x41, 0x42], vec![0x43]],
        ));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        let first = manager
            .poll_rx_once(&opened.session_id)
            .expect("rx poll should pass")
            .expect("first rx chunk should exist");
        let second = manager
            .poll_rx_once(&opened.session_id)
            .expect("rx poll should pass")
            .expect("second rx chunk should exist");

        assert_eq!(first.sequence, 1);
        assert_eq!(first.bytes, vec![0x41, 0x42]);
        assert!(first.timestamp_wall_ms > 0);
        assert_eq!(second.sequence, 2);
        assert_eq!(second.bytes, vec![0x43]);

        let batch = manager
            .drain_rx(&opened.session_id)
            .expect("rx drain should pass");
        assert_eq!(batch.rx_bytes, 3);
        assert_eq!(batch.chunks.len(), 2);
        assert_eq!(batch.batch_interval_ms, RX_BATCH_INTERVAL_MS);
    }

    #[test]
    fn session_manager_drains_rx_queue_without_resetting_counters() {
        let mut manager = SessionManager::new(MockSerialBackend::with_rx(
            vec![mock_port("/dev/ttyUSB0", "Adapter A")],
            vec![vec![0x10], vec![0x11]],
        ));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        poll_all_rx(&mut manager, &opened.session_id);
        let first_batch = manager.drain_rx(&opened.session_id).unwrap();
        let second_batch = manager.drain_rx(&opened.session_id).unwrap();

        assert_eq!(first_batch.rx_bytes, 2);
        assert_eq!(first_batch.queued_bytes, 0);
        assert_eq!(first_batch.chunks.len(), 2);
        assert_eq!(second_batch.rx_bytes, 2);
        assert!(second_batch.chunks.is_empty());
    }

    #[test]
    fn session_manager_bounds_rx_queue_when_renderer_falls_behind() {
        let scripted_rx = (0..10).map(|value| vec![value; 8]).collect();
        let mut manager = SessionManager::new(MockSerialBackend::with_rx(
            vec![mock_port("/dev/ttyUSB0", "Adapter A")],
            scripted_rx,
        ));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        manager
            .sessions
            .get_mut(&opened.session_id)
            .expect("session should exist")
            .rx_queue_capacity_bytes = 24;

        poll_all_rx(&mut manager, &opened.session_id);
        let batch = manager.drain_rx(&opened.session_id).unwrap();

        assert_eq!(batch.rx_bytes, 80);
        assert_eq!(batch.dropped_rx_bytes, 56);
        assert_eq!(batch.chunks.len(), 3);
        assert_eq!(batch.chunks[0].bytes, vec![7; 8]);
        assert_eq!(batch.chunks[2].bytes, vec![9; 8]);
    }

    #[test]
    fn session_manager_mock_gate_connect_receive_transmit_disconnect_and_reconnect() {
        let mut manager = SessionManager::new(MockSerialBackend::with_rx(
            vec![mock_port("/dev/ttyUSB0", "Adapter A")],
            vec![vec![0x52, 0x58]],
        ));
        let opened = manager
            .open_session(OpenSessionRequest {
                config: valid_config_input("/dev/ttyUSB0"),
            })
            .expect("session should open");

        poll_all_rx(&mut manager, &opened.session_id);
        let rx_batch = manager.drain_rx(&opened.session_id).unwrap();
        let tx = manager
            .write(WriteRequest {
                session_id: opened.session_id.clone(),
                bytes: vec![0x54, 0x58],
            })
            .expect("write should pass");
        manager.mark_port_removed("/dev/ttyUSB0").unwrap();
        let reconnected = manager
            .reconnect_session(&opened.session_id)
            .expect("session should reconnect");
        let closed = manager.close_session(&opened.session_id).unwrap();

        assert_eq!(rx_batch.rx_bytes, 2);
        assert_eq!(rx_batch.chunks[0].bytes, vec![0x52, 0x58]);
        assert_eq!(tx.tx_bytes, 2);
        assert_eq!(reconnected.state, SessionState::Connected);
        assert_eq!(closed.state, SessionState::Disconnected);
    }

    fn poll_all_rx<B: SerialBackend>(manager: &mut SessionManager<B>, session_id: &str) {
        while manager
            .poll_rx_once(session_id)
            .expect("rx poll should pass")
            .is_some()
        {}
    }

    fn mock_port(path: &str, display_name: &str) -> SerialPortSummary {
        SerialPortSummary {
            path: path.to_string(),
            display_name: display_name.to_string(),
            vid: Some(0x10c4),
            pid: Some(0xea60),
            serial_number: Some("abc".to_string()),
            manufacturer: Some("Silicon Labs".to_string()),
            product: Some(display_name.to_string()),
            port_type: "usb".to_string(),
        }
    }

    fn valid_config_input(port_path: &str) -> SerialConfigInput {
        SerialConfigInput {
            port_path: port_path.to_string(),
            baud_rate: 115200,
            data_bits: 8,
            parity: "none".to_string(),
            stop_bits: 1.0,
            flow_control: "none".to_string(),
        }
    }
}
