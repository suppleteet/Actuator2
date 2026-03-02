# Task
- ID: I-013, I-014, Q-013
- Title: Sprint 04 polish: view cube, camera orientation stability, mirrored transform propagation, actuator visual parity
- Role: InteractionAgent + RuntimeAgent + QAAgent

## Summary
- What changed:
  - Replaced the previous 2D axis button cluster with a true 3D view-cube gizmo in the viewport overlay (`top-right`).
  - Added clickable cube faces for axis-aligned view snapping and projection toggle integration.
  - Added camera orientation smoothing/locking fixes to prevent roll when tumbling out of locked axis views.
  - Fixed view-cube orientation mapping so scene up-vector and cube up-vector are aligned.
  - Fixed mirrored transform propagation so descendants touched by parent transform deltas are included in mirrored edit operations.
  - Updated actuator rendering to match Unity visual behavior (non-additive primitive-style shading, Unity preset/state color mapping).
  - Reduced view-cube footprint and swapped projection button labels (`Persp`/`Ortho`) per UX request.
- Why:
  - Close Sprint 04 UX/parity polish items for camera/navigation and mirrored edit consistency, and align actuator visual language to Unity baseline.

## Contract References
- Files:
  - `docs/contracts/MODE_TOOL_STATE.md`
  - `docs/contracts/RIG_RUNTIME.md`
- Contract change required: no

## Validation
- Unit/integration/manual evidence:
  - `npm run build` (pass)
  - `npm test` (pass)
  - Manual verification performed for:
    - View-cube face snapping + projection toggling
    - Tumble behavior after axis-locked views (no unintended roll)
    - Mirrored counterpart and child-chain transform propagation during repeated edits
- Perf notes:
  - View-cube is lightweight DOM/CSS + per-frame quaternion mapping; no material runtime impact observed in scene update path.

## Risks / Follow-ups
- Known issues:
  - Sprint 04 inside-mesh placement behavior is not fully closed for parity and requires dedicated follow-up.
  - Mirror matching still assumes world X center-plane conventions and heuristic counterpart resolution.
- Next owner:
  - InteractionAgent + RuntimeAgent for Sprint 05 carry-over on inside-mesh placement parity and mirror operation hardening.
