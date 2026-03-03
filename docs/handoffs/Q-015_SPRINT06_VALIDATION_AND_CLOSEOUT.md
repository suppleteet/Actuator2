# Task
- ID: Q-015
- Title: Sprint 06 validation checklist expansion + sprint close-out
- Role: QAAgent

# Summary
- What changed:
  - Expanded `docs/checklists/XR_DESKTOP_VALIDATION.md` with Sprint 06 evidence lanes:
    - XR tool mesh + input mapping checks
    - physics feel regression checks
    - GitHub Pages workflow/deploy verification
    - known environment/device limitations
  - Updated `docs/checklists/PR_CHECKLIST.md` with Sprint 06 close-out checklist entries.
  - Updated `docs/planning/SPRINT_06.md` task board statuses + close-out evidence references.
- Why:
  - Sprint 06 requires explicit pass/fail evidence and continuity-ready closure artifacts before merge.

# Contract References
- Files:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/RIG_RUNTIME.md`
  - `docs/contracts/SCENE_SCHEMA.md`
- Contract change required: no

# Validation
- Unit/integration/manual evidence:
  - `npm test` passed.
  - `npm run build` passed.
  - `VITE_BASE_PATH=/<repo-name>/ npm run build` passed.
  - Manual XR hardware verification: pending (documented as environment limitation).
  - GitHub Actions Pages deploy verification: pending remote run (documented).
- Perf notes:
  - No new runtime systems in QA task; references existing solver tuning perf caveat from `R-010` handoff.

# Risks / Follow-ups
- Known issues:
  - Final XR parity confidence requires target headset/browser pass.
  - GitHub Pages deployment confidence requires first successful remote Actions run.
- Next owner:
  - Release gate review (QAAgent + ArchitectAgent sign-off on pending manual/device checks before main merge).
