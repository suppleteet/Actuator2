# Actuator2 Backlog

Prioritized items that are intentionally out of current sprint scope but must remain tracked.

## B-001 Tracked Desktop Mode (Headset-Off, Controllers-On)
- Owner: `InteractionAgent` + `RuntimeAgent`
- Priority: High
- Problem:
Users may put the headset down and continue using tracked controllers while viewing/editing on desktop monitor.
- Scope:
Add a non-immersive XR interaction mode that keeps controller tracking active and routes tool input through desktop camera/view.
- Non-goals:
Full desktop DCC feature set in this task.
- Dependencies:
`I-001` desktop fallback controls, input abstraction in interaction layer, mode/tool contract updates.
- Acceptance:
1. User can see scene on desktop monitor and manipulate tools with tracked controllers without entering immersive headset view.
2. Tool behavior remains deterministic vs immersive mode for equivalent input.
3. Mode toggle is explicit and recoverable.

## B-002 Desktop Camera Tumble/Orbit Controls
- Owner: `InteractionAgent`
- Priority: High
- Problem:
Desktop mode needs smooth, precise camera navigation for rigging and multi-character setup.
- Scope:
Implement camera tumble/orbit/pan/dolly controls with configurable sensitivity and predictable pivot behavior.
- Non-goals:
Advanced cinematic camera system.
- Dependencies:
`I-001` desktop input baseline.
- Acceptance:
1. Smooth orbit around selection and fallback pivot when nothing selected.
2. Pan and dolly work with mouse + keyboard modifiers.
3. No major jitter/jumps during repeated mode transitions.

## B-003 Desktop DCC Companion Surface
- Owner: `InteractionAgent` + `AnimationAgent` + `ArchitectAgent`
- Priority: Medium
- Problem:
Complex scene management (multi-character hierarchy, timeline details, exports) is better on desktop than in-headset.
- Scope:
Create desktop companion UI lanes for hierarchy/outliner, multi-character management, and export configuration.
- Non-goals:
Feature parity with mature DCCs in first pass.
- Dependencies:
Stable schema/contracts for scene graph and export pipeline.
- Acceptance:
1. User can manage multiple characters via hierarchy UI.
2. User can configure and trigger exports from desktop UI.
3. XR and desktop edits stay synchronized via shared state/contracts.
