# Actuator2

Browser-based WebXR migration of the legacy Unity Actuator tool.

## Quick Start

1. Read **`docs/PROJECT.md`** for project context, Unity baseline, contracts, and codebase shape.
2. Use **`AGENTS.md`** for roles and where the Cursor agent gets its instructions.
3. See **`docs/CURSOR_SETUP.md`** for how Cursor is configured (rules, checklist).

## Current Status

- Runtime bootstrap, XR + desktop controls, actuator prototype, animation recorder/playback stub, QA test runner and checklist are in place.
- Workflow modes (Rigging / Animation / Puppeteering), scene save/load, mesh import, and bake/export scaffolding are in place. See `docs/PROJECT.md` and the contracts in `docs/contracts/`.

## GitHub Pages Build

- Build with base-path safety: set `VITE_BASE_PATH=/<repo-name>/` before `npm run build`.
- CI: `/.github/workflows/sprint-pages.yml` builds on branch pushes and deploys on the default branch.
