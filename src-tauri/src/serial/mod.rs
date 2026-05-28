use serde::{Deserialize, Serialize};
use std::fmt;
use std::time::Duration;

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

#[derive(Debug, Default)]
pub struct RealSerialBackend;

impl SerialBackend for RealSerialBackend {
    fn list_ports(&self) -> Result<Vec<SerialPortSummary>, SerialError> {
        let ports = serialport::available_ports().map_err(|source| SerialError::ListPorts {
            message: source.to_string(),
        })?;

        Ok(ports.into_iter().map(SerialPortSummary::from).collect())
    }
}

#[cfg(test)]
#[derive(Debug, Clone)]
struct MockSerialBackend {
    ports: Vec<SerialPortSummary>,
}

#[cfg(test)]
impl MockSerialBackend {
    fn new(ports: Vec<SerialPortSummary>) -> Self {
        Self { ports }
    }
}

#[cfg(test)]
impl SerialBackend for MockSerialBackend {
    fn list_ports(&self) -> Result<Vec<SerialPortSummary>, SerialError> {
        Ok(self.ports.clone())
    }
}

#[derive(Debug)]
pub enum SerialError {
    ListPorts {
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
        (SessionState::Error, SessionEvent::RetryCancelled) => SessionState::Disconnected,
        (from, event) => {
            return Err(SerialError::InvalidTransition { from, event });
        }
    };

    Ok(next)
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
    fn session_state_rejects_invalid_transition() {
        let error = transition(
            SessionState::Disconnected,
            SessionEvent::DisconnectRequested,
        )
        .expect_err("disconnect from disconnected should fail");

        assert!(matches!(error, SerialError::InvalidTransition { .. }));
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
}
