# Sprint 06 - Physics Feel + XR Tool Parity + Sprint Deploy

Status: completed (2026-03-02)

## Sprint Goal
Close the biggest migration gap versus Unity by improving pose/simulation feel, introducing Unity-style VR tool runtime/visuals, and establishing repeatable sprint-end GitHub Pages deployment.

## Inputs from Previous Handoff
- Source handoff:
  - [I-013_I-014_Q-013_SPRINT04_POLISH_AND_VIEWCUBE.md](/c:/Projects/Actuator2/docs/handoffs/I-013_I-014_Q-013_SPRINT04_POLISH_AND_VIEWCUBE.md)
- Carry-over constraints:
  - Selection/highlight and draw semantics from Sprint 05 must remain deterministic.
  - Mirror baseline remains world `X=0`.
  - Enter/exit VR bootstrap already exists and must not regress.

## Task Kickoff (Strict Continuity)
- Scope:
  - Tune runtime pose/physics response toward Unity baseline feel.
  - Integrate Unity VR tool visuals and core controller input mapping (trigger/squeeze/thumbstick + tool override lanes).
  - Add sprint-end deploy pipeline for GitHub Pages.
- Unity baseline references (required for parity decisions):
  - Baseline lock: [SOURCE_BASELINE.md](/c:/Projects/Actuator2/docs/migration/SOURCE_BASELINE.md) (`30c6ea7`).
  - Unity input/tool sources:
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Handlers/InputHandler.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Handlers/ToolHandler.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Tools/Tool.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Tools/DrawActuatorTool.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Tools/GrabTool.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Tools/SelectTool.cs`
    - `C:/Projects/Actuator/Assets/Actuator/Scripts/Tools/AdjustTool.cs`
- Non-goals:
  - Full Unity feature parity for all menus/timeline interactions in VR.
  - Contract redesign of scene schema or timeline data.
  - Device-specific controller mesh variants beyond imported baseline assets.
- Role owners:
  - ArchitectAgent: contract impact triage (`none` expected unless event semantics must change).
  - RuntimeAgent: physics tuning and deterministic spring/pose recovery behavior.
  - InteractionAgent: XR tool runtime, input mapping, and tool visual integration.
  - QAAgent: deterministic verification + XR manual checklist and deployment verification.
- Contract references:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/RIG_RUNTIME.md`
  - `docs/contracts/SCENE_SCHEMA.md`
- Validation method:
  - `npm test`
  - `npm run build`
  - Manual XR checklist pass for tool visuals, trigger/squeeze/thumbstick mapping, and draw/select baseline.
  - GitHub Pages workflow dry run on branch push and production run on merge.

## Task Board

1. I-016 InteractionAgent
- Integrate Unity tool FBX assets and per-hand tool rendering in XR.
- Mirror Unity tool-state mapping baseline:
  - Rig + sim off: primary `DrawActuator`, secondary `Grab`
  - Pose/sim on: both `Grab`
  - Thumbstick press override: `Adjust`
  - Single-hand squeeze as alt-mode modifier lane
- Acceptance:
  - Tool mesh appears at controller-aligned offset.
  - Tool changes are deterministic for the same mode/input sequence.
- Status: completed (`56658a8`)
- Handoff: `docs/handoffs/I-016_SPRINT06_XR_TOOL_VISUALS_AND_MAPPING.md`

2. I-017 InteractionAgent + RuntimeAgent
- Add XR tool input bridge for draw/select baseline interactions where feasible in current architecture.
- Preserve desktop input behavior and determinism.
- Acceptance:
  - XR trigger path can author/select without breaking desktop draw flow.
  - Selection/highlight remains stable under repeated mode switches.
- Status: completed (`5a6f209`)
- Handoff: `docs/handoffs/I-017_SPRINT06_XR_DRAW_SELECT_BRIDGE.md`

3. R-010 RuntimeAgent
- Improve pose/simulation feel via targeted tuning:
  - root stability/jitter suppression
  - rotational return smoothness
  - damping/solver balance for authored presets
- Acceptance:
  - Reduced root jitter in repeatable manual scenarios.
  - No regressions in spring-back behavior for non-root actuators.
- Status: completed (`3b3e850`)
- Handoff: `docs/handoffs/R-010_SPRINT06_PHYSICS_FEEL_TUNING.md`

4. I-018 InteractionAgent
- Add GitHub Pages sprint-end publishing workflow and base-path-safe build config.
- Acceptance:
  - Build artifact deploys via Actions.
  - App loads static assets correctly from project Pages path.
- Status: completed (`ea5a803`)
- Handoff: `docs/handoffs/I-018_SPRINT06_PAGES_DEPLOY_WORKFLOW.md`

5. Q-015 QAAgent
- Expand manual validation checklist for Sprint 06:
  - XR tool mesh visibility and mode transitions
  - trigger/squeeze/thumbstick behavior
  - physics feel regression checks (pose enter/exit, root stability)
  - GitHub Pages deployment verification
- Acceptance:
  - Evidence logged with pass/fail notes and known device/browser limits.
- Status: completed (this task commit)
- Handoff: `docs/handoffs/Q-015_SPRINT06_VALIDATION_AND_CLOSEOUT.md`

## Exit Criteria
- Physics feel is measurably closer to Unity baseline for root and child actuator response.
- XR tools are visible, mode-aware, and controller inputs are mapped to core lanes.
- Sprint-end deploy path to GitHub Pages is operational and repeatable.
- Automated build/tests pass and manual XR/desktop checks are recorded.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Keep browser + desktop fallback behavior intact.
- Prioritize deterministic behavior over visual-only parity.

## Close-out
- Automated validation:
  - `npm test` passed.
  - `npm run build` passed.
  - `VITE_BASE_PATH=/<repo>/ npm run build` passed.
- Manual XR/device validation:
  - Checklist expanded with pass/fail lanes and limitations in `docs/checklists/XR_DESKTOP_VALIDATION.md`.
  - Hardware-specific XR and GitHub Actions deploy verification remain required on target devices/repo settings.
