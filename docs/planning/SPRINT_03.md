# Sprint 03 - Physics Integration Foundations

Status: complete (2026-02-28)

## Sprint Goal
Ship the first deterministic physics authoring/runtime pipeline for actuators, including primitive data model, pivot semantics, and stable mode transitions.

## Task Kickoff (Strict Continuity)
- Scope:
  - Implement a physics runtime path for actuator primitives (capsule/sphere/box).
  - Introduce pivot semantics for primitives, with capsule default pivot at the first cap sphere center and optional center pivot mode.
  - Render and edit actuators by physics primitive dimensions, not mesh transform scale.
- Unity baseline references (required for parity decisions):
  - Baseline lock: [SOURCE_BASELINE.md](/c:/Projects/Actuator2/docs/migration/SOURCE_BASELINE.md) (`30c6ea7`).
  - Source inventory: [unity_inventory_30c6ea7.json](/c:/Projects/Actuator2/docs/migration/unity_inventory_30c6ea7.json).
  - Physics/object behavior reference scripts:
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Objects/Actuator.cs`
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Objects/ActuatorRig.cs`
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Objects/ActuatorRigEditor.cs`
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Utilities/ColliderExtensions.cs`
- Non-goals:
  - Manual per-actuator pivot tweaking UI (deferred to later sprint).
  - Draw tool UX and placement work (radius ring, desktop inside-mesh placement, mirror/snap behavior) deferred to Sprint 04.
  - Playback/timeline deepening (out of scope for this sprint).
- Role owners:
  - ArchitectAgent: contract updates and invariants.
  - RuntimeAgent: physics runtime lifecycle and primitive data flow.
  - QAAgent: deterministic tests and manual validation.
- Contract references:
  - `docs/contracts/SCENE_SCHEMA.md`
  - `docs/contracts/RIG_RUNTIME.md`
  - `docs/contracts/MODE_TOOL_STATE.md`
- Validation method:
  - Unit/integration tests (`npm test`), local build (`npm run build`), and manual XR/desktop checklist updates.

## Task Board

1. A-007 ArchitectAgent
- Define physics primitive + pivot contract changes in `SCENE_SCHEMA.md` and `RIG_RUNTIME.md`.
- Include capsule pivot defaults:
  - `capStart` (default, first sphere center)
  - `center` (optional mode)
- Include a deferred-compatible field for future manual pivot offsets.
- Acceptance:
  - Contracts define required fields, defaults, and deterministic serialization notes.
  - Migration note format is included if schema version or compatibility changes.

2. A-008 ArchitectAgent
- Finalize mode-state and runtime-contract details for physics lifecycle (`Rig`/`Sim` ownership and deterministic reset constraints).
- Acceptance:
  - Contract notes clearly separate authoring state from simulation state.
  - Deterministic transition expectations are explicit in contract docs.

3. R-007 RuntimeAgent
- Implement actuator physics system lifecycle in runtime (`Rig` authoring vs `Sim` execution) with deterministic reset behavior.
- Acceptance:
  - Physics can be enabled/disabled without graph corruption.
  - Repeated `Rig -> Sim -> Rig` transitions produce deterministic transforms for unchanged input state.

4. R-008 RuntimeAgent
- Implement primitive-driven actuator representation and editing pipeline:
  - non-uniform scale operations update primitive dimensions (`radius`, `height`, `size`) rather than persistent transform scale drift
  - primitive visualization remains available in desktop and XR
- Acceptance:
  - Primitive dimensions remain canonical in serialized state.
  - Visual output matches primitive values across desktop and XR.

5. Q-009 QAAgent
- Add automated tests for:
  - pivot default semantics
  - primitive dimension updates from non-uniform scale edits
  - deterministic physics transition behavior
- Acceptance:
  - `npm test` passes with new deterministic coverage.

6. Q-010 QAAgent
- Update manual validation checklist for Sprint 03 physics scope.
- Acceptance:
  - `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 03 evidence for:
    - primitive visualization in desktop + XR
    - physics mode transitions.

## Exit Criteria
- Physics runtime path is functional with deterministic mode transitions.
- Primitive-first actuator representation is canonical and serialized deterministically.
- Capsule pivot default behavior is implemented and documented.
- Automated and manual validation pass for Sprint 03 scope.

## Sprint Wrap-up (2026-02-28)
- Completed:
  - Rapier runtime integrated for actuator primitives (`capsule`, `sphere`, `box`) with fixed-step simulation.
  - Deterministic Rig/Pose transitions implemented with explicit pose-target snapshot capture at mode entry.
  - Root actuator behavior finalized for this sprint as kinematic in Pose simulation.
  - Primitive-first representation implemented, including pivot semantics (`capStart` default for capsules, optional `center`).
  - Full Unity actuator preset set ported (mass/drag/angularDrag + drive/limit schema fields) and wired into runtime defaults.
  - Startup overlap filtering added for initially penetrating colliders.
  - Pose grab path moved to temporary spring-anchor rigidbody + camera-plane drag workflow.
  - Delta mush defaults updated to `iterations=8`, `strength=0.75`.
- Deferred to Sprint 04:
  - Draw tool UX and placement behaviors (radius ring, ctrl+scroll sizing, mirror/snap parity).
  - Runtime UI for full physics/preset tuning controls.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback behavior intact.
- Do not regress Sprint 02 multi-rig and skinning baseline.
- Draw-tool UX/placement parity work is explicitly deferred to Sprint 04.
