# Actuator2 — Project Context

Single source of truth for what this repo is and how to work on it. Re-derived for Cursor-native development.

## What This Is

- **Product:** Browser-based WebXR reimplementation of the legacy Unity **Actuator** tool (puppet/rig authoring, animation, XR interaction).
- **Stack:** TypeScript, Vite, React, React Three Fiber (R3F), Rapier physics. Runs in browser with desktop + VR fallback.
- **Goal:** Feature and behavior parity with the Unity baseline where scoped; deterministic save/load, playback, and mode transitions.

## Unity Baseline (Reference Only)

- **Source repo:** `c:\Projects\Actuator` (different directory; not part of this workspace).
- **Locked commit:** `30c6ea7` — "initial project push", 2026-01-28. Post-baseline Unity changes are out of scope unless explicitly added.
- **Scope:** `Assets/Actuator` is primary. See `docs/migration/SOURCE_BASELINE.md` and `docs/migration/DEPENDENCY_FILTER_30c6ea7.md` for what to reference and what to ignore.
- **Use:** Read Unity C#/prefabs for behavior and UX when implementing or fixing; reimplement in this repo’s stack. Do not copy Unity code into this repo.

## Contracts (Source of Truth for Behavior)

All behavior and persistence must align with:

- `docs/contracts/SCENE_SCHEMA.md` — scene document, envelope, save/load, imported meshes.
- `docs/contracts/MODE_TOOL_STATE.md` — workflow modes (Rigging, Animation, Puppeteering), tool state, transitions.
- `docs/contracts/RIG_RUNTIME.md` — actuator graph, runtime ownership, physics.
- `docs/contracts/TIMELINE_RECORDING.md` — recording and playback semantics.

Never bypass contracts. If behavior or schema must change, update the contract first (in a dedicated change), then implement.

## Current Codebase Shape

- **App entry / state:** `src/App.tsx`, `src/main.tsx`.
- **Domain:** `src/domain/sceneDocument.ts`, `src/app/types.ts`, `src/app/actuatorModel.ts`.
- **Runtime:** `src/runtime/` — workflow, scene persistence, mesh import, physics authoring/presets, simulation transitions.
- **Interaction:** `src/interaction/` — input, XR tools, draw tool, focus framing, trigger bridge; desktop + XR providers.
- **Animation:** `src/animation/` — recorder, bake cache, export pipeline.
- **Rendering / UX:** `src/app/components/` — SceneContent, PlaybackDriver, XRToolVisuals, ViewCube, etc.
- **Skinning:** `src/skinning/` — delta mush, closest-capsule binding.
- **Tests:** `src/tests/` — contract, workflow, scene persistence, mesh import, bake/export, XR tools, etc.

## Invariants

- Deterministic: save/load, playback, and mode transitions must be deterministic.
- Browser + desktop fallback: no WebXR-only behavior without a desktop fallback unless explicitly scoped.
- Small PRs: one to three focused concerns per PR.
- Contract impact: every PR states contract impact (`none` or list of contract files).

## Build and Test

- `npm run build` — must pass.
- `npm test` (or `npm test -- --run`) — must pass. Add/update tests for behavior changes.
- GitHub Pages: set `VITE_BASE_PATH=/<repo-name>/` before build. See `.github/workflows/sprint-pages.yml`.

## Migration and History

- Planning and handoff history from the previous agent workflow is in `docs/archive/codex-era/` (sprints, handoffs, checklists). Use for context; active workflow is Cursor + this doc and `.cursor/rules/`.
