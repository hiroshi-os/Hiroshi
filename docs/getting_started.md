# Getting Started with Hiroshi

Hiroshi is an ultra-lightweight, offline AI developer daemon running entirely on your local hardware.

## System Prerequisites
- **Rust Toolchain**: Install via rustup ([rustup.rs](https://rustup.rs/)).
- **Ollama**: Download and install ([ollama.com](https://ollama.com/)).

## 1. Local Engine Setup
Ensure that the local Ollama instance is active. Start by pulling a developer-focused coding model:
```bash
ollama pull qwen2.5-coder:1.5b
```

Verify that the local Ollama API server is running on port `11434`:
```bash
curl.exe -s http://127.0.0.1:11434/api/tags
```

## 2. Directory Layout
On the first run, Hiroshi generates the following local configuration layout in your user home directory:

```text
~/.hiroshi/
├── config.toml         # Port mappings, selected model, and gateway toggles
├── AGENTS.md           # Multi-agent prompt definitions and permissions
├── hiroshi.db          # SQLite conversation history with FTS5 search index
├── workspace/          # The secure sandboxed folder for code files
└── memory/             # Thread logs (daily logs and Master MEMORY.md)
```

## 3. Configuration (`config.toml`)
You can configure options in `~/.hiroshi/config.toml`:
```toml
[engine]
system_name = "Hiroshi"
log_level = "info"

[ollama]
host = "http://127.0.0.1:11434"
model = "qwen2.5-coder:1.5b"
temperature = 0.2
context_window = 4096

[security]
sandbox_path = "~/.hiroshi/workspace"
allow_shell_commands = false
```

## 4. Run the Daemon
Start the interactive terminal session inside the repository:
```powershell
cargo run
```

Type `/help` within the prompt to list all commands.
