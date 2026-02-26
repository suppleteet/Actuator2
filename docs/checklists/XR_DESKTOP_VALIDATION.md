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
