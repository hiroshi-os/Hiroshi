# Background Automation & Cron Scheduler

Hiroshi runs non-blocking background tasks on time-delayed loops using an integrated Tokio scheduler.

## 1. Scheduler Setup (`config.toml`)
You can register automated tasks by adding `[[cron.tasks]]` blocks inside your configuration:

```toml
[[cron.tasks]]
name = "workspace_triage"
schedule = "0 0 * * *" # Every day at midnight
agent = "Architect"
prompt = "Read all files inside the workspace and generate a README.md summary summarizing our active state."

[[cron.tasks]]
name = "hourly_log_sync"
schedule = "0 * * * *" # Every hour
agent = "Developer"
prompt = "Ensure workspace logs are up to date."
```

## 2. Cron Schedule Format
Schedules use the standard 5-field cron parsing layout:
```text
"minute hour day-of-month month day-of-week"
```
- `*` matches all values.
- `*/N` matches step values (e.g. `*/5 * * * *` runs every 5 minutes).
- Exact numbers (e.g. `0 12 * * *` runs at 12:00 PM every day).

## 3. Automated Compaction Routine
Whenever a cron job runs, it automatically triggers:
1. **Daily Log Export**: Saves the session interactions of the current day to `~/.hiroshi/memory/YYYY-MM-DD.md`.
2. **Master Memory Compaction**: Prompts the LLM to summarize key architectural rules, configurations, and decisions made, appending them to the long-term context file at `~/.hiroshi/memory/MEMORY.md`.
