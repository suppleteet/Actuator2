# Sprint 05 - UI/UX Consolidation + WebXR Bootstrap

Status: planned (2026-03-01)

## Sprint Goal
Deliver a stronger desktop UI/UX layer and a deterministic WebXR interaction bootstrap without regressing Sprint 04 draw-tool behavior.

## Inputs from Previous Handoff
- Source handoff:
  - [I-010_I-012_Q-011_Q-012_SPRINT04_DRAW_UX.md](/c:/Projects/Actuator2/docs/handoffs/I-010_I-012_Q-011_Q-012_SPRINT04_DRAW_UX.md)
- Carry-over constraints:
  - Inside-mesh interior probing can degrade on non-manifold/open geometry.
  - Mirror plane baseline is fixed to world `X=0`.
  - Sprint 04 contract clarification in `MODE_TOOL_STATE.md` must remain intact for desktop draw semantics.

## Task Kickoff (Strict Continuity)
- Scope:
  - Consolidate desktop UI affordances for mode/tool awareness and interaction feedback.
  - Add WebXR session lifecycle UX (enter, active, exit, recoverable failure).
  - Add WebXR interaction bootstrap (controller ray + primary select) as a vertical slice.
  - Keep selection/hover transitions deterministic across desktop and XR event paths.
- Unity baseline references (required for parity decisions):
  - Baseline lock: [SOURCE_BASELINE.md](/c:/Projects/Actuator2/docs/migration/SOURCE_BASELINE.md) (`30c6ea7`).
  - Source inventory: [unity_inventory_30c6ea7.json](/c:/Projects/Actuator2/docs/migration/unity_inventory_30c6ea7.json).
- Non-goals:
  - Full XR draw-tool parity for inside-mesh placement.
  - Dynamic mirror-plane authoring (keep fixed `X=0` baseline).
  - Timeline/recording workflow expansion.
- Role owners:
  - ArchitectAgent: contract impact triage for XR input/state events.
  - InteractionAgent: UI/UX implementation and XR interaction flow.
  - RuntimeAgent: deterministic hit/selection integration for XR input path.
  - QAAgent: deterministic test coverage and manual desktop/XR validation.
- Contract references:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/RIG_RUNTIME.md`
  - `docs/contracts/SCENE_SCHEMA.md`
- Validation method:
  - Unit/integration tests (`npm test`), local build (`npm run build`), manual desktop/XR checklist updates.

## Task Board

1. A-010 ArchitectAgent
- Review whether XR session and controller interaction require contract changes.
- If needed, publish contract-first update in a dedicated PR before implementation tasks merge.
- Acceptance:
  - Contract impact is explicitly recorded as `none` or updated contract file references.
  - Deterministic event ordering expectations for XR input are explicit.

2. I-013 InteractionAgent
- Implement desktop UI/UX consolidation for:
  - clear mode state display (`Rig`/`Sim`/`RecordPlayback`)
  - active tool display and selection context visibility
  - actionable feedback for invalid operations (mode/tool gating)
- Acceptance:
  - Core state is visible without requiring devtools.
  - Invalid/gated actions produce consistent user-facing feedback.
  - Desktop fallback behavior remains intact.

3. I-014 InteractionAgent
- Implement WebXR session lifecycle UX:
  - enter request
  - active session indicator
  - exit path
  - failure/retry path for unsupported or denied session requests
- Acceptance:
  - Session state transitions are deterministic for equal event sequences.
  - Enter/exit paths do not corrupt active mode/tool state.

4. I-015 InteractionAgent + RuntimeAgent
- Implement XR interaction bootstrap vertical slice:
  - controller ray hover target resolution
  - primary select on hovered actuator
  - deterministic selection ordering and highlight behavior
- Acceptance:
  - XR pointer hover/select works on supported devices and does not break desktop selection.
  - Multi-rig selection invariants from contracts remain valid.
  - Same initial state + same input sequence yields identical selection results.

5. R-009 RuntimeAgent
- Add runtime guardrails for XR hit/selection integration:
  - shared deterministic hit-resolution path for desktop/XR where practical
  - safe fallback behavior when geometry probing is ambiguous
- Acceptance:
  - XR hit path does not introduce nondeterministic selection churn.
  - Sprint 04 draw placement behavior is unaffected by new XR selection code paths.

6. Q-013 QAAgent
- Add automated tests for:
  - XR session state transition determinism
  - hover/select determinism across desktop and XR input pathways
  - mode/tool state stability during XR enter/exit
- Acceptance:
  - `npm test` passes with new deterministic XR/UI coverage.

7. Q-014 QAAgent
- Extend manual validation checklist for Sprint 05:
  - desktop UI clarity and gating feedback
  - XR session lifecycle success/failure paths
  - XR hover/select baseline on target hardware
- Acceptance:
  - `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 05 evidence and known device notes.

## Exit Criteria
- Desktop UI/UX state visibility and feedback are improved and stable.
- WebXR session lifecycle is operational with deterministic state handling.
- XR hover/select bootstrap works without regressing desktop workflows.
- Automated and manual validation pass for Sprint 05 scope.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback behavior intact.
- Preserve Sprint 04 draw-tool desktop semantics and known baseline constraints.
