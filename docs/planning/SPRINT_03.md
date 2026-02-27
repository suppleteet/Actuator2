# Sprint 03 - Playback Foundations

## Sprint Goal
Resume animation playback lane after multi-rig and skinning foundations stabilize.

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

4. Q-007 QAAgent
- Add test coverage for playback determinism across repeated runs.
- Acceptance: `npm test` includes playback regression tests passing in CI/local.

5. Q-008 QAAgent
- Execute and update manual checklist for Sprint 03 playback features.
- Acceptance: `docs/checklists/XR_DESKTOP_VALIDATION.md` includes Sprint 03 playback evidence and sign-off notes.

## Exit Criteria
- Record/playback uses live captured transform data (not only synthetic generation).
- Playback scrub/step controls produce stable results.
- Automated tests cover playback determinism baseline.
- Manual XR/desktop checklist executed for Sprint 03 playback scope.

## Scope Notes
- Preserve strict continuity and contract-first workflow.
- Do not regress Sprint 02 multi-rig + skinning workflow.
