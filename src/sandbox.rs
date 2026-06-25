use std::path::{Path, PathBuf};
use std::fs;

pub struct WorkspaceSandbox {
    base_dir: PathBuf,
}

impl WorkspaceSandbox {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    pub fn sanitize_path(&self, user_path: &str) -> Result<PathBuf, String> {
        // Reject path traversal
        if user_path.contains("..") {
            return Err("Access denied: path contains directory traversal components ('..')".to_string());
        }

        let path = Path::new(user_path);

        // Reject absolute paths and paths starting with root slashes/backslashes
        if path.is_absolute() || user_path.starts_with('/') || user_path.starts_with('\\') {
            return Err("Access denied: absolute paths are not allowed".to_string());
        }

        // Reject Windows prefixes (like C:)
        if path.components().any(|c| matches!(c, std::path::Component::Prefix(_))) {
            return Err("Access denied: drive letters or UNC paths are not allowed".to_string());
        }

        // Combine base and user_path
        let resolved = self.base_dir.join(user_path);
        
        Ok(resolved)
    }

    pub fn read_file(&self, user_path: &str) -> Result<String, String> {
        let safe_path = self.sanitize_path(user_path)?;
        if !safe_path.exists() {
            return Err(format!("File does not exist: {}", user_path));
        }
        fs::read_to_string(&safe_path)
            .map_err(|e| format!("Failed to read file '{}': {}", user_path, e))
    }

    pub fn write_file(&self, user_path: &str, content: &str) -> Result<(), String> {
        let safe_path = self.sanitize_path(user_path)?;
        
        if let Some(parent) = safe_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory structure for '{}': {}", user_path, e))?;
        }
        
        fs::write(&safe_path, content)
            .map_err(|e| format!("Failed to write file '{}': {}", user_path, e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_sanitization() {
        let base = PathBuf::from(r"C:\Users\User\.hiroshi\workspace");
        let sandbox = WorkspaceSandbox::new(base.clone());

        // Safe relative path
        assert!(sandbox.sanitize_path("src/main.rs").is_ok());
        assert_eq!(
            sandbox.sanitize_path("src/main.rs").unwrap(),
            base.join("src/main.rs")
        );

        // Traversal rejection
        assert!(sandbox.sanitize_path("../config.toml").is_err());
        assert!(sandbox.sanitize_path("src/../../config.toml").is_err());

        // Absolute path rejection
        assert!(sandbox.sanitize_path("/etc/passwd").is_err());
        assert!(sandbox.sanitize_path(r"C:\Windows\System32").is_err());
    }
}
