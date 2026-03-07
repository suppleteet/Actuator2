# Rapier Physics Improvement Plan

**Context:** Actuator2 uses Rapier (via `@react-three/rapier`) for ragdoll-style actuator simulation. This doc summarizes research on Rapier best practices and a concrete plan to address: smoother physics, softer collisions, stiffer-but-smooth rotation, proper mass usage, collision correctness, root translation spring jitter, and grab-tool rotation lock.

---

## 1. Research Summary: Rapier for Ragdoll-Style Physics

### 1.1 Core Rapier Concepts (Ragdolls)

- **Rigid bodies + joints** are the building blocks. Ragdolls need joints to restrict relative motion between segments; rigid bodies alone are not enough.
- **Body types:** Dynamic (affected by forces), Fixed, Kinematic (position- or velocity-based). We use dynamic for actuators and kinematic position-based for root/grab anchors.
- **Colliders** define shape and contact; they can have **restitution** (bounciness) and **friction** (tangential resistance). Restitution 0 = no bounce; friction ≥ 1 = strong grip.
- **Damping:** Each rigid body has `linearDamping` and `angularDamping`. Higher values = stronger slow-down (good for reducing jitter and runaway spin).

### 1.2 Soft Collisions (Softer Contact)

- **Restitution:** Set **restitution** on colliders (e.g. `0` or low value like `0.1`) for “soft” contacts. Use **restitutionCombineRule** (e.g. `Min`) when combining with other colliders.
- **Contact tuning:** Rapier’s **erp** (Error Reduction Parameter) controls how much penetration is corrected per step. High erp → faster correction but more jitter; lower erp → softer, less snappy response.
- **allowedLinearError:** Small penetration the engine ignores (default 0.001). Slightly increasing can reduce contact chatter; too large causes visible overlap.
- **max_linear_correction:** Cap on position correction per iteration. Large values can cause overshoot/jitter; smaller values correct more gradually.
- **react-three-rapier:** `Physics` exposes `contactNaturalFrequency` (affects erp). Lower = softer contact. Also `allowedLinearError` is available on `<Physics>`.

### 1.3 Smooth Simulation (Less Jitter)

- **Fixed timestep:** Keep `timeStep={1/60}` (or similar fixed value). Avoid `"vary"` for deterministic, stable ragdolls.
- **Solver iterations:** `numSolverIterations` and `numInternalPgsIterations` improve stability. More iterations = stiffer, more accurate constraints but more cost. We already tune these via `PhysicsTuning`.
- **ERP:** Lower erp (or lower `contactNaturalFrequency`) reduces aggressive correction and jitter. Tune in small steps.
- **Damping:** Increase **linearDamping** and **angularDamping** on rigid bodies to absorb energy and reduce oscillation. Preset `drag` / `angularDrag` already map into these; we can scale via `PhysicsTuning` or presets.
- **Warmstart:** Default `warmstart_coeff = 1` is usually best; reducing can reduce added energy from cached impulses but may need more solver iterations.

### 1.4 Stiffer Rotation While Staying Smooth

- **Angular damping:** Higher `angularDamping` makes rotation “heavier” and resists spin without making the motion discontinuous.
- **Mass / inertia:** Heavier bodies (higher mass) and sensible inertia make rotation less twitchy. Mass is already scaled by collider volume and preset; ensure root and key segments have enough mass so they’re not overpowered by springs.
- **Drive tuning:** Our rotation drive uses stiffness × error and velocity blend. For “stiffer but smooth”: increase stiffness and/or velocity blend in small steps, and cap `maxAngularSpeed` so we don’t get instant snaps. Keep damping (angular + body) high enough to avoid oscillation.
- **Joints:** Rapier’s revolute/spherical joints with stiffness/damping could be used for segment-to-segment constraints in a full ragdoll; our current setup uses a custom PD-style angular drive per actuator. Same idea: higher angular damping + sufficient mass keeps rotation stiff but smooth.

### 1.5 Mass

- Mass has a big impact: heavier bodies are harder to accelerate and rotate. We already have:
  - Preset-based mass and volume-scaled mass in `getActuatorMass()`.
  - Root mass boosted when in Pose mode (`poseRootMass`).
- **Recommendation:** Keep volume-based scaling; consider exposing a global or per-preset mass multiplier in PhysicsTuning so users can “heavify” the character for more stable, less bouncy behavior without changing presets.

### 1.6 Grab Tool and Rotation Lock

- **Current behavior:** Grab uses a **spring joint** (position-only) between a kinematic anchor and the grabbed body. The joint does **not** constrain rotation, so the actuator can spin.
- **Fix options:**
  1. **Angular velocity zeroing (simplest):** In `useBeforePhysicsStep` (or after setting the anchor position), if `posePullStateRef.current?.actuatorId` is set, get that body and `setAngvel({ x: 0, y: 0, z: 0 }, true)` every step. This locks rotation while grabbed.
  2. **Fixed joint:** Replace the spring with a **fixed** joint (same anchor + body). That locks both position and rotation to the anchor. Optionally we could still move the anchor each frame to the ray-hit point so the body follows the cursor exactly (no spring wobble, but no “soft” drag feel).
  3. **Hybrid:** Keep spring for position; add a separate strong angular drive or direct `setAngvel(0)` and optionally `setRotation(...)` to the grab-start rotation each frame for a “locked orientation” feel.

Recommendation: Start with **option 1** (zero angvel while grabbed). If we want “lock orientation to world” we can later add option 3 with a stored grab rotation.

---

## 2. Current Issues vs Plan

| Issue | Cause (brief) | Planned change |
|-------|----------------|----------------|
| Collisions not working properly | Possible: collision groups, no restitution/friction set, or contact filtering. | Set restitution (low) and friction on actuator and floor colliders; verify no over-aggressive contact pair disabling; ensure floor is fixed and in default groups. |
| Translation spring jittery and too tight | Root mover uses very high stiffness (280–18000) and high damping; ERP/correction may be aggressive. | Softer root spring (lower stiffness, critical-damping ratio); lower `contactNaturalFrequency` and/or expose `allowedLinearError`; consider slightly lower `numSolverIterations` for root-only if needed. |
| Grab doesn’t lock rotation; actuator spins | Spring joint only constrains position; angular velocity is never zeroed. | Zero angular velocity on the grabbed body every physics step while grab is active. |
| Want softer collision | Default restitution/friction and high ERP. | Set restitution ≈ 0 (or 0.1) and optional friction on colliders; lower contact natural frequency. |
| Want stiffer rotation but smooth | Need more resistance to rotation without overshoot. | Increase angular damping and/or rotation drive stiffness (and possibly mass); keep velocity blend and max angular speed tuned. |

---

## 3. Implementation Plan

### Phase 1: Collision and global tuning (collisions + softer feel)

1. **Colliders: restitution and friction**
   - On actuator colliders (`CapsuleCollider`, `BallCollider`, `CuboidCollider`): set `restitution={0}` (or a small value, e.g. `0.05`) and optionally `friction={0.5}` (tune as needed). Use `restitutionCombineRule="Min"` if available so contacts stay soft when combined with floor.
   - On the floor `RigidBody` (cuboid): set `restitution={0}` and `friction={0.8}` (or similar) so the floor doesn’t bounce and has grip.
   - **Contract:** None. Optional: document in RIG_RUNTIME or a small “physics constants” section that default restitution/friction are set for soft contacts.

2. **Physics world: softer contact**
   - Add `contactNaturalFrequency` to `<Physics>` (e.g. reduce from default 30 to 15–20) to reduce ERP and make contact less snappy.
   - Optionally add `allowedLinearError` (e.g. 0.0015) if we still see contact chatter. Keep changes small and test.

3. **Verification**
   - Confirm actuator–actuator and actuator–floor collisions resolve correctly and feel softer (no or minimal bounce).

### Phase 2: Root translation spring (less jitter, less tight)

4. **Softer root mover**
   - In `PosePhysicsBridge`, reduce the effective stiffness and/or damping of the root spring:
     - Lower the multiplier for `moverStiffness` (e.g. from `positionSpring.stiffness * 32` to `* 16` or `* 12`) and/or lower the min/max range (e.g. max 18000 → 9000).
     - Keep damping near critical (e.g. `criticalDamping * 0.9–0.95`) so we don’t oscillate; we can slightly reduce the minimum moverDamping if the root feels too locked.
   - Consider adding PhysicsTuning knobs: `rootMoverStiffnessScale` and `rootMoverDampingScale` so we can tune without code changes.

5. **Stability**
   - If the root still jitters, try reducing `numSolverIterations` or `numInternalPgsIterations` slightly for the step (or globally) to see if over-solving is causing overshoot; revert if simulation becomes unstable.

### Phase 3: Grab tool rotation lock

6. **Zero angular velocity while grabbed**
   - In `useBeforePhysicsStep` (in `PosePhysicsBridge`), after building the pose and before/after root mover updates: if `posePullStateRef.current?.actuatorId` is set, get the corresponding body from `bodyRefs[actuatorId]?.current` and call `body.setAngvel({ x: 0, y: 0, z: 0 }, true)`.
   - Ensure we only do this when the grab is actually active (pose pull state is set and not cleared). This prevents the actuator from spinning while dragged.

7. **Optional: lock orientation to grab-start**
   - Store `grabStartRotation` (quat) in `posePullStateRef` when pointer goes down; each step while grabbed, set `body.setRotation(grabStartRotation, true)` (and keep angvel zero). Only do this if we want “rigid” orientation lock; otherwise zeroing angvel is enough.

### Phase 4: Stiffer rotation and mass (tuning knobs)

8. **Rotation stiffness / angular damping**
   - Ensure `PhysicsTuning.rotationStiffness` and `bodyAngularDamping` are used and that presets’ `angularDrag` is applied. Add or expose a “rotation stiffness scale” or “angular damping scale” in the tuning so we can make rotation stiffer without recompiling.
   - Tune `maxAngularSpeed` so stiff rotation doesn’t produce instant snaps; keep it high enough for natural motion.

9. **Mass**
   - Keep current volume-based mass and root boost. Optionally add `PhysicsTuning.massScale` (default 1) applied in `getActuatorMass` or at RigidBody `mass` prop so the whole character can be made heavier for more stable, less bouncy behavior.

### Phase 5: Constants and docs

10. **Constants**
    - Move magic numbers (restitution, friction, contactNaturalFrequency, root spring scales) into `src/app/constants.ts` or a small `physicsConstants.ts` so they’re easy to find and tune.

11. **Checklist / contract**
    - If we add new PhysicsTuning fields or change behavior, update `docs/checklists/PR_CHECKLIST.md` and any contract that mentions physics (e.g. RIG_RUNTIME) with a one-line “physics tuning / collision defaults” note.

---

## 4. Rapier References (short)

- [Rapier JS Rigid Bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/)
- [Rapier JS Rigid Body Damping](https://rapier.rs/docs/user_guides/javascript/rigid_body_damping)
- [Rapier JS Colliders](https://rapier.rs/docs/user_guides/javascript/colliders/) (restitution, friction)
- [Rapier Integration Parameters](https://rapier.rs/docs/user_guides/javascript/integration_parameters) (dt, erp, allowed_linear_error, max_linear_correction, iterations)
- [react-three-rapier PhysicsProps](https://pmndrs.github.io/react-three-rapier/interfaces/PhysicsProps.html) (timeStep, contactNaturalFrequency, allowedLinearError, numSolverIterations, numInternalPgsIterations)
- [react-three-rapier ColliderProps](https://pmndrs.github.io/react-three-rapier/interfaces/ColliderProps.html) (restitution, friction, density)

---

## 5. Summary

- **Softer collisions:** Low restitution (0), sensible friction, and lower `contactNaturalFrequency` (and optionally `allowedLinearError`).
- **Smoother / less jitter:** Fixed timestep, slightly softer root spring with near–critical damping, and possibly lower ERP-related parameters.
- **Stiffer rotation, still smooth:** Higher angular damping and/or rotation drive stiffness, sufficient mass (and optional mass scale).
- **Grab rotation lock:** Zero angular velocity on the grabbed body every step; optionally lock rotation to grab-start.
- **Collision correctness:** Set restitution/friction on all colliders and verify contact filtering and groups so actuator–actuator and actuator–floor contacts work as expected.

Implementing in the order above (collision → root spring → grab lock → tuning/mass) keeps each step testable and minimizes regressions.
