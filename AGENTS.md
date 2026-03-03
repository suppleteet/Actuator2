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

## Cursor Cloud specific instructions

- **Single service**: This is a 100% client-side SPA with no backend, database, or external services. The only service is the Vite dev server.
- **Dev server**: `npm run dev` starts Vite on `http://localhost:5173`. Hot module replacement is enabled.
- **Tests**: `npm test` runs all Vitest tests (10 files, 38 tests). Tests are pure logic with no external dependencies.
- **Build**: `npm run build` runs `tsc -b && vite build`. TypeScript type-checking runs first, then Vite bundles.
- **No linter configured**: There is no ESLint/Prettier setup in this repo. Skip lint checks.
- **No environment variables needed** for local dev. Only `VITE_BASE_PATH` matters for GitHub Pages builds.
- **Camera controls**: Alt+LMB orbit, MMB pan, RMB zoom, Shift+wheel for draw radius. These are displayed in the app header bar.
