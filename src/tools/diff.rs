pub fn apply_line_patch(original: &str, patch: &str) -> Result<String, String> {
    let mut lines: Vec<String> = original.lines().map(|s| s.to_string()).collect();
    let patch_lines: Vec<&str> = patch.lines().collect();

    let mut idx = 0;
    while idx < patch_lines.len() {
        let line = patch_lines[idx];
        if line.starts_with("@@") {
            let mut target_block = Vec::new();
            let mut replacement_block = Vec::new();
            idx += 1;
            while idx < patch_lines.len() && !patch_lines[idx].starts_with("@@") {
                let pl = patch_lines[idx];
                if pl.starts_with('-') {
                    target_block.push(pl[1..].to_string());
                } else if pl.starts_with('+') {
                    replacement_block.push(pl[1..].to_string());
                } else if pl.starts_with(' ') {
                    target_block.push(pl[1..].to_string());
                    replacement_block.push(pl[1..].to_string());
                } else {
                    target_block.push(pl.to_string());
                    replacement_block.push(pl.to_string());
                }
                idx += 1;
            }

            let mut matched_index = None;
            for i in 0..=lines.len().saturating_sub(target_block.len()) {
                let mut matches = true;
                for j in 0..target_block.len() {
                    if lines[i + j].trim() != target_block[j].trim() {
                        matches = false;
                        break;
                    }
                }
                if matches {
                    matched_index = Some(i);
                    break;
                }
            }

            if let Some(pos) = matched_index {
                lines.drain(pos..pos + target_block.len());
                for (offset, repl) in replacement_block.into_iter().enumerate() {
                    lines.insert(pos + offset, repl);
                }
            } else {
                return Err(format!("Failed to match patch hunk context in original file."));
            }
            continue;
        }
        idx += 1;
    }

    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_line_patch() {
        let original = "line1\nline2\nline3";
        let patch = "@@ -1,2 +1,2 @@\n-line2\n+line2_patched";
        let res = apply_line_patch(original, patch).unwrap();
        assert_eq!(res, "line1\nline2_patched\nline3");
    }
}
