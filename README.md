# Hiroshi — Multi-Agent Orchestration Cockpit

Hiroshi is a GPU-native control plane and orchestration cockpit for autonomous multi-agent development swarms, rendered with **GPUIX** (Metal, DirectX, Vulkan).

No Electron. No web view. Paints at 120 FPS directly through GPUI.

---

## Capabilities & Views

1. **Swarm Timeline (`TimelineView`)**
   - Live stream of multi-agent turn execution, orchestrated plans, and reasoning chains.
   - Decomposed Subtask DAG with assigned agent badges and dependency tracking.
   - Collapsible reasoning folds ("Thought for 4.8s").
   - Tool execution cards (`ripgrep`, `edit_file`, `cargo_test`, etc.) with duration tags and output logs.
   - Native syntax-highlighted code blocks (`<code>`) and hunk diffs (`<diff>`).
   - Human-in-the-loop security gates with operator approval/rejection actions.

2. **Swarm Topology (`TopologyView`)**
   - Hierarchical DAG visualizer showing communication channels and live throughput (`msg/s`, `tok/s`).
   - Node status indicators (`Supervisor`, `Architect`, `Researcher`, `Coder`, `Verifier`).
   - Selected agent inspector with context window token gauge, granted tools, and system prompt.

3. **Fleet & Agents (`FleetView`)**
   - Agent fleet roster and model switcher (`Sonnet 3.7`, `Haiku 3.5`, `DeepSeek R1`, `GPT-4o`).
   - Granular tool privilege management and system prompt overrides.

4. **Artifacts & Diffs (`ArtifactsView`)**
   - Code explorer for all files authored and patched by the swarm.
   - Integrated unified diff viewer and full syntax viewer.

5. **Mission Composer (`Composer`)**
   - Target selection (`Autonomous Swarm`, individual specialist agents).
   - Swarm modes (`Auto-DAG`, `Sequential`, `Supervised`).

---

## Development

```bash
# Run desktop dev with hot remounting
bun run dev

# Run Vitest suite on GPU test renderer
bun run test

# Typecheck with TypeScript
bun run typecheck

# Capture UI screenshots of all 4 views
bun run screenshot

# Bundle for the browser
bun run web:dev
```

---

## Versioning

`0.MINOR.PATCH`. The major stays `0` until the desktop shell and the app
surface are stable, and the minor counts the feature releases up to `255`
before `1.0.0`. The version lives in `package.json` and nowhere else.

What changed in every release is in [CHANGELOG.md](./CHANGELOG.md).
