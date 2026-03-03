# AGENTS.md — Cursor agent workflow

This repo uses **Cursor** for AI-assisted development. Workflow and context are defined in the repo; the agent follows them via `.cursor/rules/` and docs.

## Roles (ownership for planning and review)

When you assign or describe work, these roles clarify ownership:

- **Architecture:** Schema, interfaces, contracts in `docs/contracts/`. Contract changes happen first; implementation follows.
- **Runtime:** Rig graph, physics, simulation lifecycle, scene persistence, mesh import — `src/runtime/`, physics/simulation behavior.
- **Interaction:** WebXR input, tools, selection, in-scene UX — `src/interaction/`, input, XR tools, draw/select/gizmo.
- **Animation:** Recording, timeline, playback, bake/export — `src/animation/`, playback semantics.
- **QA:** Tests, validation checklists, release gates — `src/tests/`, `docs/checklists/`.

One PR can span roles; the point is to know who “owns” a given area for contract changes and review.

## Where the agent gets its instructions

- **Always-on context:** `.cursor/rules/` — project context, contracts, workflow (scope, contract impact, tests, checklist). No separate “strict continuity” doc; it’s in the rules and `docs/PROJECT.md`.
- **Single source of truth:** `docs/PROJECT.md` — what the project is, Unity baseline, contracts list, codebase shape, invariants, build/test.
- **Contracts:** `docs/contracts/` — SCENE_SCHEMA, MODE_TOOL_STATE, RIG_RUNTIME, TIMELINE_RECORDING. Never bypass; change contracts first if behavior/schema must change.
- **Checklist:** `docs/checklists/PR_CHECKLIST.md` — complete before merge.

## Branching

- `main`: protected.
- `feat/<scope>`, `fix/<scope>`, `chore/<scope>` for work. Role prefixes (e.g. `feat/runtime/...`) are optional.

## Merge gate

- CI passes (`npm run build`, `npm test`).
- Contract impact stated in PR.
- `docs/checklists/PR_CHECKLIST.md` completed.

Previous sprint/handoff history is in `docs/archive/codex-era/` for reference only.
