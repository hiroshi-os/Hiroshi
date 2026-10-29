# Installed skills

Settings → Skills discovers `SKILL.md` documents in recognized user and active
project folders. The source filter and search work on the discovered inventory;
the detail pane reads the selected file and renders its Markdown.

Recognized roots include `.agents/skills`, `.claude/skills`, `.codex/skills`,
`.cursor/skills`, `.pi/agent/skills`, `.omp/agent/skills`, `.amp/skills`,
`.grok/skills` and `.fx/skills`, under the user home and the active project.
The `.codex/skills/.system` root is listed as managed. The scanner does not
recursively search the entire computer or execute anything from a skill.

Linked installations of the same physical file appear once, with their source
locations retained. Distinct skills with the same name receive unique invocation
tokens. User and project scope stay separate, and only the selected task's
workspace supplies project skills.

Invoke an enabled skill by starting a prompt with its displayed invocation,
for example `/find-skills help me locate a testing skill`. Its instructions
remain in that task's active history, including follow-up turns and daemon
restart. Rewinding past an invocation removes it from active history. Other
tasks do not inherit its invocation. The normal context limit still applies.

Enabled state is saved atomically in the Hiroshi data directory. It controls
explicit skill invocations supplied by Hiroshi. Installed agent CLIs may also
load their own configuration independently. Changing the supplied instructions
can require an explicit fresh native CLI conversation; existing history is
never silently rebound to different instructions.

Open SKILL.md uses the operating system's file association. Show in File Manager
opens the selected installation folder; Copy Path copies the real document path.
Delete asks before moving that installation to `.hiroshi-skill-trash` beside
the skills root. Restore it by moving the entry back to its original folder.
Deleting a linked installation moves the link, never its target. Managed system
skills cannot be removed here. Other installed copies remain discoverable.

Refresh observes new installations, edits and removals. The scanner bounds
directory entries, skill count and total bytes. Individual documents are limited
to 256 KiB; the rendered preview is limited to 64 KiB. Invalid YAML, unreadable
files and oversized documents produce diagnostics while valid skills remain
available. Stale document hashes and saved-setting revisions reject changes.

Tests use temporary user/project roots, actual symlinks or junctions, a real
daemon and a loopback model transport. `bun run test:skills` drives a real source
or packaged Windows window and verifies discovery, Markdown, filters, saved
toggles, cancellation and reversible removal. No test opens external editors or
removes the user's installed skills.
