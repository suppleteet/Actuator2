# Sprint 07 - Workflow Modes + Scene IO + Import/Export Foundations

Status: completed (2026-03-03)

## Sprint Goal
Establish production-facing scaffolding for workflow separation (`Rigging`, `Animation`, `Puppeteering`), scene save/load, mesh import, and baked simulation export lanes without regressing deterministic authoring behavior.

## Inputs from Previous Handoff
- Source handoff:
  - [Q-015_SPRINT06_VALIDATION_AND_CLOSEOUT.md](/c:/Projects/Actuator2/docs/handoffs/Q-015_SPRINT06_VALIDATION_AND_CLOSEOUT.md)
- Carry-over constraints:
  - Selection/draw/transform behavior from Sprint 06 and follow-up fixes must remain deterministic.
  - Mirror baseline remains world `X=0`.
  - Root actuator invariants (root preset immutability and root ownership) must remain intact.
  - Browser + desktop fallback behavior must remain intact.

## Task Kickoff (Strict Continuity)
- Scope:
  - Add workflow scaffolding for `Rigging`, `Animation`, and `Puppeteering` with explicit transform ownership boundaries.
  - Add scene save/load scaffolding with versioned schema envelope and deterministic round-trip behavior.
  - Add mesh import scaffolding (file intake + normalization + scene integration seam).
  - Add baked simulation export scaffolding with format adapter architecture and at least one end-to-end baseline path.
- Unity baseline references (required for parity decisions):
  - Baseline lock: [SOURCE_BASELINE.md](/c:/Projects/Actuator2/docs/migration/SOURCE_BASELINE.md) (`30c6ea7`).
  - Workflow state references:
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Handlers/StateHandler.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Objects/ActuatorPuppet.cs`
  - Scene/menu/import references:
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Handlers/SceneHandler.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/UI/MainMenu.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/UI/ImportMeshDialog.cs`
  - Export reference (baseline/editor-only seam):
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Mandel/SaveActuatorRig.cs`
- Non-goals:
  - Full parity of Unity runtime menus or all tool behaviors for each workflow mode.
  - High-fidelity final exporters for every DCC target in one sprint.
  - Contract redesign outside workflow/io/import/export scope.
- Role owners:
  - ArchitectAgent: workflow/io/export contract definitions and compatibility policy.
  - RuntimeAgent: deterministic serializer/deserializer, import normalization, and bake capture services.
  - InteractionAgent: workflow switcher UX + file import/export interactions.
  - AnimationAgent: baked simulation capture + export adapter mapping.
  - QAAgent: deterministic round-trip tests + manual validation evidence.
- Contract references:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/SCENE_SCHEMA.md`
  - `docs/contracts/RIG_RUNTIME.md`
  - `docs/contracts/TIMELINE_RECORDING.md`
- Validation method:
  - `npm test`
  - `npm run build`
  - Save/load golden round-trip fixtures.
  - Manual desktop + XR checklist updates for workflow/mode and file operations.

## Task Board

1. A-011 ArchitectAgent
- Define workflow-mode contract updates for `Rigging`, `Animation`, and `Puppeteering` transform ownership and allowed mutations.
- Define scene IO envelope (versioning, compatibility policy, migration hooks).
- Define export job contract (input clip/cache expectations + format capability matrix).
- Acceptance:
  - Contract impact is explicit and merged before downstream implementation PRs.
  - Deterministic ownership rules are documented for mode transitions.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

2. I-019 InteractionAgent
- Add top-level workflow switcher scaffolding in app UI with deterministic transitions.
- Add mode-aware tool gating scaffolding for unsupported actions per workflow.
- Acceptance:
  - Workflow transitions are visible, deterministic, and do not silently mutate unrelated state.
  - Existing rigging flow remains usable with no regression in desktop fallback.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

3. R-011 RuntimeAgent
- Add scene persistence scaffolding service:
  - serialize current scene into versioned envelope
  - deserialize/load with deterministic ID/state restoration
  - migration entry point for future schema upgrades
- Acceptance:
  - Save->Load round-trip preserves deterministic scene identity and transform state.
  - Unsupported/invalid payloads fail with explicit error surfaces.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

4. I-020 InteractionAgent + RuntimeAgent
- Add mesh import scaffolding:
  - file selection/drag-drop intake lane
  - format detection and normalization seam
  - deterministic integration into scene/rig context
- Acceptance:
  - At least one baseline format path imports successfully end-to-end.
  - Unsupported formats produce deterministic, user-visible failure messaging.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

5. N-005 AnimationAgent + RuntimeAgent
- Add baked simulation capture scaffolding:
  - sample/capture transforms from simulation over frame range
  - store in deterministic bake cache structure
  - expose bake artifacts to export pipeline
- Acceptance:
  - Same input sim + frame range yields identical bake cache output.
  - Capture does not mutate authoring rig source state.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

6. N-006 AnimationAgent + RuntimeAgent + InteractionAgent
- Add export scaffolding for baked simulation:
  - export adapter interface + capability registry
  - baseline end-to-end export for one standard DCC interchange format
  - UI/command surfaces for export job creation and status
- Acceptance:
  - One baseline export path produces a valid file artifact from baked cache.
  - Non-implemented formats are reported via explicit capability/status messages.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

7. Q-016 QAAgent
- Add automated test coverage for:
  - workflow transition determinism
  - save/load round-trip determinism
  - import normalization + failure paths
  - bake/export pipeline contract behavior
- Acceptance:
  - `npm test` passes with deterministic coverage for new scaffolding seams.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

8. Q-017 QAAgent
- Extend manual validation checklist for Sprint 07:
  - workflow switch behavior (Rigging/Animation/Puppeteering)
  - save/load behavior and error handling
  - import/export UX and known format limitations
- Acceptance:
  - `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 07 evidence and limits.
- Status: completed
- Handoff: `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`

## Exit Criteria
- Workflow mode scaffolding exists with explicit ownership and deterministic transitions.
- Scene save/load round-trip scaffolding is operational and versioned.
- Mesh import scaffolding and at least one baseline import path are operational.
- Baked simulation export scaffolding exists with one baseline format output path.
- Automated and manual validation cover core deterministic and failure-path behavior.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback behavior intact.
- Prefer explicit capability declarations over silent partial support for file formats.

## Close-out
- Automated validation:
  - `npm test` passed (55 tests).
  - `npm run build` passed.
- Manual validation artifacts:
  - Sprint 07 checklist evidence added to `docs/checklists/XR_DESKTOP_VALIDATION.md`.
- Handoff:
  - `docs/handoffs/A-011_I-019_R-011_I-020_N-005_N-006_Q-016_Q-017_SPRINT07_EXECUTION.md`.
