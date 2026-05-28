use serialport::SerialPortInfo;
use std::collections::HashSet;
use std::env;
use std::error::Error;
use std::io;
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_TIMEOUT_SECS: u64 = 45;
const DEFAULT_CYCLES: usize = 1;
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const DETECTION_TARGET: Duration = Duration::from_secs(2);

#[test]
#[ignore = "requires physically unplugging and replugging a serial adapter"]
fn serial_hotplug_detects_remove_insert_without_duplicates() -> Result<(), Box<dyn Error>> {
    let target_port = env::var("MULTISERIAL_HOTPLUG_PORT")
        .map_err(|_| "set MULTISERIAL_HOTPLUG_PORT to the adapter path to cycle")?;
    let cycles = env_usize("MULTISERIAL_HOTPLUG_CYCLES", DEFAULT_CYCLES)?;
    let timeout = Duration::from_secs(env_usize(
        "MULTISERIAL_HOTPLUG_TIMEOUT_SECS",
        DEFAULT_TIMEOUT_SECS as usize,
    )? as u64);

    assert!(
        list_port_paths()?.contains(&target_port),
        "{target_port} must be present before starting the hotplug test"
    );

    for cycle in 1..=cycles {
        let mut failures = Vec::new();

        wait_for_interactive_start(cycle, "remove")?;
        println!("cycle={cycle} action=remove target={target_port}");
        let removal = wait_for_presence(&target_port, false, timeout)?;
        println!(
            "cycle={cycle} removed_detected_ms={}",
            removal.elapsed.as_millis()
        );
        if removal.elapsed > DETECTION_TARGET {
            failures.push(format!(
                "removal detection took {} ms, target is <= {} ms",
                removal.elapsed.as_millis(),
                DETECTION_TARGET.as_millis()
            ));
        }
        assert_no_duplicate_ports(&removal.ports)?;

        wait_for_interactive_start(cycle, "insert")?;
        println!("cycle={cycle} action=insert target={target_port}");
        let insertion = wait_for_presence(&target_port, true, timeout)?;
        println!(
            "cycle={cycle} inserted_detected_ms={}",
            insertion.elapsed.as_millis()
        );
        if insertion.elapsed > DETECTION_TARGET {
            failures.push(format!(
                "insert detection took {} ms, target is <= {} ms",
                insertion.elapsed.as_millis(),
                DETECTION_TARGET.as_millis()
            ));
        }
        assert_no_duplicate_ports(&insertion.ports)?;

        assert!(failures.is_empty(), "{}", failures.join("; "));
    }

    Ok(())
}

struct Detection {
    elapsed: Duration,
    ports: Vec<String>,
}

fn wait_for_presence(
    target_port: &str,
    expected_present: bool,
    timeout: Duration,
) -> Result<Detection, Box<dyn Error>> {
    let started = Instant::now();

    while started.elapsed() <= timeout {
        let ports = list_port_paths()?;
        let present = ports.contains(&target_port.to_string());

        if present == expected_present {
            return Ok(Detection {
                elapsed: started.elapsed(),
                ports,
            });
        }

        thread::sleep(POLL_INTERVAL);
    }

    Err(format!(
        "timed out after {} seconds waiting for {target_port} to be {}",
        timeout.as_secs(),
        if expected_present {
            "inserted"
        } else {
            "removed"
        }
    )
    .into())
}

fn assert_no_duplicate_ports(ports: &[String]) -> Result<(), Box<dyn Error>> {
    let unique: HashSet<&str> = ports.iter().map(String::as_str).collect();

    if unique.len() != ports.len() {
        return Err(format!("duplicate serial ports found: {ports:?}").into());
    }

    Ok(())
}

fn list_port_paths() -> Result<Vec<String>, Box<dyn Error>> {
    let mut ports = serialport::available_ports()?
        .into_iter()
        .map(port_path)
        .collect::<Vec<_>>();
    ports.sort();
    Ok(ports)
}

fn port_path(port: SerialPortInfo) -> String {
    port.port_name
}

fn env_usize(key: &str, default: usize) -> Result<usize, Box<dyn Error>> {
    match env::var(key) {
        Ok(value) => Ok(value.parse()?),
        Err(env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(Box::new(error)),
    }
}

fn wait_for_interactive_start(cycle: usize, action: &str) -> Result<(), Box<dyn Error>> {
    if env::var("MULTISERIAL_HOTPLUG_INTERACTIVE").as_deref() != Ok("1") {
        return Ok(());
    }

    println!("cycle={cycle} ready_for_{action}; press Enter to start timing");
    let mut line = String::new();
    io::stdin().read_line(&mut line)?;
    Ok(())
}
