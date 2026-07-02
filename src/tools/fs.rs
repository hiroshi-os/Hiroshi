use std::fs;
use std::path::{Path, PathBuf};

pub struct FilesystemSandbox {
    base_dir: PathBuf,
}

impl FilesystemSandbox {
    pub fn new<P: AsRef<Path>>(base_dir: P) -> Self {
        Self {
            base_dir: base_dir.as_ref().to_path_buf(),
        }
    }

    /// Verifies path jail containment constraints using dunce::canonicalize.
    fn verify_path(&self, user_path: &Path) -> Result<PathBuf, String> {
        let absolute_target = if user_path.is_absolute() {
            user_path.to_path_buf()
        } else {
            self.base_dir.join(user_path)
        };

        // Enforce dunce::canonicalize checking
        let canonical_base = dunce::canonicalize(&self.base_dir)
            .map_err(|e| format!("Base sandbox directory is invalid: {}", e))?;

        // If target exists, canonicalize it fully to resolve symlink loops
        if absolute_target.exists() {
            let canonical_target = dunce::canonicalize(&absolute_target)
                .map_err(|e| format!("Invalid target path layout: {}", e))?;

            if canonical_target.starts_with(&canonical_base) {
                Ok(canonical_target)
            } else {
                Err("PermissionDenied: Symbolic link or folder breakout detected!".to_string())
            }
        } else {
            // Resolve parents of non-existing targets to jail writes
            let parent = absolute_target.parent().ok_or("Invalid path parent hierarchy")?;
            if parent.exists() {
                let canonical_parent = dunce::canonicalize(parent)
                    .map_err(|e| format!("Parent hierarchy validation check failed: {}", e))?;
                if canonical_parent.starts_with(&canonical_base) {
                    Ok(absolute_target)
                } else {
                    Err("PermissionDenied: Parent breakout detected!".to_string())
                }
            } else {
                Err("Target directory parent structure does not exist".to_string())
            }
        }
    }

    pub fn fs_list(&self, sub_dir: &str) -> Result<Vec<String>, String> {
        let target = self.verify_path(Path::new(sub_dir))?;
        let entries = fs::read_dir(target)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut results = Vec::new();
        for entry in entries.flatten() {
            results.push(entry.file_name().to_string_lossy().to_string());
        }
        Ok(results)
    }

    pub fn fs_read(&self, file_path: &str) -> Result<String, String> {
        let target = self.verify_path(Path::new(file_path))?;
        fs::read_to_string(target)
            .map_err(|e| format!("Failed to read file: {}", e))
    }

    pub fn fs_write(&self, file_path: &str, content: &str) -> Result<(), String> {
        let target = self.verify_path(Path::new(file_path))?;
        fs::write(target, content)
            .map_err(|e| format!("Failed to write file: {}", e))
    }

    pub fn fs_move(&self, src: &str, dest: &str) -> Result<(), String> {
        let target_src = self.verify_path(Path::new(src))?;
        let target_dest = self.verify_path(Path::new(dest))?;
        fs::rename(target_src, target_dest)
            .map_err(|e| format!("Failed to move file: {}", e))
    }
}
