# Creating & Managing Custom Skills (Polyglot IPC)

Hiroshi supports dynamic capabilities at runtime. You can write scripts or compile binaries in **any language** (Python, Bash, PowerShell, Go, Node.js) and register them as tools without modifying or recompiling the Hiroshi Rust binary.

## 1. Skill Folder Structure
Each dynamic capability is contained in its own folder inside `~/.hiroshi/skills/`:

```text
~/.hiroshi/skills/
└── your_skill_name/
    ├── SKILL.md       # Metadata, argument schema, and description
    └── run_script.py  # The executable script or binary file
```

## 2. Defining Metadata (`SKILL.md`)
The `SKILL.md` file defines how the LLM understands when and how to call your tool. It uses a YAML frontmatter block for keys:

```markdown
---
name: calculate_sum
description: "Sums up two numeric parameters 'a' and 'b'"
schema: '{ "a": "number", "b": "number" }'
---
# Calculate Sum Skill
This tool adds two numbers and prints the result.
```

- **`name`**: The unique identifier for the tool call (e.g. `calculate_sum`).
- **`description`**: Explains to the LLM when to use this capability.
- **`schema`**: Specifies the expected JSON input schema.

## 3. The IPC Protocol (JSON over Stdin)
When an agent calls your skill, Hiroshi executes the script and:
1. **Passes arguments** into your script's standard input (`stdin`) as a raw JSON string (e.g. `{"a": 5, "b": 10}`).
2. **Captures output** from your script's standard output (`stdout`) and feeds it back to the LLM.

### Example Python Script (`calculate.py`):
```python
import sys
import json

def main():
    # Read arguments from stdin
    raw_input = sys.stdin.read()
    args = json.loads(raw_input)
    
    a = args.get("a", 0)
    b = args.get("b", 0)
    
    result = {
        "success": True,
        "sum": a + b
    }
    
    # Return output through stdout
    print(json.dumps(result))

if __name__ == "__main__":
    main()
```

## 4. Granting Tool Permissions (`AGENTS.md`)
To allow an agent to use your new skill, add its `name` to the agent's whitelisted tools inside `~/.hiroshi/AGENTS.md`:

```markdown
## Developer
- Prompt: "You are Hiroshi's Programmer."
- Allowed Tools: [WriteFile, calculate_sum]
```

## 5. Security & Isolation Limits
- **Allowed Binaries Whitelist**: If your skill calls an external process, that binary must exist inside the whitelisted commands array (`allowed_binaries`) in `config.toml`.
- **Command Injection Guard**: Any command string containing shell chain characters (`&`, `|`, `;`, `$`, or backticks) will be rejected at the boundary.
- **Strict Timeout Cap**: Subprocess execution is capped at `10 seconds`. If a script hangs, the daemon kills it automatically.
