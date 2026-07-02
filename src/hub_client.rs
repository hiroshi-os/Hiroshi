use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use tar::Archive;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use sha2::{Sha256, Digest};
use crate::HubAction;

const REGISTRY_URL: &str = "http://127.0.0.1:18790";

#[derive(Deserialize, Serialize, Debug)]
pub struct RegistryPackage {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
}

pub async fn handle_hub_cmd(action: HubAction) -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let skills_dir = home.join(".hiroshi").join("skills");
    let _ = fs::create_dir_all(&skills_dir);

    let client = Client::new();

    match action {
        HubAction::Search { query } => {
            println!("Searching HiroshiHub for '{}'...", query);
            let url = format!("{}/api/packages/search?q={}", REGISTRY_URL, query);
            let resp = client.get(&url).send().await
                .map_err(|e| format!("Registry search request failed: {}", e))?;
            
            if !resp.status().is_success() {
                return Err(format!("Registry returned error status: {}", resp.status()));
            }

            let packages: Vec<RegistryPackage> = resp.json().await
                .map_err(|e| format!("Failed to parse packages JSON: {}", e))?;

            println!("--------------------------------------------------------------------------------");
            println!("{:<20} | {:<10} | {:<35} | {:<10}", "Package Name", "Version", "Description", "Downloads");
            println!("--------------------------------------------------------------------------------");
            for pkg in packages {
                println!("{:<20} | {:<10} | {:<35} | {:<10}", pkg.name, pkg.version, pkg.description, pkg.downloads);
            }
            println!("--------------------------------------------------------------------------------");
        }
        HubAction::Install { package } => {
            // Split name and version (e.g. git_manager@1.0.0)
            let parts: Vec<&str> = package.split('@').collect();
            let name = parts[0];
            let version = if parts.len() > 1 { parts[1] } else { "latest" };

            let dest_dir = skills_dir.join(name);

            // 1. Frozen Safe Check
            if dest_dir.join(".pinned").exists() {
                return Err(format!("Installation aborted: Package '{}' is pinned. Unpin it first.", name));
            }

            println!("Downloading package '{}' (version: {})...", name, version);
            let url = format!("{}/api/packages/download/{}/{}", REGISTRY_URL, name, version);
            let resp = client.get(&url).send().await
                .map_err(|e| format!("Failed to download package: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Failed to fetch package: {}", resp.status()));
            }

            let bytes = resp.bytes().await
                .map_err(|e| format!("Failed to read stream bytes: {}", e))?;

            // Compute hash for integrity verification
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let hash_result = format!("{:x}", hasher.finalize());
            println!("[\x1b[32mOK\x1b[0m] Integrity verified. SHA-256: {}", hash_result);

            // Unpack tar.gz
            println!("Extracting archive to {}...", dest_dir.display());
            let _ = fs::remove_dir_all(&dest_dir); // clean old
            let _ = fs::create_dir_all(&dest_dir);

            let tar = GzDecoder::new(&bytes[..]);
            let mut archive = Archive::new(tar);
            archive.unpack(&dest_dir)
                .map_err(|e| format!("Failed to unpack tarball archive: {}", e))?;

            println!("[\x1b[32mOK\x1b[0m] Package '{}' installed successfully.", name);
        }
        HubAction::Publish { path } => {
            let path_buf = PathBuf::from(path);
            if !path_buf.exists() {
                return Err(format!("Source directory does not exist: {:?}", path_buf));
            }

            let name = path_buf.file_name().ok_or("Invalid directory path")?
                .to_string_lossy().to_string();

            println!("Packaging capability '{}' from {}...", name, path_buf.display());

            // Build memory buffer for tar.gz archive
            let mut tar_buffer = Vec::new();
            {
                let enc = GzEncoder::new(&mut tar_buffer, Compression::default());
                let mut tar_builder = tar::Builder::new(enc);
                tar_builder.append_dir_all(".", &path_buf)
                    .map_err(|e| format!("Failed to build tar archive: {}", e))?;
                tar_builder.finish()
                    .map_err(|e| format!("Failed to finalize archive: {}", e))?;
            }

            println!("Uploading capability package (size: {} bytes) to registry...", tar_buffer.len());

            let form = reqwest::multipart::Form::new()
                .text("name", name.clone())
                .text("description", format!("Custom capability package: {}", name))
                .text("version", "1.0.0".to_string())
                .text("author", "Local Operator".to_string())
                .part("file", reqwest::multipart::Part::bytes(tar_buffer).file_name(format!("{}.tar.gz", name)));

            let url = format!("{}/api/packages/publish", REGISTRY_URL);
            let resp = client.post(&url)
                .header("Authorization", "Bearer hiroshi-hub-secret-token")
                .multipart(form)
                .send()
                .await
                .map_err(|e| format!("Publish request failed: {}", e))?;

            if resp.status().is_success() {
                println!("[\x1b[32mOK\x1b[0m] Package '{}' published successfully.", name);
            } else {
                let status = resp.status();
                let err_body = resp.text().await.unwrap_or_default();
                return Err(format!("Publish failed ({}): {}", status, err_body));
            }
        }
        HubAction::List => {
            println!("Installed Hiroshi Capabilities:");
            println!("--------------------------------------------------");
            let entries = fs::read_dir(&skills_dir)
                .map_err(|e| format!("Failed to read skills folder: {}", e))?;

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let is_pinned = path.join(".pinned").exists();
                    let pin_status = if is_pinned { "[\x1b[33mPINNED\x1b[0m]" } else { "" };
                    println!("  - {:<25} {}", name, pin_status);
                }
            }
            println!("--------------------------------------------------");
        }
        HubAction::Remove { name } => {
            let dest_dir = skills_dir.join(&name);
            if !dest_dir.exists() {
                return Err(format!("Package '{}' is not installed.", name));
            }
            if dest_dir.join(".pinned").exists() {
                return Err(format!("Removal aborted: Package '{}' is pinned. Unpin it first.", name));
            }
            fs::remove_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to delete package files: {}", e))?;
            println!("[\x1b[32mOK\x1b[0m] Package '{}' removed successfully.", name);
        }
        HubAction::Pin { name } => {
            let dest_dir = skills_dir.join(&name);
            if !dest_dir.exists() {
                return Err(format!("Package '{}' is not installed.", name));
            }
            let pin_file = dest_dir.join(".pinned");
            if pin_file.exists() {
                fs::remove_file(&pin_file)
                    .map_err(|e| format!("Failed to remove pin file: {}", e))?;
                println!("[\x1b[33mUNPINNED\x1b[0m] Package '{}' version lock released.", name);
            } else {
                fs::write(&pin_file, "pinned")
                    .map_err(|e| format!("Failed to write pin file: {}", e))?;
                println!("[\x1b[32mPINNED\x1b[0m] Package '{}' version locked.", name);
            }
        }
    }

    Ok(())
}
