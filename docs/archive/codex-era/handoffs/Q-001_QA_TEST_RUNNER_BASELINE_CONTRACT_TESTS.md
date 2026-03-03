# Handoff Note

## Task
- ID: Q-001
- Title: Establish test runner + baseline contract tests
- Role: QAAgent

## Summary
- What changed:
  - Added `vitest` test runner and npm scripts:
    - `npm test`
    - `npm run test:watch`
  - Added baseline contract tests:
    - scene schema invariants + stable serialization
    - deterministic timeline/recording playback clock behavior
  - Added shared scene contract helper module for validation logic used by tests.
- Why:
  - Provide CI-ready local test command and enforce deterministic contract baselines.

## Contract References
- Files:
  - `docs/contracts/SCENE_SCHEMA.md`
  - `docs/contracts/TIMELINE_RECORDING.md`
  - `docs/contracts/MODE_TOOL_STATE.md`
- Contract change required: no

## Validation
- Unit/integration/manual evidence:
  - `npm test` passes.
  - `npm run build` remains passing.
- Perf notes:
  - Test suite is lightweight and runs quickly for CI baseline.

## Risks / Follow-ups
- Known issues:
  - Tests currently target core contract invariants and deterministic playback seams, not full UI interaction coverage.
- Next owner:
  - QAAgent for incremental expansion and CI wiring
