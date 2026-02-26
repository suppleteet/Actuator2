# Sprint 02 - Playback Foundations

## Sprint Goal
Resume animation lane work after Sprint 01 mesh integration by delivering deterministic live recording and timeline playback controls.

## Task Board

1. A-004 ArchitectAgent
- Finalize playback state transitions and event payloads for record/play/stop/scrub.
- Acceptance: `MODE_TOOL_STATE.md` and/or `TIMELINE_RECORDING.md` includes transition table and deterministic timing notes.

2. N-002 AnimationAgent
- Replace synthetic-only flow with recorder capture of actuator transforms from live edits over time.
- Acceptance: capture produces clip data from actual actuator motion and replays deterministically.

3. N-003 AnimationAgent
- Add timeline scrub control + frame stepping bound to deterministic playback clock.
- Acceptance: user can scrub to any time and get stable replay pose for same clip.

4. Q-005 QAAgent
- Add test coverage for playback determinism across repeated runs.
- Acceptance: `npm test` includes playback regression tests passing in CI/local.

5. Q-006 QAAgent
- Execute and update manual checklist for Sprint 02 playback features.
- Acceptance: `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 02 playback evidence and sign-off notes.

## Exit Criteria
- Record/playback uses live captured transform data (not only synthetic generation).
- Playback scrub/step controls produce stable results.
- Automated tests cover playback determinism baseline.
- Manual XR/desktop checklist executed for Sprint 02 playback scope.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Do not regress Sprint 01 mesh + rigging workflow.
