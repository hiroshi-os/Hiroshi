use std::fs;


pub fn migrate_configs(source: &str) -> Result<(), String> {
    println!("==================================================");
    println!("          HIROSHI SYSTEM CONFIG MIGRATOR          ");
    println!("==================================================");
    println!("Source Platform: {}", source);

    let home = dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?;
    let hiroshi_dir = home.join(".hiroshi");
    let hiroshi_agents_path = hiroshi_dir.join("AGENTS.md");

    let source_dir = if source.to_lowercase() == "openclaw" {
        home.join(".openclaw")
    } else {
        home.join(".zeroclaw")
    };

    println!("Scanning path: {}", source_dir.display());

    if !source_dir.exists() {
        println!("[\x1b[33mWARN\x1b[0m] No existing configuration found at {}.", source_dir.display());
        println!("Creating a sample template migration structure for verification...");
        if let Err(e) = fs::create_dir_all(&source_dir) {
            return Err(format!("Failed to create dummy source folder: {}", e));
        }
        let dummy_soul = if source.to_lowercase() == "openclaw" {
            "# OpenClaw Soul Card\n\n## Developer\n- Persona: Systems Coder\n- Instructions: Write highly structured, zero-trust Rust libraries."
        } else {
            "# ZeroClaw Identity\n\n## Developer\n- Persona: Systems Coder\n- Instructions: Optimize for extreme performance and memory safety."
        };
        let _ = fs::write(source_dir.join("SOUL.md"), dummy_soul);
        let _ = fs::write(source_dir.join("IDENTITY.md"), dummy_soul);
    }

    // Attempt migration of SOUL.md / IDENTITY.md
    let soul_path = source_dir.join("SOUL.md");
    let identity_path = source_dir.join("IDENTITY.md");

    let mut rules = String::new();
    if soul_path.exists() {
        rules = fs::read_to_string(&soul_path).unwrap_or_default();
    } else if identity_path.exists() {
        rules = fs::read_to_string(&identity_path).unwrap_or_default();
    }

    if !rules.is_empty() {
        println!("[\x1b[32mOK\x1b[0m] Discovered identity profiles. Remapping to AGENTS.md...");
        
        // Let's structure the remapped AGENTS.md
        let remapped_agents = format!(
            "# Hiroshi Agents Directory (Migrated from {})\n\n\
             ## Architect\n\
             - Prompt: \"You are Hiroshi's Lead Architect. Deconstruct user tasks into discrete system designs.\"\n\
             - Allowed Tools: [ReadFile, WriteFile, web_search]\n\
             - Hand-off: \"If execution code needs to be written, yield control to Developer using [HANDOFF: Developer].\"\n\n\
             ## Developer\n\
             - Prompt: \"You are Hiroshi's Systems Programmer. Write clean, idiomatic code based on these rules: {}\"\n\
             - Allowed Tools: [WriteFile, cargo_check, web_search, create_skill]\n\
             - Hand-off: \"Yield back to Architect upon task completion using [HANDOFF: Architect].\"\n",
            source,
            rules.replace("\n", " ").replace("\"", "'")
        );

        fs::write(&hiroshi_agents_path, remapped_agents)
            .map_err(|e| format!("Failed to write migrated AGENTS.md: {}", e))?;
        println!("[\x1b[32mOK\x1b[0m] Successfully updated AGENTS.md at {}", hiroshi_agents_path.display());
    } else {
        println!("[\x1b[33mWARN\x1b[0m] No IDENTITY.md or SOUL.md profiles found to migrate.");
    }

    // Migrate workspace files if present
    let src_workspace = source_dir.join("workspace");
    let dest_workspace = hiroshi_dir.join("workspace");
    if src_workspace.exists() {
        println!("[\x1b[32mOK\x1b[0m] Discovered workspace files. Syncing contents...");
        let _ = fs::create_dir_all(&dest_workspace);
        if let Ok(entries) = fs::read_dir(&src_workspace) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name() {
                        let _ = fs::copy(&path, dest_workspace.join(name));
                    }
                }
            }
        }
    }

    println!("==================================================");
    println!("        MIGRATION PROCESS COMPLETED               ");
    println!("==================================================");
    Ok(())
}
