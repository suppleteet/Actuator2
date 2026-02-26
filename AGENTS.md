# AGENTS.md - Actuator2 Team Workflow

This repo uses role-based parallel agent development.

## Roles

- ArchitectAgent: owns schema, interfaces, invariants, and cross-system contracts.
- RuntimeAgent: owns rig graph, physics runtime, simulation lifecycle.
- InteractionAgent: owns WebXR input, tools, selection, and in-scene UX.
- AnimationAgent: owns recording, timeline, playback, channel blending.
- QAAgent: owns tests, perf baselines, validation checklists, release gates.

## Global Rules

- Keep PRs small and vertical (target 1-3 focused concerns per PR).
- Never bypass contracts in `docs/contracts`.
- If a contract must change, ArchitectAgent updates contract first in a dedicated PR.
- Preserve deterministic behavior for save/load, playback, and mode transitions.
- Maintain browser + desktop fallback behavior unless explicitly scoped out.
- Strict continuity is required for migration work. Follow `docs/STRICT_CONTINUITY.md` for task kickoff, handoffs, and closure.

## Branching

- `main`: protected integration branch.
- `feat/<role>/<scope>` for feature work.
- `fix/<role>/<scope>` for bug fixes.
- `chore/<scope>` for non-functional updates.

## Required PR Inputs

- Problem statement and scope boundaries.
- Contract impact (`none` or explicit file references).
- Test evidence (unit/integration/manual XR checklist).
- Performance impact summary.
- Handoff notes for downstream roles.

## Ownership Boundaries

- ArchitectAgent approves schema/interface changes.
- QAAgent approves release gates and perf regressions.
- RuntimeAgent + InteractionAgent coordinate on tool/physics interaction points.
- AnimationAgent coordinates with RuntimeAgent on transform ownership during playback.

## Merge Gate

No PR merges unless:
- CI checks pass.
- Contract compliance is confirmed.
- Checklist in `docs/checklists/PR_CHECKLIST.md` is complete.
