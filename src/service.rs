use std::process::Command;
use std::env;
#[allow(unused_imports)]
use std::fs;
use crate::ServiceAction;

pub fn handle_service_cmd(action: ServiceAction) -> Result<(), String> {
    let exe_path = env::current_exe()
        .map_err(|e| format!("Failed to resolve current executable path: {}", e))?;
    let exe_str = exe_path.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        match action {
            ServiceAction::Install => {
                println!("Registering Hiroshi as a Windows Service...");
                println!("Note: This command must be run as Administrator.");
                
                // Construct sc create command
                let output = Command::new("sc.exe")
                    .args(&[
                        "create",
                        "Hiroshi",
                        &format!("binPath= \"{}\" daemon", exe_str),
                        "start=",
                        "auto",
                        "DisplayName=",
                        "Hiroshi Agent Kernel Daemon"
                    ])
                    .output();
                
                match output {
                    Ok(out) if out.status.success() => {
                        println!("Successfully installed Hiroshi Service.");
                        println!("Run `hiroshi service start` to boot.");
                    }
                    Ok(out) => {
                        let err_msg = String::from_utf8_lossy(&out.stderr).to_string();
                        let out_msg = String::from_utf8_lossy(&out.stdout).to_string();
                        return Err(format!("Installation failed (sc.exe exit status check).\nStderr: {}\nStdout: {}", err_msg, out_msg));
                    }
                    Err(e) => {
                        return Err(format!("Failed to execute sc.exe installer: {}", e));
                    }
                }
            }
            ServiceAction::Uninstall => {
                println!("Removing Hiroshi Windows Service...");
                let output = Command::new("sc.exe")
                    .args(&["delete", "Hiroshi"])
                    .output();
                
                match output {
                    Ok(out) if out.status.success() => {
                        println!("Successfully uninstalled Hiroshi Service.");
                    }
                    Ok(out) => {
                        let err_msg = String::from_utf8_lossy(&out.stderr).to_string();
                        return Err(format!("Uninstall failed: {}", err_msg));
                    }
                    Err(e) => return Err(format!("Failed to run sc.exe: {}", e)),
                }
            }
            ServiceAction::Start => {
                println!("Starting Hiroshi Windows Service...");
                let output = Command::new("net")
                    .args(&["start", "Hiroshi"])
                    .output();
                match output {
                    Ok(out) if out.status.success() => println!("Hiroshi Service started successfully."),
                    Ok(out) => return Err(format!("Failed to start service: {}", String::from_utf8_lossy(&out.stderr))),
                    Err(e) => return Err(e.to_string()),
                }
            }
            ServiceAction::Stop => {
                println!("Stopping Hiroshi Windows Service...");
                let output = Command::new("net")
                    .args(&["stop", "Hiroshi"])
                    .output();
                match output {
                    Ok(out) if out.status.success() => println!("Hiroshi Service stopped successfully."),
                    Ok(out) => return Err(format!("Failed to stop service: {}", String::from_utf8_lossy(&out.stderr))),
                    Err(e) => return Err(e.to_string()),
                }
            }
            ServiceAction::Status => {
                let output = Command::new("sc.exe")
                    .args(&["query", "Hiroshi"])
                    .output();
                match output {
                    Ok(out) => {
                        println!("{}", String::from_utf8_lossy(&out.stdout));
                    }
                    Err(e) => return Err(e.to_string()),
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let service_file_path = "/etc/systemd/system/hiroshi.service";
        match action {
            ServiceAction::Install => {
                println!("Creating systemd service definition...");
                let service_content = format!(
                    "[Unit]\n\
                     Description=Hiroshi Agent Gateway Daemon\n\
                     After=network.target\n\n\
                     [Service]\n\
                     Type=simple\n\
                     ExecStart=\"{}\" daemon\n\
                     Restart=on-failure\n\
                     User=root\n\n\
                     [Install]\n\
                     WantedBy=multi-user.target\n",
                    exe_str
                );
                
                fs::write(service_file_path, service_content)
                    .map_err(|e| format!("Failed to write service file (requires root/sudo privileges): {}", e))?;
                
                // reload systemd
                let _ = Command::new("systemctl").arg("daemon-reload").status();
                let _ = Command::new("systemctl").args(&["enable", "hiroshi"]).status();
                
                println!("Hiroshi systemd service installed successfully.");
                println!("Run `sudo systemctl start hiroshi` to boot.");
            }
            ServiceAction::Uninstall => {
                println!("Stopping and removing systemd service...");
                let _ = Command::new("systemctl").args(&["stop", "hiroshi"]).status();
                let _ = Command::new("systemctl").args(&["disable", "hiroshi"]).status();
                if std::path::Path::new(service_file_path).exists() {
                    fs::remove_file(service_file_path)
                        .map_err(|e| format!("Failed to delete service definition: {}", e))?;
                }
                let _ = Command::new("systemctl").arg("daemon-reload").status();
                println!("Hiroshi systemd service uninstalled successfully.");
            }
            ServiceAction::Start => {
                let status = Command::new("systemctl").args(&["start", "hiroshi"]).status()
                    .map_err(|e| e.to_string())?;
                if status.success() {
                    println!("Hiroshi service started.");
                } else {
                    return Err("Failed to start hiroshi systemd service.".to_string());
                }
            }
            ServiceAction::Stop => {
                let status = Command::new("systemctl").args(&["stop", "hiroshi"]).status()
                    .map_err(|e| e.to_string())?;
                if status.success() {
                    println!("Hiroshi service stopped.");
                } else {
                    return Err("Failed to stop hiroshi systemd service.".to_string());
                }
            }
            ServiceAction::Status => {
                let output = Command::new("systemctl").args(&["status", "hiroshi"]).output()
                    .map_err(|e| e.to_string())?;
                println!("{}", String::from_utf8_lossy(&output.stdout));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir().ok_or("Could not determine home directory")?;
        let plist_dir = home.join("Library/LaunchAgents");
        let plist_path = plist_dir.join("com.hiroshi.daemon.plist");
        
        match action {
            ServiceAction::Install => {
                println!("Creating macOS LaunchAgent configuration...");
                let plist_content = format!(
                    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
                     <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
                     <plist version=\"1.0\">\n\
                     <dict>\n\
                     \t<key>Label</key>\n\
                     \t<string>com.hiroshi.daemon</string>\n\
                     \t<key>ProgramArguments</key>\n\
                     \t<array>\n\
                     \t\t<string>{}</string>\n\
                     \t\t<string>daemon</string>\n\
                     \t</array>\n\
                     \t<key>RunAtLoad</key>\n\
                     \t<true/>\n\
                     \t<key>KeepAlive</key>\n\
                     \t<true/>\n\
                     </dict>\n\
                     </plist>\n",
                    exe_str
                );
                
                fs::create_dir_all(&plist_dir).map_err(|e| e.to_string())?;
                fs::write(&plist_path, plist_content).map_err(|e| e.to_string())?;
                
                // load the Agent
                let _ = Command::new("launchctl")
                    .args(&["load", plist_path.to_str().unwrap()])
                    .status();
                
                println!("Hiroshi macOS launchd agent installed successfully.");
            }
            ServiceAction::Uninstall => {
                println!("Unloading and deleting launchd agent...");
                let _ = Command::new("launchctl")
                    .args(&["unload", plist_path.to_str().unwrap()])
                    .status();
                if plist_path.exists() {
                    let _ = fs::remove_file(&plist_path);
                }
                println!("Hiroshi macOS launchd agent uninstalled successfully.");
            }
            ServiceAction::Start => {
                let status = Command::new("launchctl")
                    .args(&["start", "com.hiroshi.daemon"])
                    .status()
                    .map_err(|e| e.to_string())?;
                if status.success() {
                    println!("Launchd agent started.");
                } else {
                    return Err("Failed to start launchd agent.".to_string());
                }
            }
            ServiceAction::Stop => {
                let status = Command::new("launchctl")
                    .args(&["stop", "com.hiroshi.daemon"])
                    .status()
                    .map_err(|e| e.to_string())?;
                if status.success() {
                    println!("Launchd agent stopped.");
                } else {
                    return Err("Failed to stop launchd agent.".to_string());
                }
            }
            ServiceAction::Status => {
                let output = Command::new("launchctl")
                    .args(&["list"])
                    .output()
                    .map_err(|e| e.to_string())?;
                let list_str = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = list_str.lines().find(|l| l.contains("com.hiroshi.daemon")) {
                    println!("{}", line);
                } else {
                    println!("com.hiroshi.daemon is not registered or running under launchd.");
                }
            }
        }
    }

    Ok(())
}
