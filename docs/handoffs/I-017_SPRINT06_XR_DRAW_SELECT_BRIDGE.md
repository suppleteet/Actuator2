# Task
- ID: I-017
- Title: XR trigger bridge for draw/select baseline interactions
- Role: InteractionAgent + RuntimeAgent

# Summary
- What changed:
  - Added XR trigger intent resolver `src/interaction/xrTriggerBridge.ts` for deterministic trigger-to-action routing.
  - Added XR draw/select interaction tests in `src/tests/xr-trigger-bridge.test.ts`.
  - Updated `src/App.tsx` XR input path to:
    - consume live controller trigger events,
    - resolve active tool lane per hand,
    - author actuators from controller tip pose when draw lane is active,
    - select/toggle selection from controller tip pose when grab/select lane is active.
  - Preserved desktop draw flow by keeping desktop pointer handling gated to draw mode while XR actions are handled separately.
- Why:
  - Sprint 06 requires an XR trigger bridge that can author/select without regressing deterministic desktop workflows.

# Contract References
- Files:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/RIG_RUNTIME.md`
- Contract change required: no

# Validation
- Unit/integration/manual evidence:
  - `npm test` passed (includes new `xr-trigger-bridge` tests).
  - `npm run build` passed.
- Perf notes:
  - XR bridge uses existing event stream + controller state lookup; no additional physics-step loops were introduced.

# Risks / Follow-ups
- Known issues:
  - XR author/select behavior still requires headset/browser manual verification for final distance thresholds and ergonomics.
- Next owner:
  - RuntimeAgent for R-010 physics feel tuning and regression checks.
