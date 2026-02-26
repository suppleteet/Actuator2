# Next Steps (Post-Baseline Lock)

This file defines the immediate execution sequence after locking Unity source baseline `30c6ea7`.

## 1) Kickoff Task (Required)

Start with Sprint task `R-001` (`RuntimeAgent`) from [SPRINT_00.md](/c:/Projects/Actuator2/docs/planning/SPRINT_00.md):

- Goal: initialize TypeScript + Vite + React + R3F + Rapier app shell.
- Acceptance: app boots and renders a basic 3D scene.
- Contract impact: `none` (implementation only).

Kickoff checklist (Strict Continuity):

- Scope and non-goals written before coding.
- Contract refs explicitly listed (`docs/contracts/*` read-only for this task).
- Validation method defined (build + local run evidence).

## 2) Parallel Prep Tasks

Run these while `R-001` is in progress:

- `A-001` ArchitectAgent: finalize schema examples in [SCENE_SCHEMA.md](/c:/Projects/Actuator2/docs/contracts/SCENE_SCHEMA.md).
- `A-002` ArchitectAgent: finalize mode/tool event taxonomy in [MODE_TOOL_STATE.md](/c:/Projects/Actuator2/docs/contracts/MODE_TOOL_STATE.md).

These reduce rework before runtime/interaction features start.

## 3) Then Execute Vertical Slice

After `R-001` merges:

- `I-001` WebXR entry + desktop fallback controls.
- `R-002` in-memory actuator prototype with stable IDs.
- `I-002` selection highlight + transform affordance.
- `N-001` recorder stub + deterministic playback clock.
- `Q-001` test runner + baseline contract tests.

## 4) Required Handoff + Close-Out

For each task:

- Publish handoff note using [HANDOFF_TEMPLATE.md](/c:/Projects/Actuator2/docs/handoffs/HANDOFF_TEMPLATE.md).
- Complete [PR_CHECKLIST.md](/c:/Projects/Actuator2/docs/checklists/PR_CHECKLIST.md).
- Include explicit contract impact (`none` or file list).

## 5) Out-of-Scope Guardrail

Do not migrate or replicate post-baseline feature deltas (pin targets, spring-joint experiments, extra puppet scenes) unless added as explicit scoped tasks.
