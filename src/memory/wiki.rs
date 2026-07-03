use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use crate::providers::ModelProvider;

#[derive(Debug, Clone)]
pub struct WikiChunk {
    pub file_path: PathBuf,
    pub content: String,
    pub embedding: Vec<f32>,
}

fn get_wiki_cache() -> &'static RwLock<HashMap<PathBuf, Vec<WikiChunk>>> {
    static CACHE: OnceLock<RwLock<HashMap<PathBuf, Vec<WikiChunk>>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn index_wiki_directory<P: AsRef<Path>>(dir: P, provider: &dyn ModelProvider) -> Result<(), String> {
    let mut cache = get_wiki_cache().write().map_err(|e| e.to_string())?;
    
    cache.clear();

    if !dir.as_ref().exists() {
        return Ok(());
    }

    let paths = get_md_files(dir.as_ref())?;
    for path in paths {
        if let Ok(content) = fs::read_to_string(&path) {
            let chunks = chunk_markdown(&content);
            let mut wiki_chunks = Vec::new();
            for chunk_text in chunks {
                let embedding = futures::executor::block_on(provider.get_embeddings(&chunk_text))
                    .unwrap_or_default()
                    .iter()
                    .map(|&v| v as f32)
                    .collect::<Vec<f32>>();
                
                wiki_chunks.push(WikiChunk {
                    file_path: path.clone(),
                    content: chunk_text,
                    embedding,
                });
            }
            cache.insert(path, wiki_chunks);
        }
    }

    Ok(())
}

fn get_md_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                files.extend(get_md_files(&path)?);
            } else if path.extension().map_or(false, |ext| ext == "md" || ext == "mdx") {
                files.push(path);
            }
        }
    }
    Ok(files)
}

fn chunk_markdown(content: &str) -> Vec<String> {
    content
        .split("\n\n")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn search_wiki(
    query_vector: &[f32],
    threshold: f32,
    limit: usize,
) -> Result<Vec<(String, f32)>, String> {
    let cache = get_wiki_cache().read().map_err(|e| e.to_string())?;
    let mut matches = Vec::new();

    for chunks in cache.values() {
        for chunk in chunks {
            if chunk.embedding.is_empty() || query_vector.is_empty() {
                continue;
            }
            let sim = cosine_similarity(query_vector, &chunk.embedding);
            if sim >= threshold {
                matches.push((chunk.content.clone(), sim));
            }
        }
    }

    matches.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    matches.truncate(limit);

    Ok(matches)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for i in 0..std::cmp::min(a.len(), b.len()) {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a.sqrt() * norm_b.sqrt())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 1e-5);

        let c = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &c) - 0.0).abs() < 1e-5);
    }
}
