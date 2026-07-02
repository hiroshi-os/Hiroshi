use crate::db::{MemoryEngine, ChatMessage};
use crate::providers::ModelProvider;
use std::collections::HashMap;
use std::sync::Arc;

/// A chat message scored by the hybrid retrieval pipeline.
#[derive(Debug, Clone)]
pub struct ScoredMessage {
    pub role: String,
    pub content: String,
    pub score: f64,
}

/// Reciprocal Rank Fusion constant.
/// Using the standard value from information retrieval literature.
const RRF_K: f64 = 60.0;

/// Weight distribution: 70% vector similarity, 30% FTS5 keyword.
const VECTOR_WEIGHT: f64 = 0.70;
const FTS5_WEIGHT: f64 = 0.30;

/// Compute reciprocal rank fusion score for a given 1-based rank position.
fn rrf_score(rank: usize) -> f64 {
    1.0 / (RRF_K + rank as f64)
}

/// Perform 70/30 rank-normalized hybrid search across both vector
/// and FTS5 retrieval pipelines concurrently.
///
/// Algorithm:
/// 1. Run vector cosine similarity search and FTS5 keyword search in parallel.
/// 2. Assign RRF scores based on rank position within each result set.
/// 3. Merge: `final_score = 0.70 * vector_rrf + 0.30 * fts5_rrf`.
/// 4. Deduplicate by content, sort descending, truncate to `limit`.
pub async fn hybrid_search(
    db: &Arc<MemoryEngine>,
    provider: &Arc<dyn ModelProvider>,
    session_id: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<ScoredMessage>, String> {
    let fetch_limit = limit * 2;

    // Spawn both retrieval branches concurrently
    let query_vector = provider.get_embeddings(query).await.unwrap_or_default();

    let db_clone1 = db.clone();
    let session_id_clone1 = session_id.to_string();
    let query_vector_clone = query_vector.clone();
    let vector_handle = tokio::task::spawn_blocking(move || {
        if !query_vector_clone.is_empty() {
            db_clone1.search_vector_rag(&session_id_clone1, &query_vector_clone, fetch_limit)
        } else {
            Ok(Vec::new())
        }
    });

    let db_clone2 = db.clone();
    let session_id_clone2 = session_id.to_string();
    let query_clone = query.to_string();
    let fts5_handle = tokio::task::spawn_blocking(move || {
        db_clone2.search_rag_history(&session_id_clone2, &query_clone, fetch_limit)
    });

    let (vector_res, fts5_res) = tokio::join!(vector_handle, fts5_handle);

    let vector_results = vector_res
        .map_err(|e| format!("Vector search task join error: {}", e))??;
    let fts5_results = fts5_res
        .map_err(|e| format!("FTS5 search task join error: {}", e))??;

    // Build RRF score maps keyed by content hash
    let mut score_map: HashMap<String, (String, String, f64)> = HashMap::new();

    // Vector branch scores (70% weight)
    for (rank_0, msg) in vector_results.iter().enumerate() {
        let rank = rank_0 + 1; // 1-based
        let rrf = rrf_score(rank) * VECTOR_WEIGHT;
        let key = content_key(&msg.content);
        let entry = score_map.entry(key).or_insert_with(|| {
            (msg.role.clone(), msg.content.clone(), 0.0)
        });
        entry.2 += rrf;
    }

    // FTS5 branch scores (30% weight)
    for (rank_0, msg) in fts5_results.iter().enumerate() {
        let rank = rank_0 + 1; // 1-based
        let rrf = rrf_score(rank) * FTS5_WEIGHT;
        let key = content_key(&msg.content);
        let entry = score_map.entry(key).or_insert_with(|| {
            (msg.role.clone(), msg.content.clone(), 0.0)
        });
        entry.2 += rrf;
    }

    // Collect, sort descending by score, truncate
    let mut results: Vec<ScoredMessage> = score_map
        .into_values()
        .map(|(role, content, score)| ScoredMessage { role, content, score })
        .collect();

    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}

/// Deterministic content deduplication key.
/// Uses first 128 characters of content to handle very long messages efficiently.
fn content_key(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.len() <= 128 {
        trimmed.to_string()
    } else {
        trimmed[..128].to_string()
    }
}

/// Convert hybrid search results back to ChatMessage for engine compatibility.
pub fn scored_to_chat_messages(scored: Vec<ScoredMessage>) -> Vec<ChatMessage> {
    scored.into_iter().map(|s| ChatMessage {
        role: s.role,
        content: s.content,
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rrf_score_rank_1() {
        let score = rrf_score(1);
        let expected = 1.0 / (60.0 + 1.0);
        assert!((score - expected).abs() < 1e-10);
    }

    #[test]
    fn test_rrf_score_rank_10() {
        let score = rrf_score(10);
        let expected = 1.0 / (60.0 + 10.0);
        assert!((score - expected).abs() < 1e-10);
    }

    #[test]
    fn test_fusion_math() {
        // Document appears at rank 1 in vector and rank 3 in FTS5
        let vector_rrf = rrf_score(1) * VECTOR_WEIGHT;
        let fts5_rrf = rrf_score(3) * FTS5_WEIGHT;
        let combined = vector_rrf + fts5_rrf;

        let expected_vector = (1.0 / 61.0) * 0.70;
        let expected_fts5 = (1.0 / 63.0) * 0.30;
        let expected = expected_vector + expected_fts5;

        assert!((combined - expected).abs() < 1e-10);
    }

    #[test]
    fn test_content_key_dedup() {
        assert_eq!(content_key("hello world"), "hello world");
        assert_eq!(content_key("  hello  "), "hello");

        let long_str = "a".repeat(200);
        assert_eq!(content_key(&long_str).len(), 128);
    }

    #[test]
    fn test_vector_only_scoring() {
        // When FTS5 returns nothing, only vector weights contribute
        let vector_rrf_rank1 = rrf_score(1) * VECTOR_WEIGHT;
        assert!(vector_rrf_rank1 > 0.0);
        assert!(vector_rrf_rank1 < VECTOR_WEIGHT); // must be less than full weight
    }

    #[test]
    fn test_fts5_only_scoring() {
        // When vectors are empty, only FTS5 weights contribute
        let fts5_rrf_rank1 = rrf_score(1) * FTS5_WEIGHT;
        assert!(fts5_rrf_rank1 > 0.0);
        assert!(fts5_rrf_rank1 < FTS5_WEIGHT);
    }
}
