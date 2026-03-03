# Handoff Note

## Task
- ID: A-005
- Title: Define Sprint 01 mesh-import constraints
- Role: ArchitectAgent

## Summary
- What changed:
  - Updated [SCENE_SCHEMA.md](/c:/Projects/Actuator2/docs/contracts/SCENE_SCHEMA.md) with `Sprint 01 Mesh Import Constraints (A-005)` section.
  - Added explicit constraints for:
    - supported source baseline (`30c6ea7` Chad assets via `assets/chad/*`)
    - mesh-only runtime behavior boundary
    - material handling baseline and deterministic fallbacks
    - deterministic mesh identity (`meshId`, `uri`, optional `nodePath`)
- Why:
  - Close the contract gap so Runtime/Interaction/QA lanes rely on explicit import rules rather than inferred implementation behavior.

## Contract References
- Files:
  - `docs/contracts/SCENE_SCHEMA.md`
- Contract change required: yes (clarification/constraints only; schema version unchanged)

## Validation
- Unit/integration/manual evidence:
  - Contract docs updated to match current Sprint 01 mesh-first scope and existing runtime behavior.
- Perf notes:
  - None (documentation-only task).

## Risks / Follow-ups
- Known issues:
  - Constraints are intentionally Sprint 01 scoped and must be expanded when multi-asset import support is introduced.
- Next owner:
  - InteractionAgent (`I-003`)
  - QAAgent (`Q-003`, `Q-004`)
