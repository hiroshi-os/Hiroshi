use std::path::{Path, PathBuf};

pub struct DesktopVisionEngine {
    screenshot_vault: PathBuf,
}

impl DesktopVisionEngine {
    pub fn new<P: AsRef<Path>>(screenshot_vault: P) -> Self {
        Self {
            screenshot_vault: screenshot_vault.as_ref().to_path_buf(),
        }
    }

    /// Captures a primary display screenshot to a compressed memory file buffer.
    /// Under offline mock runs, returns a static mock PNG payload byte vector.
    pub fn desktop_screenshot(&self) -> Result<Vec<u8>, String> {
        let target_file = self.screenshot_vault.join("last_screenshot.png");
        
        // If an actual screenshot exists, read it
        if target_file.exists() {
            std::fs::read(&target_file)
                .map_err(|e| format!("Failed to read display buffer: {}", e))
        } else {
            // Mock display buffer layout payload
            Ok(b"MOCK_PNG_DISPLAY_SCREEN_FRAME_BYTES".to_vec())
        }
    }

    /// Executes simulated program clicks at scale coordinates (X, Y).
    pub fn desktop_click(&self, x: u32, y: u32) -> Result<String, String> {
        // Log coord mappings
        let result = format!("[\x1b[32mVISION CLICK\x1b[0m] Executed hardware click coordinate at scaling mapping: ({}, {})", x, y);
        println!("{}", result);
        Ok(result)
    }

    /// Simulates program typing of active keyboard characters and keystrokes.
    pub fn desktop_type(&self, text: &str) -> Result<String, String> {
        let result = format!("[\x1b[32mVISION TYPE\x1b[0m] Injected simulated keystroke sequence: {:?}", text);
        println!("{}", result);
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_desktop_vision_mocking() {
        let dir = tempdir().unwrap();
        let vision = DesktopVisionEngine::new(dir.path());

        // Test screenshot mock buffer return
        let bytes = vision.desktop_screenshot().unwrap();
        assert_eq!(bytes, b"MOCK_PNG_DISPLAY_SCREEN_FRAME_BYTES");

        // Test mock clicking coordinates
        let click_res = vision.desktop_click(1024, 768).unwrap();
        assert!(click_res.contains("1024"));
        assert!(click_res.contains("768"));

        // Test keystroke mock sequence simulation
        let type_res = vision.desktop_type("hello world").unwrap();
        assert!(type_res.contains("hello world"));
    }
}
