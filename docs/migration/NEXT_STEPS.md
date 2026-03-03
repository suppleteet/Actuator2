# Next Steps (Post-Baseline Lock)

This file defines the immediate execution sequence after locking Unity source baseline `30c6ea7`. **Note:** Sprint and handoff details from the previous workflow are in `docs/archive/codex-era/`. Active workflow is Cursor + `docs/PROJECT.md` and `.cursor/rules/`.

## 1) Kickoff Task (Required)

Start with runtime bootstrap (previously tracked as R-001):

- Goal: initialize TypeScript + Vite + React + R3F + Rapier app shell.
- Acceptance: app boots and renders a basic 3D scene.
- Contract impact: `none` (implementation only).

Kickoff checklist (Strict Continuity):

- Scope and non-goals written before coding.
- Contract refs explicitly listed (`docs/contracts/*` read-only for this task).
- Validation method defined (build + local run evidence).

## 2) Parallel Prep Tasks

- Finalize schema examples in `docs/contracts/SCENE_SCHEMA.md`.
- Finalize mode/tool event taxonomy in `docs/contracts/MODE_TOOL_STATE.md`.

## 3) Then Execute Vertical Slice

- WebXR entry + desktop fallback controls.
- In-memory actuator prototype with stable IDs.
- Selection highlight + transform affordance.
- Recorder stub + deterministic playback clock.
- Test runner + baseline contract tests.

## 4) Required Close-Out

For each task/PR:

- Complete `docs/checklists/PR_CHECKLIST.md`.
- Include explicit contract impact (`none` or file list). For larger work, add a short note (what changed, why, validation, follow-ups) in the PR or under `docs/`.

## 5) Out-of-Scope Guardrail

Do not migrate or replicate post-baseline feature deltas (pin targets, spring-joint experiments, extra puppet scenes) unless added as explicit scoped tasks.
