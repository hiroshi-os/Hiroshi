import { Agent, Mission, SwarmTopologyNode, ArtifactFile } from '../types'

export const INITIAL_AGENTS: Agent[] = [
  {
    id: 'agent-supervisor',
    name: 'Hiroshi Core',
    role: 'supervisor',
    title: 'Lead Swarm Orchestrator',
    model: 'Claude 3.7 Sonnet (Thinking)',
    color: '#F59E0B',
    badgeColor: '#F59E0B22',
    status: 'executing',
    currentTask: 'Supervising subtask consensus & reviewing diff output',
    tools: ['task_decompose', 'agent_dispatch', 'swarm_synthesize', 'request_human_gate'],
    contextTokens: 42150,
    maxContextTokens: 200000,
    temperature: 0.2,
    systemPrompt:
      'You are Hiroshi Core, the root orchestrator of a multi-agent development swarm. Decompose high-level goals into directed acyclic task graphs, delegate to specialized agents, monitor progress, resolve conflicts, and enforce safety gates before any external side-effects.',
  },
  {
    id: 'agent-architect',
    name: 'Atlas',
    role: 'architect',
    title: 'System & Protocol Architect',
    model: 'DeepSeek R1',
    color: '#A78BFA',
    badgeColor: '#A78BFA22',
    status: 'done',
    currentTask: 'Generated CRDT state sync specification & message protocol',
    tools: ['read_file', 'ast_grep', 'dependency_graph', 'spec_generator'],
    contextTokens: 31200,
    maxContextTokens: 128000,
    temperature: 0.1,
    systemPrompt:
      'You are Atlas, the system architect. Analyze codebase invariants, memory boundaries, and concurrency topologies. Produce strict interface contracts and state synchronization protocols.',
  },
  {
    id: 'agent-researcher',
    name: 'Scout',
    role: 'researcher',
    title: 'Deep Codebase & Web Intelligence',
    model: 'Claude 3.5 Haiku',
    color: '#38BDF8',
    badgeColor: '#38BDF822',
    status: 'done',
    currentTask: 'Indexed 48 source files and retrieved native GPUI layout primitives',
    tools: ['ripgrep', 'web_search', 'fetch_docs', 'symbol_lookup'],
    contextTokens: 18400,
    maxContextTokens: 200000,
    temperature: 0.3,
    systemPrompt:
      'You are Scout. Locate relevant symbols, prior art, existing call sites, and documentation. Return concise factual references with file lines and signatures.',
  },
  {
    id: 'agent-coder',
    name: 'Forge',
    role: 'coder',
    title: 'High-Performance Systems Engineer',
    model: 'Claude 3.7 Sonnet',
    color: '#34D399',
    badgeColor: '#34D39922',
    status: 'executing',
    currentTask: 'Implementing state synchronization worker in Rust & TypeScript bridge',
    tools: ['edit_file', 'apply_diff', 'run_tests', 'cargo_check'],
    contextTokens: 54300,
    maxContextTokens: 200000,
    temperature: 0.2,
    systemPrompt:
      'You are Forge. Write robust, zero-cost-abstraction Rust and GPUIX TypeScript components. Favor explicit error handling and lock-free concurrency.',
  },
  {
    id: 'agent-verifier',
    name: 'Sentinel',
    role: 'verifier',
    title: 'QA & Formal Verification',
    model: 'DeepSeek V3',
    color: '#F472B6',
    badgeColor: '#F472B622',
    status: 'waiting_approval',
    currentTask: 'Staged safety verification suite; awaiting human approval to run cargo test',
    tools: ['sandbox_exec', 'vitest_run', 'leak_sanitizer', 'fuzz_tester'],
    contextTokens: 22100,
    maxContextTokens: 128000,
    temperature: 0.0,
    systemPrompt:
      'You are Sentinel. Rigorously verify generated patches, evaluate race conditions, memory bounds, and regressions.',
  },
]

export const TOPOLOGY_NODES: SwarmTopologyNode[] = [
  {
    id: 'node-supervisor',
    agentId: 'agent-supervisor',
    label: 'Hiroshi Core',
    role: 'supervisor',
    x: 50,
    y: 16,
    status: 'executing',
    activeTask: 'Coordinating distributed sync pipeline',
    connectedTo: ['node-architect', 'node-researcher', 'node-coder', 'node-verifier'],
    throughput: '3.4 msg/s',
  },
  {
    id: 'node-architect',
    agentId: 'agent-architect',
    label: 'Atlas',
    role: 'architect',
    x: 20,
    y: 50,
    status: 'done',
    activeTask: 'CRDT Spec finalized',
    connectedTo: ['node-coder'],
    throughput: '0.0 msg/s',
  },
  {
    id: 'node-researcher',
    agentId: 'agent-researcher',
    label: 'Scout',
    role: 'researcher',
    x: 40,
    y: 50,
    status: 'done',
    activeTask: 'Codebase references resolved',
    connectedTo: ['node-coder'],
    throughput: '0.0 msg/s',
  },
  {
    id: 'node-coder',
    agentId: 'agent-coder',
    label: 'Forge',
    role: 'coder',
    x: 65,
    y: 50,
    status: 'executing',
    activeTask: 'Emitting Rust NAPI bindings',
    connectedTo: ['node-verifier'],
    throughput: '12.8 tok/s',
  },
  {
    id: 'node-verifier',
    agentId: 'agent-verifier',
    label: 'Sentinel',
    role: 'verifier',
    x: 85,
    y: 50,
    status: 'waiting_approval',
    activeTask: 'Awaiting user execution gate',
    connectedTo: ['node-supervisor'],
    throughput: 'Gate Held',
  },
]

const SAMPLE_RUST_CRDT = `use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmStateDelta {
    pub lamport_clock: u64,
    pub agent_id: String,
    pub op_type: OperationType,
    pub payload: Vec<u8>,
}

#[derive(Clone)]
pub struct DistributedSwarmEngine {
    state: Arc<RwLock<SwarmState>>,
    peer_clock: Arc<RwLock<u64>>,
}

impl DistributedSwarmEngine {
    pub fn new(agent_id: String) -> Self {
        Self {
            state: Arc::new(RwLock::new(SwarmState::default())),
            peer_clock: Arc::new(RwLock::new(0)),
        }
    }

    /// Merges an incoming CRDT state delta without locks on the main rendering frame.
    #[inline]
    pub fn merge_delta(&self, delta: SwarmStateDelta) -> Result<bool, EngineError> {
        let mut clock = self.peer_clock.write();
        if delta.lamport_clock <= *clock {
            // Already incorporated or causal order satisfied
            return Ok(false);
        }
        *clock = delta.lamport_clock;
        let mut state = self.state.write();
        state.apply_operation(delta.op_type, &delta.payload)?;
        Ok(true)
    }
}`

const SAMPLE_DIFF_PATCH = [
  'diff --git a/crates/hiroshi-core/src/swarm/engine.rs b/crates/hiroshi-core/src/swarm/engine.rs',
  'index 4a12bc8..f892e10 100644',
  '--- a/crates/hiroshi-core/src/swarm/engine.rs',
  '+++ b/crates/hiroshi-core/src/swarm/engine.rs',
  '@@ -34,9 +34,14 @@ impl SwarmController {',
  '     pub fn broadcast_message(&self, message: AgentMessage) -> Result<()> {',
  '-        let mut queue = self.message_queue.lock().unwrap();',
  '-        queue.push_back(message);',
  '+        let delta = SwarmStateDelta {',
  '+            lamport_clock: self.clock.fetch_add(1, Ordering::SeqCst),',
  '+            agent_id: message.sender_id.clone(),',
  '+            op_type: OperationType::Broadcast,',
  '+            payload: message.encode_bytes()?,',
  '+        };',
  '+        self.crdt_engine.merge_delta(delta)?;',
  '         Ok(())',
  '     }',
].join('\n')

export const INITIAL_MISSIONS: Mission[] = [
  {
    id: 'm-1',
    title: 'Implement Distributed State Synchronization with CRDT in Rust & GPUI',
    project: 'hiroshi-core',
    branch: 'feat/crdt-sync',
    createdAt: '12m ago',
    status: 'running',
    activeFleet: ['agent-supervisor', 'agent-architect', 'agent-researcher', 'agent-coder', 'agent-verifier'],
    turns: [
      {
        id: 't-1',
        timestamp: '14:22:04',
        kind: 'user_mission',
        userText:
          'Design and implement zero-lock distributed state synchronization across agent worker threads. Use a Lamport-clock CRDT in Rust so the GPUI rendering thread never stutters during high-throughput agent broadcasts.',
        tags: ['Distributed', 'Rust', 'CRDT', 'Zero-Lock', 'GPUI'],
      },
      {
        id: 't-2',
        timestamp: '14:22:06',
        kind: 'orchestrator_plan',
        planTitle: 'Swarm Orchestration DAG Decomposed (4 Subtasks)',
        planObjective: 'Guarantee stutter-free 120fps UI updates during agent swarm message bursts.',
        subtasks: [
          {
            id: 'st-1',
            title: 'Analyze memory boundaries and define CRDT Delta schema',
            assignedAgentId: 'agent-architect',
            status: 'completed',
          },
          {
            id: 'st-2',
            title: 'Scan existing GPUIX message queue & event pump bottlenecks',
            assignedAgentId: 'agent-researcher',
            status: 'completed',
          },
          {
            id: 'st-3',
            title: 'Implement DistributedSwarmEngine with parking_lot RwLock',
            assignedAgentId: 'agent-coder',
            status: 'in_progress',
            dependsOn: ['st-1', 'st-2'],
          },
          {
            id: 'st-4',
            title: 'Run multi-threaded race detection and benchmark cargo tests',
            assignedAgentId: 'agent-verifier',
            status: 'pending',
            dependsOn: ['st-3'],
          },
        ],
      },
      {
        id: 't-3',
        timestamp: '14:22:11',
        kind: 'agent_turn',
        agentId: 'agent-researcher',
        reasoning:
          'Inspecting crates/hiroshi-core for existing message queue implementations. Located single mutex bottleneck in broadcast_message that locks the event pump.',
        reasoningDuration: 'Searched 48 files in 1.4s',
        isReasoningExpanded: false,
        messageText:
          'Scout here. Ripgrep analysis identified that the existing `SwarmController` uses a synchronous `std::sync::Mutex` inside `broadcast_message()`. When 5 or more agents dispatch parallel events, the lock contention stalls the GPUI rendering thread by ~16.8ms.',
        toolCalls: [
          {
            id: 'tc-1',
            toolName: 'ripgrep',
            inputSummary: 'pattern: "message_queue.lock()" in crates/hiroshi-core',
            output: 'Found 3 call sites in swarm/engine.rs:35, broker.rs:82, and worker.rs:114.',
            status: 'success',
            durationMs: 340,
          },
        ],
      },
      {
        id: 't-4',
        timestamp: '14:22:18',
        kind: 'agent_turn',
        agentId: 'agent-architect',
        reasoning:
          'Designing an operation-based CRDT where deltas carry monotonic Lamport timestamps. Replacing coarse mutex with fine-grained parking_lot RwLock + AtomicU64 clock.',
        reasoningDuration: 'Formulated architectural contract in 3.1s',
        isReasoningExpanded: false,
        messageText:
          'Atlas specification: We model all state mutations as `SwarmStateDelta`. By verifying monotonic clock values before acquiring write locks, read-only queries from the UI thread remain completely lock-free.',
      },
      {
        id: 't-5',
        timestamp: '14:22:30',
        kind: 'agent_turn',
        agentId: 'agent-coder',
        reasoning:
          'Implementing DistributedSwarmEngine in crates/hiroshi-core/src/swarm/engine.rs. Utilizing inline merge_delta with early exit for stale clocks.',
        reasoningDuration: 'Synthesized implementation & patch in 4.8s',
        isReasoningExpanded: true,
        messageText:
          'Forge update: I have implemented the zero-lock CRDT synchronization engine. Here is the Rust implementation and the corresponding diff patch against the main engine.',
        codeBlock: {
          language: 'rust',
          filename: 'crates/hiroshi-core/src/swarm/crdt.rs',
          code: SAMPLE_RUST_CRDT,
        },
        diffPatch: SAMPLE_DIFF_PATCH,
        toolCalls: [
          {
            id: 'tc-2',
            toolName: 'edit_file',
            inputSummary: 'crates/hiroshi-core/src/swarm/crdt.rs (+42 lines)',
            output: 'File written successfully. 0 syntax errors detected by rust-analyzer.',
            status: 'success',
            durationMs: 120,
          },
        ],
      },
      {
        id: 't-6',
        timestamp: '14:22:38',
        kind: 'approval_request',
        approvalId: 'appr-1',
        agentId: 'agent-verifier',
        actionTitle: 'Human Gate Required: Run Native Cargo Test Suite',
        actionCommand: 'cargo test --package hiroshi-core --test test_crdt_concurrency -- --nocapture',
        riskLevel: 'moderate',
        approvalStatus: 'pending',
      },
    ],
  },
  {
    id: 'm-2',
    title: 'Security Audit & Memory Leak Analysis on Canvas Render Loop',
    project: 'hiroshi-ui',
    branch: 'audit/canvas-leak',
    createdAt: '2h ago',
    status: 'completed',
    activeFleet: ['agent-supervisor', 'agent-verifier', 'agent-security'],
    turns: [
      {
        id: 't-20',
        timestamp: '12:10:00',
        kind: 'user_mission',
        userText: 'Run memory leak detector and verify GPU texture release during tab switches.',
        tags: ['Security', 'Memory', 'GPU'],
      },
      {
        id: 't-21',
        timestamp: '12:10:45',
        kind: 'agent_turn',
        agentId: 'agent-verifier',
        reasoning: 'Profiled 500 tab switches. VRAM stabilizes at 48MB. Zero memory leaks detected.',
        messageText: 'Audit passed: Framebuffer textures are properly unmapped on frame drop.',
        status: 'completed',
      },
      {
        id: 't-22',
        timestamp: '12:11:10',
        kind: 'swarm_summary',
        summaryStats: {
          duration: '1m 10s',
          tokensBurned: 14200,
          filesModified: 0,
          toolsExecuted: 8,
        },
      },
    ],
  },
  {
    id: 'm-3',
    title: 'Multi-Modal Voice & Vision Tool Registry Integration',
    project: 'hiroshi-tools',
    branch: 'main',
    createdAt: '1d ago',
    status: 'idle',
    activeFleet: ['agent-supervisor', 'agent-coder'],
    turns: [
      {
        id: 't-30',
        timestamp: 'Yesterday',
        kind: 'user_mission',
        userText: 'Connect local Whisper.cpp endpoint to Hiroshi Tool Protocol.',
        tags: ['Audio', 'Tools', 'MCP'],
      },
    ],
  },
]

export const INITIAL_ARTIFACTS: ArtifactFile[] = [
  {
    id: 'art-1',
    name: 'crdt.rs',
    path: 'crates/hiroshi-core/src/swarm/crdt.rs',
    agentName: 'Forge (Coder)',
    language: 'rust',
    linesAdded: 42,
    linesRemoved: 0,
    content: SAMPLE_RUST_CRDT,
  },
  {
    id: 'art-2',
    name: 'engine.rs',
    path: 'crates/hiroshi-core/src/swarm/engine.rs',
    agentName: 'Forge (Coder)',
    language: 'rust',
    linesAdded: 8,
    linesRemoved: 2,
    content: '// Patched broadcast_message with Lamport delta broadcasting',
    patch: SAMPLE_DIFF_PATCH,
  },
]
