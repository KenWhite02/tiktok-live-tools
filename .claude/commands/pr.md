---
description: Create or update a draft PR from your changes — conventional branch & commits off main, PR into the KenWhite02 fork
argument-hint: [optional context]
allowed-tools: Bash(git status:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git merge-base:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git --no-pager log:*), Bash(git --no-pager diff:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr create:*), Bash(gh pr edit:*), Bash(rm -f /tmp/tiktok-live-tools-pr-body.md)
---

# /pr — Create or update a draft PR from your changes

Run the `/pr` workflow below in order. Optional user context: $ARGUMENTS

**Repo:** this is a fork. `origin` = `KenWhite02/tiktok-live-tools` (ours), `upstream` = `Arifzyn19/tiktok-live-tools` (the original author). `gh` defaults to `upstream`, so **every `gh pr` command must pass `--repo KenWhite02/tiktok-live-tools`** — PRs never go to the author's repo. The base branch is `main`.

## Step 1 — Pre-flight (confirm, don't auto-run)

Present these options to the user:

- **[1] Yes, pre-flight passed** — continue to Step 2
- **[2] No, not yet** — show `pnpm exec tsc --noEmit -p . && bridge/.venv/bin/python -m py_compile bridge/server.py bridge/config.py`, wait for them to confirm it's done, then restart from Step 1

## Step 2 — Branch handling

Get current branch: `git rev-parse --abbrev-ref HEAD`

### If on `main`

1. `git status --porcelain` — if empty, stop: "No changes detected. Nothing to commit."
2. From the paths in `git status --porcelain`, pick the most representative **scope**. For paths under `src/`, use the segment right after `src/`: e.g. `src/services/QueueService.ts` → scope `services` (or a sharper domain like `queue`, `player`, `search` when one service dominates), `src/commands/skip.ts` → `commands`, `src/overlay/` → `overlay`. Outside `src/`: `bridge/` → `bridge`, `start.sh` → `scripts`, `README.md` → `docs`, `.claude/` → `config`. No map, no table — just derive it from the directory structure.
3. Pick a **type** (= conventional-commit type): feat, fix, refactor, chore, docs, test, perf.
4. Branch name = `<type>/<short-kebab-description>`.
   - ✅ `feat/stream-overlay`, `fix/queue-replaces-song`, `refactor/bridge-reconnect`
   - ❌ Never generic names like `chore/changes`.
5. `git checkout -b <branch-name> main` then `git add -A`.

### If on an existing feature branch

1. Stay on it. Verify it descends from main: `git merge-base --is-ancestor main HEAD` (warn if not, continue).
2. `git add -A`.

## Step 3 — Commit

- If nothing staged: stop with "No changes to commit."
- Never commit secrets: if `.env` or `bridge/.env` shows up as staged, unstage it and warn (both are git-ignored, so this means `.gitignore` was changed).
- Inspect: `git --no-pager diff --cached --name-status` and `--shortstat`.
- Write a Conventional Commit `<type>(<scope>): <subject>` (imperative, lowercase subject), e.g. `fix(queue): keep the current song when clearing the queue`.
- `git commit -m "<message>"`.

## Step 4 — Push and create/update PR

Present a single combined option to the user:

- **[1] Yes, push & create/update PR** — runs push, collects context, generates PR body, creates or updates the draft PR, then reports the result.
- **[2] No, stop here** — stop and tell the user they can re-run `/pr` when ready

### On yes — Step 4a: Push

Run `git push -u origin <branch-name>`.

### Step 4b — Collect PR context (all commits, minimal tokens)

Run only:

- `git --no-pager log main..HEAD --format="%s%n%b"`
- `git --no-pager diff --name-status main...HEAD`
- `git --no-pager diff --shortstat main...HEAD`

These cover the **entire** branch, so re-running regenerates the description from all commits.

### Step 4c — Generate PR content

Write the body to the fixed temp path `/tmp/tiktok-live-tools-pr-body.md` (outside the repo, stable across commands) — **never** create `pr-body.md` in the project.

**Title:** one Conventional Commit line summarizing the whole PR, e.g. `feat(overlay): show queue and bot replies on stream`.

**Body template:**

```markdown
## Summary

<3–5 sentences: intent and impact>

## Changes

### ✨ New Features

| Feature | Description |
| ------- | ----------- |

### 🔧 Enhancements

| Area | Description |
| ---- | ----------- |

### 🐛 Bug Fixes

- <fix>

### 📦 Dependency Updates

- None

## Breaking Changes

- [ ] Yes — describe migration (e.g. new `.env` / `bridge/.env` settings)
- [x] No

## Testing

- [ ] Type check passes (`pnpm exec tsc --noEmit -p .`)
- [ ] Bridge compiles (`python -m py_compile bridge/*.py`)
- [ ] Tested on a live stream (`./start.sh`)
```

**Auto-populate the Changes tables from `git diff --name-status main...HEAD`:**

- Files with status `A` (added) → populate **✨ New Features** table. Derive the feature name from the file path (e.g. `src/services/OverlayService.ts` → "Stream overlay").
- Files with status `M` (modified) → populate **🔧 Enhancements** table. Derive the area from the scope (e.g. `src/commands/` → area `commands`, `bridge/` → area `bridge`).
- Files with status `D` (deleted) → mention briefly in the Summary.
- New settings in `.env.example` or `bridge/.env.example` → call them out in **Breaking Changes** so they get copied into the real `.env` files.
- **Omit any empty subsection** so the PR body stays clean.

Rules: commit messages are the source of truth; keep it reviewer-focused (what / why / how tested).

### Step 4d — Create or update the PR

Check for an existing open PR:
`GH_PAGER=cat gh pr list --repo KenWhite02/tiktok-live-tools --head <branch-name> --state open --json number,url --jq '.[0]'`

- Exists → `gh pr edit <number> --repo KenWhite02/tiktok-live-tools --title "<title>" --body-file /tmp/tiktok-live-tools-pr-body.md`
- None → `gh pr create --repo KenWhite02/tiktok-live-tools --draft --title "<title>" --body-file /tmp/tiktok-live-tools-pr-body.md --base main --head <branch-name>`

## Step 5 — Report

Delete the temp body file (`rm -f /tmp/tiktok-live-tools-pr-body.md`) and report: ✅ PR ready — Branch / Title / URL.
