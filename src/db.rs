use rusqlite::{params, Connection};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use chrono::Local;
use crate::providers::ModelProvider;

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub images: Option<Vec<String>>,
}

use std::sync::atomic::{AtomicBool, Ordering};

pub struct MemoryEngine {
    conn: Mutex<Connection>,
    read_only: AtomicBool,
    transient_history: Mutex<std::collections::HashMap<String, Vec<ChatMessage>>>,
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    for i in 0..a.len() {
        dot_product += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

impl MemoryEngine {
    pub fn new(db_path: &Path) -> Result<Self, String> {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open SQLite database: {}", e))?;
            
        // Enable WAL mode and synchronous normal
        conn.pragma_update(None, "journal_mode", &"WAL")
            .map_err(|e| format!("Failed to set WAL mode: {}", e))?;
        conn.pragma_update(None, "synchronous", &"NORMAL")
            .map_err(|e| format!("Failed to set synchronous mode: {}", e))?;
            
        // Standard chat history
        conn.execute(
            "CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT NOT NULL DEFAULT 'global',
                role TEXT NOT NULL,
                content TEXT NOT NULL
              )",
            [],
        ).map_err(|e| format!("Failed to create history table: {}", e))?;

        // Migration: Add session_id column if it doesn't exist
        let _ = conn.execute("ALTER TABLE history ADD COLUMN session_id TEXT NOT NULL DEFAULT 'global'", []);
        
        // FTS5 Virtual Table for semantic keyword search
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
                role,
                content
              )",
            [],
        ).map_err(|e| format!("Failed to create history_fts virtual table: {}", e))?;
        
        // Vector RAG table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS history_vectors (
                message_id INTEGER PRIMARY KEY,
                vector BLOB NOT NULL,
                FOREIGN KEY(message_id) REFERENCES history(id) ON DELETE CASCADE
              )",
            [],
        ).map_err(|e| format!("Failed to create history_vectors table: {}", e))?;
        
        Ok(Self {
            conn: Mutex::new(conn),
            read_only: AtomicBool::new(false),
            transient_history: Mutex::new(std::collections::HashMap::new()),
        })
    }

    pub fn set_read_only(&self, read_only: bool) {
        self.read_only.store(read_only, Ordering::SeqCst);
    }

    pub fn is_read_only(&self) -> bool {
        self.read_only.load(Ordering::SeqCst)
    }

    pub fn add_message(&self, session_id: &str, role: &str, content: &str) -> Result<i64, String> {
        if self.is_read_only() {
            let mut transient = self.transient_history.lock().map_err(|e| format!("Transient lock poison error: {}", e))?;
            let list = transient.entry(session_id.to_string()).or_insert_with(Vec::new);
            list.push(ChatMessage {
                role: role.to_string(),
                content: content.to_string(),
                images: None,
            });
            return Ok(0);
        }

        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;
        
        conn.execute(
            "INSERT INTO history (session_id, role, content) VALUES (?1, ?2, ?3)",
            params![session_id, role, content],
        ).map_err(|e| format!("Failed to insert chat history: {}", e))?;
        
        let id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO history_fts (rowid, role, content) VALUES (?1, ?2, ?3)",
            params![id, role, content],
        ).map_err(|e| format!("Failed to index in FTS5: {}", e))?;
        
        Ok(id)
    }

    pub async fn add_message_with_vector(&self, session_id: &str, role: &str, content: &str, provider: &dyn ModelProvider) -> Result<(), String> {
        let id = self.add_message(session_id, role, content)?;
        
        if self.is_read_only() {
            return Ok(());
        }

        // Generate embeddings asynchronously
        if let Ok(vector) = provider.get_embeddings(content).await {
            if let Ok(blob) = serde_json::to_vec(&vector) {
                let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO history_vectors (message_id, vector) VALUES (?1, ?2)",
                    params![id, blob],
                );
            }
        }
        Ok(())
    }

    pub fn get_context(&self, session_id: &str, context_limit_chars: usize) -> Result<Vec<ChatMessage>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;
        
        let mut stmt = conn.prepare(
            "SELECT role, content FROM history WHERE session_id = ?1 ORDER BY id DESC"
        ).map_err(|e| format!("Failed to prepare history query: {}", e))?;
        
        let rows = stmt.query_map(params![session_id], |row| {
            Ok(ChatMessage {
                role: row.get(0)?,
                content: row.get(1)?,
                images: None,
            })
        }).map_err(|e| format!("Failed to execute history query: {}", e))?;
        
        let mut messages = Vec::new();
        let mut total_chars = 0;
        
        for row in rows {
            if let Ok(msg) = row {
                let msg_len = msg.content.len();
                if total_chars + msg_len > context_limit_chars {
                    break;
                }
                total_chars += msg_len;
                messages.push(msg);
            }
        }
        
        messages.reverse();

        if self.is_read_only() {
            if let Ok(transient) = self.transient_history.lock() {
                if let Some(transient_msgs) = transient.get(session_id) {
                    for msg in transient_msgs {
                        messages.push(msg.clone());
                    }
                }
            }
        }

        Ok(messages)
    }

    pub fn search_rag_history(&self, session_id: &str, query: &str, limit: usize) -> Result<Vec<ChatMessage>, String> {
        let clean_query = query.replace('"', "").replace('\'', "").replace('*', "");
        if clean_query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT h.role, h.content FROM history h JOIN history_fts f ON h.id = f.rowid WHERE h.session_id = ?1 AND f.content MATCH ?2 LIMIT ?3"
        ).map_err(|e| format!("Failed to prepare RAG search query: {}", e))?;

        let rows = stmt.query_map(params![session_id, clean_query, limit], |row| {
            Ok(ChatMessage {
                role: row.get(0)?,
                content: row.get(1)?,
                images: None,
            })
        }).map_err(|e| format!("Failed to execute RAG search: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            if let Ok(msg) = row {
                results.push(msg);
            }
        }
        Ok(results)
    }

    pub fn search_vector_rag(&self, session_id: &str, query_vector: &[f32], limit: usize) -> Result<Vec<ChatMessage>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT v.vector, h.role, h.content FROM history_vectors v JOIN history h ON v.message_id = h.id WHERE h.session_id = ?1"
        ).map_err(|e| format!("Failed to prepare vector search query: {}", e))?;

        struct VectorRow {
            vector_blob: Vec<u8>,
            role: String,
            content: String,
        }

        let rows = stmt.query_map(params![session_id], |row| {
            Ok(VectorRow {
                vector_blob: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
            })
        }).map_err(|e| format!("Failed to execute vector search: {}", e))?;

        let mut scored_matches = Vec::new();
        for row in rows {
            if let Ok(r) = row {
                if let Ok(vec) = serde_json::from_slice::<Vec<f32>>(&r.vector_blob) {
                    let score = cosine_similarity(query_vector, &vec);
                    scored_matches.push((score, ChatMessage {
                        role: r.role,
                        content: r.content,
                        images: None,
                    }));
                }
            }
        }

        // Sort by similarity descending
        scored_matches.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        
        let results: Vec<ChatMessage> = scored_matches.into_iter()
            .take(limit)
            .map(|(_, msg)| msg)
            .collect();

        Ok(results)
    }

    pub fn export_daily_log(&self, session_id: &str, memory_dir: &Path) -> Result<(), String> {
        let date_str = Local::now().format("%Y-%m-%d").to_string();
        let log_file_path = memory_dir.join(format!("{}.md", date_str));

        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT timestamp, role, content FROM history WHERE session_id = ?1 AND date(timestamp) = date('now') ORDER BY id ASC"
        ).map_err(|e| format!("Failed to prepare daily query: {}", e))?;

        let rows = stmt.query_map(params![session_id], |row| {
            let timestamp: String = row.get(0)?;
            let role: String = row.get(1)?;
            let content: String = row.get(2)?;
            Ok(format!("### [{}] {}\n{}\n", timestamp, role, content))
        }).map_err(|e| format!("Failed to execute daily query: {}", e))?;

        let mut log_content = format!("# Hiroshi Log - {}\n\n", date_str);
        for row in rows {
            if let Ok(line) = row {
                log_content.push_str(&line);
                log_content.push('\n');
            }
        }

        fs::write(&log_file_path, log_content)
            .map_err(|e| format!("Failed to export daily markdown thread: {}", e))?;

        Ok(())
    }

    pub async fn compact_memory(&self, session_id: &str, memory_dir: &Path, provider: &dyn ModelProvider) -> Result<(), String> {
        let history = self.get_context(session_id, 8000)?;
        if history.is_empty() {
            return Ok(());
        }

        let mut history_text = String::new();
        for msg in &history {
            history_text.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }

        let prompt = format!(
            "Analyze this interaction history and summarize the key architectural rules, configurations, code styles, and guidelines discovered or agreed upon. Keep it concise:\n\n{}",
            history_text
        );

        let system_prompt = "You are Hiroshi Memory Compactor. Extract and write bullet-point summaries of project details, configurations, and decisions.";

        let mut stream = provider.chat_stream(system_prompt, vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
            images: None,
        }], None).await?;

        use futures_util::StreamExt;
        let mut summary = String::new();
        while let Some(chunk_res) = stream.next().await {
            if let Ok(text) = chunk_res {
                summary.push_str(&text);
            }
        }

        if summary.trim().is_empty() {
            return Ok(());
        }

        let memory_file_path = memory_dir.join("MEMORY.md");
        let date_str = Local::now().format("%Y-%m-%d").to_string();
        
        let mut existing_content = if memory_file_path.exists() {
            fs::read_to_string(&memory_file_path).unwrap_or_default()
        } else {
            "# Hiroshi Master Memory\n\n".to_string()
        };

        existing_content.push_str(&format!("\n## Updated on {}\n{}\n", date_str, summary));

        fs::write(&memory_file_path, existing_content)
            .map_err(|e| format!("Failed to write master memory file: {}", e))?;

        Ok(())
    }

    pub fn clear_history(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;
        conn.execute("DELETE FROM history", [])
            .map_err(|e| format!("Failed to clear history: {}", e))?;
        conn.execute("DELETE FROM history_fts", [])
            .map_err(|e| format!("Failed to clear history index: {}", e))?;
        conn.execute("DELETE FROM history_vectors", [])
            .map_err(|e| format!("Failed to clear history vectors: {}", e))?;
        Ok(())
    }

    pub fn vacuum(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;
        conn.execute("VACUUM", [])
            .map_err(|e| format!("Failed to vacuum database: {}", e))?;
        Ok(())
    }

    pub fn backup(&self, backup_dir: &Path) -> Result<(), String> {
        if !backup_dir.exists() {
            fs::create_dir_all(backup_dir)
                .map_err(|e| format!("Failed to create backup directory: {}", e))?;
        }
        let date_str = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
        let backup_path = backup_dir.join(format!("hiroshi_backup_{}.db", date_str));
        let conn = self.conn.lock().map_err(|e| format!("Lock poison error: {}", e))?;
        conn.execute("VACUUM INTO ?1", params![backup_path.to_string_lossy()])
            .map_err(|e| format!("Failed to backup database: {}", e))?;
        Ok(())
    }

    pub fn get_last_session_id(&self, channel_name: &str) -> Option<String> {
        let conn = match self.conn.lock() {
            Ok(c) => c,
            Err(_) => return None,
        };
        let mut stmt = match conn.prepare(
            "SELECT session_id FROM history WHERE session_id LIKE ?1 ORDER BY id DESC LIMIT 1"
        ) {
            Ok(s) => s,
            Err(_) => return None,
        };
        let pattern = format!("{}:%", channel_name);
        let mut rows = match stmt.query_map(params![pattern], |row| {
            let session_id: String = row.get(0)?;
            if let Some(pos) = session_id.find(':') {
                Ok(session_id[pos + 1..].to_string())
            } else {
                Ok(session_id)
            }
        }) {
            Ok(r) => r,
            Err(_) => return None,
        };
        if let Some(Ok(session_id)) = rows.next() {
            Some(session_id)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let c = vec![0.0, 1.0, 0.0];
        
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-5);
        assert!((cosine_similarity(&a, &c) - 0.0).abs() < 1e-5);
    }
}
