# Actuator2 Backlog

Prioritized items intentionally out of current sprint scope.
Items below are intentionally loose and expected to split/merge after discovery.

Already implemented and excluded from this list:
- Multi-rig scene baseline + deterministic rig-scoped actuator IDs.
- Desktop actuator authoring baseline (selection/marquee/transform/focus workflow).
- Closest-capsule async skin binding baseline.
- Delta mush runtime integration baseline.

## B-004 Rig Asset vs Performance Instance Model
- Owner: `ArchitectAgent` + `RuntimeAgent`
- Priority: High
- Problem:
Rig editing and performance/animation in the same live data model can become unstable and hard to reason about.
- Scope (loose):
Define and prototype a split between canonical rig authoring data and runtime performance instances that reference it.
- Discovery outputs:
1. Contract proposal for authoring rig vs instance relationship.
2. Clear ownership rules for which mode can mutate which data.
3. Migration note for existing scene docs.

## B-005 Runtime Physics Macro Controls
- Owner: `RuntimeAgent` + `InteractionAgent`
- Priority: High
- Problem:
Physics tuning needs to be fast in XR and desktop; low-level numeric tuning is too slow.
- Scope (loose):
Prototype 1-2 high-level controls (for example `Tightness`, `Inertia`) that drive grouped physics parameters.
- Discovery outputs:
1. Mapping table from macro controls to internal physics params.
2. Simple desktop + XR control surfaces for live tuning.
3. Feasibility note for keyframing these macro values.

## B-006 Joint Limits Authoring UX
- Owner: `InteractionAgent` + `RuntimeAgent`
- Priority: High
- Problem:
Joint limits need direct in-scene authoring, especially for XR, without inspector-heavy setup.
- Scope (loose):
Design and test in-scene limit gizmos (swing/twist ranges) with immediate visual feedback.
- Discovery outputs:
1. Joint limit data representation in contracts/runtime.
2. One practical gizmo interaction model for XR plus desktop fallback.
3. Validation checklist for setup speed and clarity.

## B-007 Actuator Visual Clarity Pass
- Owner: `InteractionAgent`
- Priority: Medium
- Problem:
Actuators inside dense mesh regions are hard to read and manage.
- Scope (loose):
Improve visualization states (wireframe default, selected translucent solid, depth/readability helpers).
- Discovery outputs:
1. Visual state spec for idle/hover/selected/locked.
2. Occlusion/readability approach that works in XR and desktop.
3. Finalized selection affordances tied to visual states.

## B-008 Skin Weight Refinement Controls
- Owner: `RuntimeAgent` + `InteractionAgent`
- Priority: High
- Problem:
Auto-binding baseline works but needs finer control to avoid poor local deformation.
- Scope (loose):
Add per-actuator falloff/refinement controls and improve no-influence blending behavior.
- Discovery outputs:
1. Per-actuator weighting controls (falloff/radius/curve candidates).
2. Predictable fallback blending rules to root influence.
3. Debug view for influence/weight inspection.

## B-009 Puppeteering Controls + Input Mapping
- Owner: `AnimationAgent` + `InteractionAgent` + `RuntimeAgent`
- Priority: Medium
- Problem:
Performance controls need explicit mapping from XR inputs to rig actions/poses.
- Scope (loose):
Introduce in-scene control objects and an input mapping layer with optional secondary motion modes.
- Discovery outputs:
1. Control object schema and lifecycle.
2. Mapping model for triggers/buttons/gestures -> actions.
3. Motion mode options (`direct`, `smoothDamp`, `spring`) and recording implications.

## B-010 Timeline + Simulation Cache
- Owner: `AnimationAgent` + `RuntimeAgent`
- Priority: Medium
- Problem:
Animation workflow needs deterministic pose keyframes plus simulation-aware scrubbing.
- Scope (loose):
Extend timeline toward cached sim scrubbing and replay from current time with re-sim.
- Discovery outputs:
1. Cache model and invalidation rules.
2. Playback behavior from arbitrary timeline time.
3. Early XR timeline interaction model that stays readable.

## B-011 Facial Rig Subsystem (Separate Epic)
- Owner: `ArchitectAgent` + `RuntimeAgent` + `InteractionAgent`
- Priority: Medium
- Problem:
Face regions need higher-resolution control than current body weighting assumptions.
- Scope (loose):
Research a dedicated facial rig workflow layered on top of body rig data.
- Discovery outputs:
1. Placement guide approach (curves vs points/spheres + links).
2. Initial weighting strategy for close-proximity facial geometry.
3. Baseline auto-setup experiment (ARKit-like optional defaults).

## B-012 Desktop Companion Surface
- Owner: `InteractionAgent` + `AnimationAgent`
- Priority: Low
- Problem:
As rig + timeline complexity grows, some workflows will be faster on desktop companion UI than in-headset.
- Scope (loose):
Outliner/track/management lanes that complement XR authoring rather than replacing it.
- Discovery outputs:
1. Minimal desktop panels with highest leverage.
2. Sync guarantees between desktop and XR edits.
3. Export/handoff hooks required for production workflows.
