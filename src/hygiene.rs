use crate::db::ChatMessage;

/// Sanitizes and structures conversational transcripts for strict provider schemas.
pub fn sanitize_chat_history(history: Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut cleaned = Vec::new();

    for msg in history {
        let mut content = msg.content.clone();

        // 1. Empty Block Recovery
        // If content is completely empty, insert a recovery placeholder block
        if content.trim().is_empty() {
            content = "<system_error_recovery> Empty block detected and recovered. </system_error_recovery>".to_string();
        }

        // 2. Thinking Signature Transposition
        // Transpose Anthropic <thinking> or Gemini thoughtSignature signatures
        if content.contains("<thinking>") {
            content = content.replace("<thinking>", "[thoughtSignature: ")
                             .replace("</thinking>", " ]");
        } else if content.contains("[thoughtSignature:") {
            content = content.replace("[thoughtSignature: ", "<thinking>")
                             .replace(" ]", "</thinking>");
        }

        cleaned.push(ChatMessage {
            role: msg.role,
            content,
        });
    }

    // 3. Orphaned Tool ID Call Correction
    // If we have an assistant call with a tool tag but no matching tool response block,
    // we append a synthetic error tool block to preserve sequence alignment.
    let mut final_history = Vec::new();
    let len = cleaned.len();
    for i in 0..len {
        let current = &cleaned[i];
        final_history.push(current.clone());

        if current.role == "assistant" && current.content.contains("<call_tool") {
            // Check if next message is a tool response (user role with tool output markers)
            let mut has_matching_response = false;
            if i + 1 < len {
                let next = &cleaned[i + 1];
                if next.role == "user" && (next.content.contains("Tool output") || next.content.contains("Verification")) {
                    has_matching_response = true;
                }
            }

            if !has_matching_response {
                // Insert synthetic tool completion frame to restore ledger structural parity
                final_history.push(ChatMessage {
                    role: "user".to_string(),
                    content: "Tool execution interrupted or aborted. Synthetic error frame appended.".to_string(),
                });
            }
        }
    }

    final_history
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_block_recovery() {
        let history = vec![
            ChatMessage { role: "user".to_string(), content: "hello".to_string() },
            ChatMessage { role: "assistant".to_string(), content: "  ".to_string() }
        ];
        let cleaned = sanitize_chat_history(history);
        assert!(cleaned[1].content.contains("<system_error_recovery>"));
    }

    #[test]
    fn test_thinking_transposition() {
        let history = vec![
            ChatMessage { role: "assistant".to_string(), content: "<thinking>Searching...</thinking>Found.".to_string() }
        ];
        let cleaned = sanitize_chat_history(history);
        assert!(cleaned[0].content.contains("[thoughtSignature: Searching... ]Found."));
    }

    #[test]
    fn test_orphaned_tool_correction() {
        let history = vec![
            ChatMessage { role: "assistant".to_string(), content: "<call_tool name=\"git\">{}</call_tool>".to_string() }
        ];
        let cleaned = sanitize_chat_history(history);
        assert_eq!(cleaned.len(), 2);
        assert_eq!(cleaned[1].role, "user");
        assert!(cleaned[1].content.contains("Synthetic error frame"));
    }
}
