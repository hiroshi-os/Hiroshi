# Hiroshi Unattended Daemonization Guide

This guide walks through configuring the compiled `Hiroshi` daemon to run unattended in the background as a persistent system service.

---

## 1. Running as a Windows Service (NSSM)

To run Hiroshi silently on startup without needing an active interactive terminal, we recommend using **NSSM (Non-Sucking Service Manager)**.

### Step 1: Download NSSM
- Download the latest release of NSSM from [nssm.cc](https://nssm.cc/).
- Extract `nssm.exe` (specifically the version matching your OS architecture, e.g., `win64/nssm.exe`) to a directory on your system path.

### Step 2: Install the Service
Run the following command in an Administrator PowerShell window to open the service configuration interface:
```powershell
nssm install Hiroshi
```

### Step 3: Configure Service Parameters
In the NSSM configuration dialog, set:
- **Application Path**: Select your compiled `Hiroshi.exe` release binary (e.g. `E:\Hiroshi\target\release\Hiroshi.exe`).
- **Startup Directory**: The workspace sandbox path (e.g. `C:\Users\<username>\.hiroshi\workspace`).
- **Environment Variables** (Optional): Add any required environment paths or Ollama server variables.

Click **Install Service**.

### Step 4: Manage the Service
Use native Windows service controls to start or stop Hiroshi:
```powershell
# Start the service
Start-Service Hiroshi

# Stop the service
Stop-Service Hiroshi

# Set startup type to Automatic
Set-Service Hiroshi -StartupType Automatic
```

---

## 2. Running as a Linux systemd Service

If deploying on a Linux machine, systemd is the standard tool to run Hiroshi unattended.

### Step 1: Create a Service File
Create a new file `/etc/systemd/system/hiroshi.service`:
```ini
[Unit]
Description=Hiroshi Autonomous Developer Daemon
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/home/yourusername/.hiroshi/workspace
ExecStart=/home/yourusername/Hiroshi/target/release/Hiroshi
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### Step 2: Enable & Start the Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable hiroshi
sudo systemctl start hiroshi
```

### Step 3: View System Logs
```bash
journalctl -u hiroshi -f
```
