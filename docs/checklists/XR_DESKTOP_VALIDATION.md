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
