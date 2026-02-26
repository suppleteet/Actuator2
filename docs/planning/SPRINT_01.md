# Sprint 01 - Mesh + Rigging Foundations

Status: complete (2026-02-26)

## Sprint Goal
Establish a practical rigging loop by integrating the Chad model data and rendering a mesh-only test case in-scene while preserving deterministic actuator editing behavior.

## Task Board

1. A-003 ArchitectAgent
- Finalize persistence contract details for round-trip behavior (`required fields`, defaults, ordering notes).
- Acceptance: `SCENE_SCHEMA.md` explicitly defines save/load invariants and migration note format.

2. A-005 ArchitectAgent
- Define mesh-import constraints for Sprint 01 (`supported asset source`, mesh-only runtime behavior, material handling baseline).
- Acceptance: contract notes in `SCENE_SCHEMA.md` and handoff docs clearly define mesh-only integration boundary for Chad test case.

3. R-003 RuntimeAgent
- Integrate Chad source model assets into web runtime asset pipeline.
- Acceptance: FBX + texture/material source files are present in repo and load in runtime without console errors.

4. R-004 RuntimeAgent
- Render Chad mesh-only representation in scene (no playback coupling, no timeline requirements).
- Acceptance: mesh appears in viewport with material maps, remains stable during actuator create/select/transform operations.

5. I-003 InteractionAgent
- Keep rigging interactions stable while mesh is present (`selection`, gizmo operations, empty-space deselect).
- Acceptance: actuator authoring path remains usable and deterministic with Chad mesh visible.

6. Q-003 QAAgent
- Add/adjust tests for Chad mesh integration baseline and rigging stability with mesh loaded.
- Acceptance: `npm test` passes with updated coverage for mesh integration path.

7. Q-004 QAAgent
- Execute and update manual checklist for Sprint 01 mesh + rigging scope.
- Acceptance: `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 01 evidence for mesh visibility and rigging interactions.

## Exit Criteria
- Chad baseline model data is migrated into repository for runtime use.
- Scene renders Chad as mesh-only test case with mapped materials.
- Rigging interactions remain stable with mesh present.
- Automated and manual validation for mesh + rigging scope pass.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback intact.
- Playback enhancements are deferred to Sprint 02.

## Deferred Backlog
- Track deferred items in [BACKLOG.md](/c:/Projects/Actuator2/docs/planning/BACKLOG.md).
