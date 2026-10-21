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

## The engine

Runs belong to a detached local daemon, not to the window. The cockpit attaches
to it, follows one event feed and draws what it is told. Closing the window
leaves the work running; a second window attaches to the same runs.

```bash
bun run engine          # start the daemon in the foreground
bun run engine:status   # port, pid, uptime, protocol, database
bun run test:engine     # the engine suite: real daemons, real SQLite
```

State lives in `%LOCALAPPDATA%\Hiroshi` on Windows,
`~/Library/Application Support/Hiroshi` on macOS and
`$XDG_STATE_HOME/hiroshi` on Linux; `HIROSHI_HOME` overrides it. The data
directory holds `engine.db` (the event log), `engine.json` (discovery: url, pid,
token), `engine.lock` and `logs/engine.log`.

The design and the guarantees are in [docs/engine.mdx](./docs/engine.mdx).

---

## Development

```bash
# Run desktop dev with hot remounting
bun run dev

# Run Vitest suite on GPU test renderer
bun run test

# Run the engine suite against real daemons
bun run test:engine

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

---

## Documentation

The docs site lives in [`docs/`](./docs) and is a [Mintlify](https://mintlify.com)
project. `docs/docs.json` holds the navigation and the theme, the `.mdx`
files next to it are the pages.

```bash
npm i -g mint
cd docs && mint dev
```
