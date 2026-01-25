# status-inject

Injects pre-fetched system status into agent context at bootstrap time.

## Purpose

Reduces token usage by providing the agent with pre-computed status information
instead of having it gather this data during conversation. The status includes:

- Git repository status (branch, uncommitted files, ahead/behind origin)
- Service health (n8n, OpenAI, Anthropic, etc.)
- Custom endpoint health checks

## How It Works

1. The **prefetch worker** runs on a timer (default: every 60s)
2. It collects status via shell commands and HTTP requests (no AI model used)
3. Status is written to `<workspace>/.status-cache.json`
4. This hook injects the cached status as `STATUS.md` at bootstrap time
5. The agent sees the status in its context without making any tool calls

## Configuration

```json5
{
  "hooks": {
    "status-inject": {
      "enabled": true,
      "staleTtlMs": 120000  // Reject cache older than 2 minutes
    }
  },
  "prefetch": {
    "enabled": true,
    "intervalMs": 60000,
    "git": {
      "enabled": true,
      "repoPath": "~/myproject"
    },
    "services": ["n8n", "openai"],
    "endpoints": ["https://api.example.com/health"]
  }
}
```

## Output Format

The injected `STATUS.md` looks like:

```markdown
# System Status (2026-01-24 10:30:00 UTC)

## Git Repository
- Branch: `main` | 2 uncommitted | in sync
- Last: `abc1234` "Fix auth bug" (2h ago)

## Services
- n8n: OK (45ms)
- openai: OK (120ms)

## Endpoints
- https://api.example.com/health: OK (23ms)
```

## Requirements

- Prefetch worker must be running (`prefetch.enabled: true`)
- Status cache must exist and be fresh (not older than `staleTtlMs`)
- Hook must be enabled (`hooks.status-inject.enabled: true`)
