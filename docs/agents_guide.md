# Configuring Multi-Agent Workflows

Hiroshi features a modular Multi-Agent engine driven by a single Markdown configuration file located at `~/.hiroshi/AGENTS.md`.

## The `AGENTS.md` File Structure
You can declare agents using markdown level-2 headers (`## Agent Name`). Each agent is configured with list attributes:
- **`Prompt`**: The core system prompt definition for the agent.
- **`Allowed Tools`**: Explicit list of sandbox capabilities the agent is permitted to execute (e.g. `[ReadFile, WriteFile]`).
- **`Hand-off`**: The routing condition describing when and how to transfer control to another agent.

### Core Configuration Example:
```markdown
## Architect
- Prompt: "You are Hiroshi's Lead Architect. Deconstruct user tasks into discrete system designs."
- Allowed Tools: [ReadFile, WriteFile]
- Hand-off: "If execution code needs to be written, yield control to Developer using [HANDOFF: Developer]."

## Developer
- Prompt: "You are Hiroshi's Systems Programmer. Write clean, idiomatic Rust code."
- Allowed Tools: [WriteFile]
- Hand-off: "Yield back to Architect upon task completion using [HANDOFF: Architect]."
```

## How Agent Handoffs Work
Handoffs happen automatically when the active LLM outputs the target routing token:
```text
[HANDOFF: TargetAgentName]
```

1. The daemon intercepts the token from the response stream.
2. It stops generation, swaps the active system prompt state to `TargetAgentName`.
3. It restarts LLM generation, sending the updated prompt.

## Managing Agent State in CLI
- **`/agents`**: Lists all agents registered in `AGENTS.md` along with their allowed tools and prompts.
- **`/agent <Name>`**: Manually switches the active agent context (e.g. `/agent Developer`).
