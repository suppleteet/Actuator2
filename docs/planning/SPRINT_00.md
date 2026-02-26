# Sprint 00 - Bootstrap (Agent Team)

## Sprint Goal
Deliver a working Actuator2 app shell with contracts and first runnable vertical scaffolding.

## Task Board

1. A-001 ArchitectAgent
- Finalize `SCENE_SCHEMA.md` + sample JSON payload.
- Acceptance: schema reviewed by RuntimeAgent + AnimationAgent.

2. A-002 ArchitectAgent
- Define command/event taxonomy for mode and tool transitions.
- Acceptance: `MODE_TOOL_STATE.md` includes event list + transitions.

3. R-001 RuntimeAgent
- Initialize TypeScript + Vite + React + R3F + Rapier app.
- Acceptance: app boots and renders basic 3D scene.

4. I-001 InteractionAgent
- Integrate WebXR session entry and desktop fallback camera controls.
- Acceptance: enter XR on supported device; desktop controls usable.

5. R-002 RuntimeAgent
- Implement actuator entity prototype (create/select/delete in memory).
- Acceptance: IDs stable and serialized via schema draft.

6. I-002 InteractionAgent
- Implement simple selection highlight and transform gizmo affordance.
- Acceptance: selected actuator visibly distinct and moveable.

7. N-001 AnimationAgent
- Create recorder stub API and playback clock service.
- Acceptance: records synthetic transform samples and replays deterministically.

8. Q-001 QAAgent
- Establish test runner + baseline contract tests.
- Acceptance: CI-ready local test command passes.

9. Q-002 QAAgent
- Produce manual validation checklist for XR and desktop lanes.
- Acceptance: checklist committed under `docs/checklists`.

## Exit Criteria
- Repo has runnable app shell.
- Contracts are baseline-approved.
- First actuator manipulation path exists (prototype quality acceptable).
- Recording/playback stub proves integration seam.

## Deferred Backlog
- Track deferred cross-sprint items in [BACKLOG.md](/c:/Projects/Actuator2/docs/planning/BACKLOG.md).
