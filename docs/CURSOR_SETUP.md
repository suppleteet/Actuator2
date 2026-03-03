# Cursor setup (Actuator2)

This project uses **Cursor** with repo-defined rules and docs. There is no Codex or other agent config in the repo.

## What’s in place

- **`.cursor/rules/`** — Three rules that Cursor applies:
  - **project-context** (always): Project identity, Unity baseline, link to `docs/PROJECT.md`, invariants.
  - **contracts** (when editing `src/**` or `docs/contracts/**`): Respect contracts; change contracts before implementation when behavior/schema must change.
  - **workflow** (always): Scope, contract impact, tests, PR checklist.
- **`docs/PROJECT.md`** — Single source of truth: what the app is, baseline, contracts, codebase shape, build/test.
- **`AGENTS.md`** — Roles and where the agent gets instructions (rules, PROJECT.md, contracts, checklist).

## How to work

1. Open the repo in Cursor. The rules load automatically.
2. For a task: state scope and (if relevant) which contract(s) apply. The agent will use PROJECT.md and contracts.
3. Before merge: satisfy `docs/checklists/PR_CHECKLIST.md`, and ensure contract impact is stated in the PR.

## Old workflow docs

The previous agent workflow (sprints, handoffs, strict continuity doc) is archived under `docs/archive/codex-era/`. Use it for history only; the active workflow is this file + `.cursor/rules/` + `docs/PROJECT.md`.
