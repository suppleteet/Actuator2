# Sprint 04 - Draw Tool UX + Placement Parity

Status: planned (2026-02-27)

## Sprint Goal
Deliver desktop draw-tool placement and UX parity with the Unity baseline while preserving deterministic physics primitive authoring.

## Task Kickoff (Strict Continuity)
- Scope:
  - Add desktop draw radius indicator at cursor hit point.
  - Add `Ctrl + mouse wheel` radius adjustment with deterministic clamping.
  - Implement desktop-only smart capsule placement inside mesh.
  - Implement mirror and snap behavior parity for draw creation.
- Unity baseline references (required for parity decisions):
  - Baseline lock: [SOURCE_BASELINE.md](/c:/Projects/Actuator2/docs/migration/SOURCE_BASELINE.md) (`30c6ea7`).
  - Source inventory: [unity_inventory_30c6ea7.json](/c:/Projects/Actuator2/docs/migration/unity_inventory_30c6ea7.json).
  - Draw/mirror/snap reference scripts:
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Tools/DrawActuatorTool.cs`
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Tools/Tool.cs`
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Utilities/ExtensionMethods.cs`
    - `c:/Projects/Actuator/Assets/Actuator/Scripts/Commands.cs`
- Non-goals:
  - Core physics runtime lifecycle and schema ownership changes from Sprint 03.
  - XR-specific inside-mesh placement flow.
- Role owners:
  - ArchitectAgent: any contract clarifications required for draw-tool state.
  - InteractionAgent: draw UX, input behavior, placement interaction flow.
  - RuntimeAgent: placement math integration and deterministic primitive spawn.
  - QAAgent: deterministic and manual validation.
- Contract references:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/SCENE_SCHEMA.md`
  - `docs/contracts/RIG_RUNTIME.md`
- Validation method:
  - Unit/integration tests (`npm test`), local build (`npm run build`), manual desktop/XR checklist updates.

## Task Board

1. A-009 ArchitectAgent
- Finalize/clarify any draw-tool contract fields and event payloads needed for desktop-only placement semantics.
- Acceptance:
  - Contract docs explicitly define desktop-only placement gating and deterministic input behavior.

2. I-010 InteractionAgent
- Add desktop draw-tool radius indicator at cursor hit point.
- Bind radius adjustment to `Ctrl + mouse wheel`.
- Ensure no camera zoom conflict while radius adjustment is active.
- Acceptance:
  - Radius ring is visible, stable, and updates in real time.
  - Radius value changes deterministically with clamped bounds.

3. I-011 InteractionAgent + RuntimeAgent
- Implement desktop-only smart capsule placement inside mesh:
  - raycast into mesh
  - derive center placement along draw axis from local surrounding geometry
  - use centered placement for capsule creation start/end points
- Acceptance:
  - Draw start lands in centered interior placement for desktop flow.
  - Repeated input path on same mesh yields deterministic placement.

4. I-012 InteractionAgent + RuntimeAgent
- Implement mirror and snap parity behavior for draw tool:
  - mirrored creation mode
  - near-plane snap that disables mirrored duplication on centerline
  - root creation centerline behavior under mirrored-creation setting
- Acceptance:
  - Mirror/snap behavior matches documented parity expectations.
  - Parenting and mirrored counterpart creation remain deterministic.

5. Q-011 QAAgent
- Add automated tests for:
  - draw radius clamping and primitive sizing outcomes
  - smart inside-mesh placement determinism
  - mirror/snap decision determinism near threshold regions
- Acceptance:
  - `npm test` passes with new draw-tool determinism coverage.

6. Q-012 QAAgent
- Update manual validation checklist for Sprint 04 draw UX scope.
- Acceptance:
  - `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 04 evidence for desktop draw radius, inside-mesh placement, and mirror/snap behavior.

## Exit Criteria
- Desktop draw tool has visible adjustable radius control.
- Desktop inside-mesh placement behavior is implemented and deterministic.
- Mirror/snap parity for draw creation is implemented and validated.
- Automated and manual validation pass for Sprint 04 scope.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback behavior intact.
- Do not regress physics integration delivered in Sprint 03.
