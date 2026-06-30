use std::process::Command;

/// Attempts to execute `tailscale ip -4` to dynamically resolve the local Tailnet IPv4 address.
#[allow(dead_code)]
pub fn resolve_tailscale_ip() -> Result<String, String> {
    let output = Command::new("tailscale")
        .args(&["ip", "-4"])
        .output();
    
    match output {
        Ok(out) if out.status.success() => {
            let ip = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if ip.is_empty() {
                Err("Tailscale returned an empty IP address.".to_string())
            } else {
                Ok(ip)
            }
        }
        Ok(out) => {
            let err_msg = String::from_utf8_lossy(&out.stderr).to_string();
            Err(format!("Tailscale execution failed (status non-zero): {}", err_msg))
        }
        Err(e) => {
            Err(format!("Could not execute Tailscale CLI tool: {}", e))
        }
    }
}
