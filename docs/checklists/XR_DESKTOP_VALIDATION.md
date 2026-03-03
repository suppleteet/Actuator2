# XR + Desktop Manual Validation Checklist (Q-002)

## Environment
- Browser version recorded
- Device recorded (desktop + XR headset/model if used)
- Commit hash recorded

## Desktop Lane
- App loads without runtime errors in console
- Camera controls work (Alt+LMB orbit, Alt+MMB pan, Alt+RMB zoom, Alt+wheel zoom)
- Create actuator creates stable sequential ID
- Selecting from scene and list stays in sync
- Delete removes selected non-root actuator and descendants
- Undo/redo works for create/select/delete/transform actions
- Gizmo modes work (`select`, `translate`, `rotate`, `scale`)
- Orientation toggle works (`world`, `local`)
- Pivot toggle works (`object center`, `world origin`)
- Scale never crosses negative (gizmo arrows remain outward)
- Parenting transform propagation updates descendants correctly

## Recording/Playback Lane
- `Record Synthetic` creates a clip
- `Play` runs from t=0 to clip end deterministically
- `Stop` resets playback to t=0 sample
- Playback status/time update correctly in UI
- Re-running `Play` with same clip yields same result

## XR Lane
- `Enter VR` requests immersive session on supported device
- Scene is visible and stable in XR
- Session exit returns to desktop mode without errors
- Desktop controls remain functional after XR exit

## Serialization Lane
- Scene JSON panel updates on create/delete/transform/playback
- `rootActuatorId` remains valid in serialized output
- Actuator IDs remain stable across edits and undo/redo

## Sign-off
- Tester:
- Date:
- Result: pass / fail
- Notes:

## Sprint 01 Mesh + Rigging Evidence (Q-004)
- Tester: Codex (QAAgent simulation run)
- Date: 2026-02-26
- Scope: Chad mesh integration, rigging interactions, selection polish

Desktop evidence:
- Pass: Chad mesh renders from migrated assets (`public/assets/chad/*`) with texture maps.
- Pass: Actuator create/select/delete/transform remains functional with Chad mesh visible.
- Pass: Empty-space deselect works in viewport.
- Pass: Marquee drag selection works in `Select (Q)` mode and updates list/status.
- Pass: `F` focus frames selected set; with no selection, frames all actuators.
- Pass: Gizmo arrowheads render correctly from behind (double-sided handles).

Automated evidence:
- Pass: `npm run build`
- Pass: `npm test -- --run` (includes focus framing tests)

Result: pass
Notes:
- Playback controls remain in UI but are deferred to Sprint 02 by sprint plan.

## Sprint 02 Multi-Rig + Skinning Evidence (Q-006)
- Tester: Codex (QAAgent simulation run)
- Date: 2026-02-27
- Scope: multi-rig runtime, marquee/tool interaction updates, skin binding + delta mush baseline

Desktop evidence:
- Pass: Multiple rigs can be created and independently selected/edited with stable rig-scoped IDs.
- Pass: Marquee selection works while transform tools are active and updates deterministic selected ordering.
- Pass: Middle-mouse pan and wheel zoom are available without `Alt`.
- Pass: Multi-select transform applies per selected object in hierarchy order with same-frame propagation.
- Pass: Empty-click deselect and Shift/Ctrl additive/toggle selection behavior work.
- Pass: Rig/Pose mode toggle gates skinning rebuild before entering Pose and returns actuators to bind pose on Pose -> Rig.
- Pass: Chad mesh skin binding uses nearest capsule with root fallback for no-influence cases.
- Pass: Delta mush is integrated in deformation path and globally configurable.

Automated evidence:
- Pass: `npm run build`
- Pass: `npm test -- --run` (13 tests)

Result: pass (desktop + automated)
Notes:
- XR lane validation not re-run in this pass; execute XR checklist on target hardware before release gate if XR is in scope.

## Sprint 03 Physics Integration Evidence (Q-010)
- Tester: Codex (RuntimeAgent + QAAgent simulation run)
- Date: 2026-02-27
- Scope: primitive-first physics runtime, pivot semantics, deterministic sim transitions

Desktop evidence:
- Pass: Physics primitives render directly from actuator primitive dimensions (`size`) rather than transform scale.
- Pass: Capsule default pivot behavior uses start-cap pivot (`capStart`) with optional center mode support in runtime data.
- Pass: `Start Sim` / `Stop Sim` transitions restore deterministic authoring state after runtime movement.
- Pass: Parent-child physics bodies are connected via runtime joints during simulation.

Automated evidence:
- Pass: `npm test` (18 tests, including new physics authoring + simulation transition tests).
- Pass: `npm run build`.

Result: pass (desktop + automated)
Notes:
- XR lane for physics primitives should still be validated on target hardware before release gate.
- Unity baseline references used for parity decisions: `c:/Projects/Actuator` commit `30c6ea7` (`Actuator.cs`, `ActuatorRig.cs`, `ActuatorRigEditor.cs`, `ColliderExtensions.cs`).

## Sprint 04 Draw UX + Placement Evidence (Q-012)
- Tester: Codex (InteractionAgent + RuntimeAgent + QAAgent simulation run)
- Date: 2026-02-28
- Scope: desktop draw radius UX, inside-mesh placement baseline, mirror/snap deterministic creation

Desktop evidence:
- Pass: Draw mode shows a live camera-space radius ring at cursor position.
- Pass: `Ctrl + mouse wheel` adjusts draw radius in fixed steps and clamps to bounds.
- Pass: Camera wheel zoom is suppressed while `Ctrl` draw radius adjustment is active.
- Pass: Mouse down creates zero-height capsule(s); drag adjusts capsule end point; mouse up finalizes.
- Pass: Desktop draw placement derives start/end from interior center probes through mesh thickness.
- Pass: Mirror toggle duplicates draw creation across center plane; centerline snap suppresses mirrored duplicate.

Automated evidence:
- Pass: `npm test`
- Pass: `npm run build`

Result: pass (desktop + automated)
Notes:
- XR-specific inside-mesh placement remains out of Sprint 04 scope by plan.

## Sprint 06 Physics Feel + XR Tool Parity + Deploy Evidence (Q-015)
- Tester: Codex (InteractionAgent + RuntimeAgent + QAAgent simulation run)
- Date: 2026-03-02
- Scope: XR tool visuals/mapping, XR trigger author-select bridge, pose feel tuning, GitHub Pages workflow

Desktop + automated evidence:
- Pass: Unity tool FBX assets imported and rendered per hand in XR runtime path.
- Pass: Deterministic XR tool-lane mapping tests (`xr-tools`, `xr-trigger-bridge`) are passing.
- Pass: Runtime tuning updates for root/child recovery compile and pass automated regression tests.
- Pass: `npm test`
- Pass: `npm run build`
- Pass: base-path build (`VITE_BASE_PATH=/<repo-name>/ npm run build`)

Manual XR/device evidence:
- Not run in this environment: no physical headset/controller hardware was available.
- Pending check on target hardware:
  - XR tool mesh visibility/alignment during mode transitions
  - Trigger/squeeze/thumbstick behavior parity
  - Pose enter/exit root stability feel regression

GitHub Pages deployment evidence:
- Pass: `.github/workflows/sprint-pages.yml` added for branch build + artifact upload and `main` deploy.
- Pending check in remote repo: first Actions run + Pages environment verification.

Known limits:
- XR behavior and physics feel parity claims are automated + code-level only until hardware pass.
- GitHub Pages deploy cannot be fully confirmed locally without repository Actions execution.

Result: partial-pass (automation complete, hardware/deploy environment checks pending)
