---
name: morgen
description: Morgen Calendar CLI for calendars, events, tasks, and integrations.
homepage: https://morgen.so
metadata: {"clawdbot":{"emoji":"📅","requires":{"bins":["morgen"]}}}
---

# morgen

Use `morgen` for Morgen Calendar, Events, Tasks, and Account management.

## Setup

Get your API key from [Morgen Settings](https://platform.morgen.so/settings/api).

```bash
morgen auth set <API_KEY>
morgen auth status
```

## Common Commands

### Authentication
- `morgen auth set <API_KEY>` — Save API key to `~/.config/morgen/config.json`
- `morgen auth status` — Check if API key is configured

### Accounts
- `morgen accounts list` — List all connected accounts (Google, Outlook, etc.)

### Calendars
- `morgen calendars list` — List all calendars with ID, name, and account

### Events
- `morgen events today` — Quick view of today's events (all calendars)
- `morgen events today --calendar cal_123` — Today's events for specific calendar
- `morgen events list --calendar <ID> --start <ISO> --end <ISO>` — List events in range
- `morgen events create --calendar <ID> --title "Meeting" --start 2024-01-15T10:00:00Z --duration PT1H`
- `morgen events delete --id <ID> --calendar <ID> --account <ID>`

### Tasks
- `morgen tasks list` — List all tasks
- `morgen tasks list --limit 10` — List up to 10 tasks
- `morgen tasks create --title "Review PR" --due 2024-01-15 --priority 1`
- `morgen tasks close --id task_123` — Mark task complete
- `morgen tasks delete --id task_123` — Delete task

## Options

- `--json` — Output as JSON (for scripting)

## Examples

```bash
# Setup
morgen auth set sk_live_abc123xyz

# Quick check: what's on today?
morgen events today

# List calendars to get IDs
morgen calendars list

# Get events for a specific week
morgen events list --calendar cal_abc123 --start 2024-01-15 --end 2024-01-22

# Create an event
morgen events create \
  --calendar cal_abc123 \
  --title "Team Standup" \
  --start 2024-01-15T09:00:00Z \
  --duration PT30M \
  --description "Daily sync"

# Create a high-priority task
morgen tasks create \
  --title "Ship feature" \
  --due 2024-01-20T17:00:00Z \
  --priority 1

# Mark task done
morgen tasks close --id task_xyz789

# JSON output for scripting
morgen events today --json | jq '.[] | .title'
```

## Duration Format

Durations use ISO 8601 format:
- `PT30M` — 30 minutes
- `PT1H` — 1 hour
- `PT1H30M` — 1 hour 30 minutes
- `PT2H` — 2 hours

## Priority Levels

Tasks use priority 1-9 where:
- `1-3` — High priority (shown with ❗ indicator)
- `4-6` — Medium priority
- `7-9` — Low priority

## Notes

- Config stored at `~/.config/morgen/config.json`
- API base: `https://api.morgen.so/v3`
- Get API key: https://platform.morgen.so/settings/api
- Dates accept ISO 8601 format (e.g., `2024-01-15` or `2024-01-15T10:00:00Z`)
- `events today` fetches all calendars if `--calendar` is not specified
