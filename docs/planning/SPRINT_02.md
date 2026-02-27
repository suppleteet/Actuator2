# Sprint 02 - Multi-Rig + Skinning Foundations

## Sprint Goal
Enable multi-rig scenes for puppeteering workflows and ship first-pass skinning/deformation foundations (closest capsule binding + delta mush integration).

## Status
- Engineering scope complete on 2026-02-27.
- Remaining gate: final manual XR desktop checklist sign-off (if required before merge).

## Task Board

1. A-006 ArchitectAgent
- Define multi-rig scene contract updates (`characters[]` usage, selection IDs across rigs, rig ownership boundaries during tools).
- Acceptance: contract docs clearly define deterministic behavior for multiple rigs in a scene.

2. R-005 RuntimeAgent
- Add support for multiple actuator rigs in one scene (load/store/runtime graph + stable IDs).
- Acceptance: user can create/edit/select actuators across more than one rig without ID collisions or graph corruption.

3. I-005 InteractionAgent
- Make marquee selection available while any tool is active.
- Acceptance: drag-box selection works in `select/translate/rotate/scale` modes and preserves deterministic selected ID ordering.

4. I-006 InteractionAgent
- Update camera inputs: middle mouse drag + scroll wheel work without requiring `Alt`.
- Acceptance: pan/zoom controls function without modifier keys and do not conflict with gizmo interactions.

5. I-007 InteractionAgent
- Add actuator type dropdown for creation workflow (default `capsule`).
- Acceptance: create action uses selected type; default remains `capsule` on load/new session.

6. I-008 InteractionAgent + RuntimeAgent
- Improve marquee hit logic to select objects intersecting the marquee by visible bounds/pixels, not just projected centers.
- Acceptance: partial object coverage inside marquee selects the object reliably.

7. I-009 InteractionAgent + RuntimeAgent
- Multi-select transform behavior: apply current transform tool independently per selected object (chain curl effect on rotate).
- Acceptance: rotating multiple chain elements rotates each around its own local/object basis as specified, with stable deterministic result.

8. R-006 RuntimeAgent + AnimationAgent
- Begin skinning pipeline: bind vertex weights to nearest surface point associated with closest physics capsule.
- Acceptance: initial bind data generated and stored deterministically for Chad test mesh.

9. N-004 AnimationAgent + RuntimeAgent
- Integrate delta mush deformer and hook it into skinned mesh update path.
- Acceptance: delta mush pass runs on skinned output and can be toggled/configured for baseline validation.

10. Q-005 QAAgent
- Add test coverage for multi-rig selection/transform determinism and skinning bind determinism.
- Acceptance: automated tests pass for multi-rig + skinning baseline behaviors.

11. Q-006 QAAgent
- Execute and update manual checklist for Sprint 02 scope.
- Acceptance: `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 02 evidence and sign-off notes for multi-rig, marquee, controls, and skinning/deformer baseline.

## Exit Criteria
- Multiple actuator rigs operate in one scene with stable deterministic IDs/state.
- Marquee selection works across active tools and supports object/bounds inclusion.
- Multi-select transforms apply independently per object for expected chain behavior.
- Skin binding baseline (closest capsule / surface mapping) is running and deterministic.
- Delta mush deformer is integrated in runtime path.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback intact.
- Playback/timeline deepening is deferred to Sprint 03.
