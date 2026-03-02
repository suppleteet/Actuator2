# Actuator2

Browser-based WebXR migration of the legacy Unity Actuator tool.

## Quick Start

1. Review workflow docs in `docs/TEAM_WORKFLOW.md`.
2. Start from Sprint 0 in `docs/planning/SPRINT_00.md`.
3. Follow role contracts in `AGENTS.md` and `docs/contracts/README.md`.
4. Apply strict continuity protocol in `docs/STRICT_CONTINUITY.md`.

## Current Status

- Repository initialized
- Agent-team workflow scaffolded
- Runtime bootstrap complete (`R-001`)
- XR entry + desktop fallback controls complete (`I-001`)
- Runtime actuator prototype complete (`R-002`)
- Animation recorder/playback stub complete (`N-001`)
- QA test runner + baseline contract tests complete (`Q-001`)
- QA manual XR/desktop checklist complete (`Q-002`)

## GitHub Pages Build

- Build with base-path safety: set `VITE_BASE_PATH=/<repo-name>/` before `npm run build`.
- CI workflow `/.github/workflows/sprint-pages.yml` builds on branch pushes and deploys on `main`.
