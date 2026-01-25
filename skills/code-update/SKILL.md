---
name: code-update
description: Self-update clawdbot-burt codebase. Pull latest, make changes, commit locally, show diff for review, push on approval.
metadata: {"clawdbot":{"emoji":"🔄","requires":{"bins":["git"]}}}
---

# Code Update Skill

Enables chat-driven code modifications to the clawdbot-burt repository with a safe approval workflow.

## Workflow

### 1. Pull Latest Code

Before making any changes, pull the latest code:

```bash
cd ~/clawdbot-burt && git fetch origin && git pull --rebase origin main
```

If there are merge conflicts, **stop and notify the user**.

### 2. Make Code Changes

Use the `edit` and `write` tools to modify files. For complex changes:

- Read the file first to understand context
- Make targeted edits (prefer `edit` over full `write`)
- Keep changes minimal and focused

### 3. Stage and Commit

After making changes:

```bash
cd ~/clawdbot-burt && git add -A && git commit -m "descriptive commit message"
```

Commit messages should be:
- Concise but descriptive
- Follow conventional commits style (feat:, fix:, chore:, etc.)
- Reference what changed and why

### 4. Show Diff for Review

Always show the user what changed before asking for approval:

```bash
cd ~/clawdbot-burt && git diff HEAD~1 --stat && echo "---" && git diff HEAD~1
```

### 5. Wait for Approval

Tell the user:
> "Changes committed locally. Review the diff above. Say **'push it'** to push to origin, or **'revert'** to undo."

Listen for approval phrases:
- "push it"
- "ship it"
- "approve"
- "go ahead"
- "lgtm"

Listen for rejection phrases:
- "revert"
- "undo"
- "cancel"
- "no"

### 6. Push on Approval

On approval:

```bash
cd ~/clawdbot-burt && git push origin HEAD
```

On rejection:

```bash
cd ~/clawdbot-burt && git reset --hard HEAD~1
```

## Safety Rules

1. **Never force-push** - Use `git push`, never `git push --force`
2. **Never push directly to main/master** without explicit user confirmation
3. **Always show diff** before asking for approval
4. **Stop on conflicts** - If merge conflicts occur, notify user and wait
5. **Single commit at a time** - Don't batch multiple unrelated changes
6. **Preserve formatting** - Match existing code style

## Example Conversations

### Simple File Edit

**User:** "Update the greeting in SOUL.md to say Hello World"

**Burt:**
1. Pulls latest code
2. Reads SOUL.md
3. Edits the greeting
4. Commits: `chore: update SOUL.md greeting`
5. Shows diff
6. Waits for "push it"

### Bug Fix

**User:** "Fix the typo in src/agents/model-fallback.ts line 42"

**Burt:**
1. Pulls latest
2. Reads the file
3. Fixes typo
4. Commits: `fix: typo in model-fallback.ts`
5. Shows diff
6. Waits for approval

### Multi-File Change

**User:** "Add a new config option for token tracking"

**Burt:**
1. Pulls latest
2. Identifies files to modify (types, schema, etc.)
3. Makes coordinated changes
4. Commits: `feat: add quotaTracking config option`
5. Shows diff
6. Waits for approval

## Branch Handling

By default, work on the current branch. If user requests a specific branch:

```bash
# Switch to existing branch
git checkout feature-branch

# Or create new branch
git checkout -b new-feature-branch
```

Always confirm the current branch before pushing:

```bash
git branch --show-current
```

## Repository Path

Default repository path: `~/clawdbot-burt`

This can be overridden by the user in conversation.
