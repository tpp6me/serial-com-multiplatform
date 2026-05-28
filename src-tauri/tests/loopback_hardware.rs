use sha2::{Digest, Sha256};
use std::env;
use std::error::Error;
use std::io::{ErrorKind, Read, Write};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_BAUD: u32 = 115_200;
const DEFAULT_BYTES: usize = 289;
const WRITE_CHUNK_BYTES: usize = 4096;

#[test]
#[ignore = "requires a physical serial loopback adapter"]
fn serial_loopback_round_trips_configured_payload() -> Result<(), Box<dyn Error>> {
    let port_path = env::var("MULTISERIAL_LOOPBACK_PORT")
        .map_err(|_| "set MULTISERIAL_LOOPBACK_PORT to a loopback serial device path")?;
    let baud_rate = env_usize("MULTISERIAL_LOOPBACK_BAUD", DEFAULT_BAUD as usize)? as u32;
    let byte_count = env_usize("MULTISERIAL_LOOPBACK_BYTES", DEFAULT_BYTES)?;
    let timeout = Duration::from_secs(env_usize("MULTISERIAL_LOOPBACK_TIMEOUT_SECS", 180)? as u64);
    let payload = deterministic_payload(byte_count);
    let expected_sha256 = sha256_hex(&payload);
    let mut writer = serialport::new(&port_path, baud_rate)
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
        .timeout(Duration::from_millis(20))
        .open()?;
    let mut reader = writer.try_clone()?;
    writer.clear(serialport::ClearBuffer::All)?;

    let read_target = payload.len();
    let reader_thread = thread::spawn(move || {
        let mut received = Vec::with_capacity(read_target);
        let mut buffer = vec![0; 65_536];
        let started = Instant::now();

        while received.len() < read_target && started.elapsed() < timeout {
            match reader.read(&mut buffer) {
                Ok(0) => {}
                Ok(bytes_read) => {
                    let remaining = read_target - received.len();
                    received.extend_from_slice(&buffer[..bytes_read.min(remaining)]);
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        ErrorKind::TimedOut | ErrorKind::WouldBlock | ErrorKind::Interrupted
                    ) => {}
                Err(error) => return Err(error),
            }
        }

        Ok(received)
    });

    let mut written = 0;
    while written < payload.len() {
        match writer.write(&payload[written..payload.len().min(written + WRITE_CHUNK_BYTES)]) {
            Ok(0) => thread::sleep(Duration::from_millis(1)),
            Ok(bytes_written) => written += bytes_written,
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::TimedOut | ErrorKind::WouldBlock | ErrorKind::Interrupted
                ) =>
            {
                thread::sleep(Duration::from_millis(1));
            }
            Err(error) => return Err(Box::new(error)),
        }
    }

    writer.flush()?;
    let received = reader_thread
        .join()
        .map_err(|_| "loopback reader thread panicked")??;
    let received_sha256 = sha256_hex(&received);

    println!("port={port_path}");
    println!("baud={baud_rate}");
    println!("written={written}");
    println!("received={}", received.len());
    println!("expected_sha256={expected_sha256}");
    println!("received_sha256={received_sha256}");

    assert_eq!(written, payload.len());
    assert_eq!(received.len(), payload.len());
    assert_eq!(received_sha256, expected_sha256);

    Ok(())
}

fn env_usize(key: &str, default: usize) -> Result<usize, Box<dyn Error>> {
    match env::var(key) {
        Ok(value) => Ok(value.parse()?),
        Err(env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(Box::new(error)),
    }
}

fn deterministic_payload(byte_count: usize) -> Vec<u8> {
    if byte_count == DEFAULT_BYTES {
        let mut payload: Vec<u8> = (0..=255).map(|byte| byte as u8).collect();
        payload.extend_from_slice(b"MultiSerial loopback 115200 8N1\r\n");
        return payload;
    }

    (0..byte_count)
        .map(|index| ((index.wrapping_mul(31).wrapping_add(7)) & 0xff) as u8)
        .collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
