use std::net::TcpStream;
use std::time::Duration;
use std::fs;
use std::path::Path;
use rusqlite::Connection;
use crate::config::AppConfig;

pub async fn run_diagnostics(
    config: &AppConfig,
    db_path: &Path,
    workspace_path: &Path,
) -> Result<(), String> {
    println!("==================================================");
    println!("          HIROSHI SYSTEM DIAGNOSTICS            ");
    println!("==================================================");

    let mut all_passed = true;

    // 1. Ollama Connectivity Check
    print!("Checking Ollama Connectivity... ");
    let ollama_host = &config.ollama.host;
    // Strip http:// or https:// to parse addr
    let clean_host = ollama_host
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    
    match TcpStream::connect_timeout(
        &clean_host.parse().unwrap_or("127.0.0.1:11434".parse().unwrap()),
        Duration::from_secs(2),
    ) {
        Ok(_) => {
            println!("[\x1b[32mOK\x1b[0m] Connected to Ollama at {}", ollama_host);
        }
        Err(e) => {
            println!("[\x1b[31mFAIL\x1b[0m] Could not connect to Ollama at {}: {}", ollama_host, e);
            all_passed = false;
        }
    };

    // 2. Workspace Permissions Check
    print!("Checking Workspace Permissions... ");
    let test_file = workspace_path.join(".doctor_permission_test");
    match fs::write(&test_file, "permission_test") {
        Ok(_) => {
            let read_ok = fs::read_to_string(&test_file);
            let _ = fs::remove_file(&test_file);
            match read_ok {
                Ok(content) if content == "permission_test" => {
                    println!("[\x1b[32mOK\x1b[0m] Read/Write tests passed.");
                }
                _ => {
                    println!("[\x1b[31mFAIL\x1b[0m] Write succeeded but read failed.");
                    all_passed = false;
                }
            }
        }
        Err(e) => {
            println!("[\x1b[31mFAIL\x1b[0m] Write failed: {}", e);
            all_passed = false;
        }
    };

    // 3. SQLite Database Integrity Scan
    print!("Checking SQLite DB Integrity... ");
    match Connection::open(db_path) {
        Ok(conn) => {
            let mut stmt = conn.prepare("PRAGMA integrity_check").map_err(|e| e.to_string())?;
            let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
            let mut integrity_status = String::new();
            if let Some(row) = rows.next().map_err(|e| e.to_string())? {
                integrity_status = row.get::<_, String>(0).unwrap_or_default();
            }
            if integrity_status == "ok" {
                println!("[\x1b[32mOK\x1b[0m] Integrity check passed.");
            } else {
                println!("[\x1b[31mFAIL\x1b[0m] SQLite integrity report: {}", integrity_status);
                all_passed = false;
            }
        }
        Err(e) => {
            println!("[\x1b[31mFAIL\x1b[0m] Failed to open database: {}", e);
            all_passed = false;
        }
    };

    // 4. Environment Config Check
    println!("\nConfigured Components:");
    println!("  - Target Model:      {}", config.ollama.model);
    println!("  - Embedding Model:   {}", config.ollama.embedding_model);
    println!("  - Log Level:         {}", config.engine.log_level);
    println!("  - Workspace Path:    {}", workspace_path.display());
    println!("  - Database Path:     {}", db_path.display());
    println!("  - Tailscale Overlay: {}", if config.tailscale.enabled { "\x1b[32mEnabled\x1b[0m" } else { "Disabled" });

    println!("==================================================");
    if all_passed {
        println!("          \x1b[32mALL DIAGNOSTIC CHECKS PASSED\x1b[0m          ");
        Ok(())
    } else {
        println!("        \x1b[31mSOME DIAGNOSTIC CHECKS FAILED\x1b[0m          ");
        Err("Diagnostics check failed".to_string())
    }
}
