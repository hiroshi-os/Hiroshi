# Task permission modes

The composer permission picker controls Hiroshi-owned model tool calls. The
selection belongs to the task, survives daemon/window restarts, and synchronizes
between windows. New and upgraded tasks default to Supervised. Saving uses a
revision check; a stale window must reload its task rather than overwrite a
newer selection.

| Mode | Behavior |
| --- | --- |
| Supervised | Ask before tools run, including commands and file changes. Exact remembered approvals still apply unless policy requires asking every time. |
| Auto-accept edits | Automatically allow bounded ordinary workspace file edits. Commands, other actions, protected paths and larger edits still ask. |
| Auto | Use the task's selected model as an independent action reviewer for bounded ordinary file actions. Only an exact structured approval can allow an action. Commands and sensitive/unknown actions still ask. |
| Full access | Allow model tools, including commands and edits, without the default approval question. Explicit user/repository restrictions still apply. |

Modes supply the default gate. Explicit `tools.json` rules, repository asks or
denials, and `alwaysAsk` remain binding. An operator's pending question is not
silently answered by changing the mode. A remembered denial remains binding.
Changing the mode cancels an in-progress review; queued automatic tools recheck
the task revision and policy immediately before their effect. A revoked grant
fails without running the tool. Already running tools are cancelled through the
existing interrupt control, not by selecting a different permission mode.

Routine file actions are restricted to registered read/edit tools and real
workspace paths. Edits must be at most 16 KiB. Hidden configuration, repository
internals, instruction files, credential/key files and escaping symlinks require
operator approval. Full access retains the tool's own workspace checks and all
process, memory, cancellation and deadline limits.

Auto reviews use a separate request with no tools and at most 128 output tokens,
a 2 KiB response limit, and a 20-second deadline inside the shared governor.
They can incur model charges; reported review usage is included in Usage. The
request and file contents are untrusted data. Malformed output, tool requests,
missing credentials, timeout and provider failures fall back to a human question.
Review decisions are bound to the exact input, tool definition, workspace and
permission revision. Interrupted reviews are never replayed after restart.

Installed CLI adapters currently provide response-only conversations. Selecting
a mode does not enable their native coding tools or change the CLI's global
permissions; that requires the separate CLI tool/approval bridge tracked in #64.
Commands typed directly in Hiroshi's terminal are explicit user commands and
continue through the existing bounded command runner.

Protocol 15 and schema migration 12 add task access state and review evidence;
existing conversations and tool results remain intact.
