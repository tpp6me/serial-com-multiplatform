use std::process::Command;

fn main() {
    if let Ok(target) = std::env::var("TARGET") {
        println!("cargo:rustc-env=BUILD_TARGET={target}");
    }

    if let Ok(profile) = std::env::var("PROFILE") {
        println!("cargo:rustc-env=BUILD_PROFILE={profile}");
    }

    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
    {
        if output.status.success() {
            let hash = String::from_utf8_lossy(&output.stdout);
            println!("cargo:rustc-env=GIT_COMMIT={}", hash.trim());
        }
    }

    tauri_build::build();
}
