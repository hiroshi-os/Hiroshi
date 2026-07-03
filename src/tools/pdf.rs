use std::fs;
use std::path::Path;
use crate::error::EngineError;

pub fn extract_pdf_to_markdown<P: AsRef<Path>>(path: P, max_size: usize) -> Result<String, EngineError> {
    let metadata = fs::metadata(&path)
        .map_err(|e| EngineError::ToolError(format!("Failed to read PDF metadata: {}", e)))?;
        
    if metadata.len() as usize > max_size {
        return Err(EngineError::ToolError(format!("PDF size exceeds maximum safety limit threshold of {} bytes", max_size)));
    }
    
    let bytes = fs::read(&path)
        .map_err(|e| EngineError::ToolError(format!("Failed to read PDF file buffer: {}", e)))?;
        
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| EngineError::ToolError(format!("PDF text matrix extraction failed: {}", e)))?;
        
    // Structure extraction into a readable layout
    let mut markdown = format!("# PDF Document Extraction: {}\n\n", path.as_ref().display());
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        
        // Clean line-level structural formatting adjustments
        if trimmed.chars().all(|c| c.is_uppercase() || c.is_numeric() || c.is_ascii_punctuation()) && trimmed.len() < 60 {
            markdown.push_str(&format!("\n## {}\n", trimmed));
        } else {
            markdown.push_str(&format!("{}\n", trimmed));
        }
    }
    
    Ok(markdown)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_extract_pdf_nonexistent() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("missing.pdf");
        let res = extract_pdf_to_markdown(&file, 1024);
        assert!(res.is_err());
    }
}
