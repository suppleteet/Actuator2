# Task
- ID: I-016
- Title: Unity XR tool visuals + deterministic mode/input mapping
- Role: InteractionAgent

# Summary
- What changed:
  - Imported Unity tool FBX assets into `public/assets/tools` (`DrawActuatorTool`, `GrabTool`, `AdjustTool`, `SelectTool`).
  - Added deterministic XR hand-input + tool-lane resolver in `src/interaction/xrTools.ts`.
  - Added thumbstick-click polling/events in `src/interaction/input/providers/xrProvider.ts` (`xr.thumbstick.click` `OnPress`/`OnRelease`/`OnValue`).
  - Added per-hand XR tool rendering component `src/app/components/XRToolVisuals.tsx` and wired it into scene runtime via `SceneContent` props.
  - Added automated deterministic coverage in `src/tests/xr-tools.test.ts`.
- Why:
  - Sprint 06 requires Unity-style XR tool parity: deterministic primary/secondary defaults, thumbstick override lane (`Adjust`), and single-hand squeeze alt lane.

# Contract References
- Files:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/RIG_RUNTIME.md`
- Contract change required: no

# Validation
- Unit/integration/manual evidence:
  - `npm test` passed (includes new `xr-tools` deterministic tests).
  - `npm run build` passed.
- Perf notes:
  - Added FBX tool assets and lightweight per-frame controller-anchor syncing; no simulation-step changes in this task.

# Risks / Follow-ups
- Known issues:
  - XR tool visuals depend on live WebXR controller state and require hardware validation for final offset/scale feel.
- Next owner:
  - InteractionAgent + RuntimeAgent for I-017 XR trigger author/select bridge.
