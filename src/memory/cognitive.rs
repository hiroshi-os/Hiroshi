use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use crate::config::CognitiveMemoryConfig;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentCommitment {
    pub id: String,
    pub description: String,
    pub timestamp: i64,
    pub fulfilled: bool,
}

pub struct ParallelLanesMultiplexer {
    config: CognitiveMemoryConfig,
}

impl ParallelLanesMultiplexer {
    pub fn new(config: CognitiveMemoryConfig) -> Self {
        Self { config }
    }

    /// Split a complex prompt task into specialized sub-lane prompts
    pub fn split_into_lanes(&self, prompt: &str) -> Vec<String> {
        let mut lanes = Vec::new();
        // Conceptually split the task
        if prompt.contains("and") || prompt.contains("then") {
            let parts: Vec<String> = if prompt.contains("and") {
                prompt.split("and").map(|s| s.to_string()).collect()
            } else {
                prompt.split("then").map(|s| s.to_string()).collect()
            };
            for part in parts {
                if !part.trim().is_empty() && lanes.len() < self.config.lane_count_limit {
                    lanes.push(format!("Lane Task: {}", part.trim()));
                }
            }
        }

        if lanes.is_empty() {
            lanes.push(format!("Lane Task (Monolithic): {}", prompt));
        }

        lanes
    }
}

pub struct CommitmentMemoryTracker {
    commitments: Mutex<HashMap<String, AgentCommitment>>,
}

impl CommitmentMemoryTracker {
    pub fn new() -> Self {
        Self {
            commitments: Mutex::new(HashMap::new()),
        }
    }

    pub fn record_commitment(&self, id: &str, description: &str) {
        let commitment = AgentCommitment {
            id: id.to_string(),
            description: description.to_string(),
            timestamp: chrono::Utc::now().timestamp(),
            fulfilled: false,
        };
        let mut guard = self.commitments.lock().unwrap();
        guard.insert(id.to_string(), commitment);
    }

    pub fn list_commitments(&self) -> Vec<AgentCommitment> {
        let guard = self.commitments.lock().unwrap();
        guard.values().cloned().collect()
    }

    /// Compaction sweep that flushes stale memory keys but keeps active commitments intact
    pub fn dreaming_compaction_sweep(&self, active_keys: &mut HashMap<String, f32>) {
        // Retain only highly-weighted keys or key nodes that match active commitments
        let guard = self.commitments.lock().unwrap();
        active_keys.retain(|key, weight| {
            let is_commitment = guard.values().any(|c| !c.fulfilled && c.description.contains(key));
            is_commitment || *weight > 0.5
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_into_lanes() {
        let config = CognitiveMemoryConfig {
            lane_count_limit: 3,
            commitment_tracking_enabled: true,
        };
        let mux = ParallelLanesMultiplexer::new(config);
        let tasks = mux.split_into_lanes("read workspace and write final walkthrough");
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn test_record_commitment() {
        let tracker = CommitmentMemoryTracker::new();
        tracker.record_commitment("c1", "deliver Phase 35 modules");
        let list = tracker.list_commitments();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "c1");
    }
}
