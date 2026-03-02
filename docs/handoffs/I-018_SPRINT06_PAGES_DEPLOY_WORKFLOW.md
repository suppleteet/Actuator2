# Task
- ID: I-018
- Title: GitHub Pages sprint-end deploy workflow + base-path-safe build
- Role: InteractionAgent

# Summary
- What changed:
  - Added Pages workflow `/.github/workflows/sprint-pages.yml`:
    - build + artifact upload on `feat/*`, `fix/*`, `chore/*`, and `main` pushes,
    - deploy to GitHub Pages only on `main`.
  - Updated `vite.config.ts` to compute `base` from `VITE_BASE_PATH` with safe normalization.
  - Added repo usage note in `README.md` for Pages base-path builds.
- Why:
  - Sprint 06 requires repeatable sprint-end publishing with branch dry-runs and production deploy on main.

# Contract References
- Files:
  - `docs/contracts/MODE_TOOL_STATE.md` (no semantic impact)
  - `docs/contracts/SCENE_SCHEMA.md` (no semantic impact)
- Contract change required: no

# Validation
- Unit/integration/manual evidence:
  - `npm test` passed.
  - `npm run build` passed.
  - `VITE_BASE_PATH=/<repo-name>/ npm run build` passed (local base-path-safe output).
- Perf notes:
  - CI adds one build + artifact upload on branch pushes; deploy job remains main-only.

# Risks / Follow-ups
- Known issues:
  - Remote GitHub Pages permission/environment setup must exist in repository settings for first deploy.
- Next owner:
  - QAAgent for deployment verification checklist evidence in Q-015.
