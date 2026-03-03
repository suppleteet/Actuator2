# Agent Team Workflow

## Objective
Run multiple agents in parallel with low merge conflict risk and clear ownership.
Strict continuity is the default for all migration tasks; see `docs/STRICT_CONTINUITY.md`.

## Execution Model
1. ArchitectAgent defines/updates contracts first.
2. Specialist agents implement against approved contracts.
3. QAAgent validates behavior, tests, and performance gates.
4. Integration happens through small sequential merges to `main`.

## Parallel Work Lanes
- Lane A (Architecture): schema, store contracts, serialization contracts.
- Lane B (Runtime): rig entities, physics adapters, sim toggle/reset.
- Lane C (Interaction): XR input abstraction, tools, selection/highlights.
- Lane D (Animation): recorder, timeline primitives, playback evaluator.
- Lane E (Quality): test harness, golden scenes, perf metrics.

## Coordination Cadence
- Daily contract sync (short): interface changes, blockers, collisions.
- Mid-sprint integration checkpoint: merge contract-compatible slices only.
- End-sprint hardening: bugfixes, perf tuning, docs alignment.

## Handoff Standard
Each completed task must include:
- What changed
- Why it changed
- Contract references
- Validation evidence
- Known risks / next expected consumer

Use `docs/handoffs/HANDOFF_TEMPLATE.md`.

## Conflict Resolution
- Contract conflict: ArchitectAgent decides and updates contract docs.
- Runtime vs Interaction conflict: prioritize user-facing stability; fallback to adapter layer.
- Playback ownership conflicts: AnimationAgent defines source-of-truth timing; RuntimeAgent defines transform application order.

## Definition of Ready
Task is ready when:
- Scope is <2 days of focused effort.
- Contract references are explicit.
- Acceptance criteria are testable.

## Definition of Done
Task is done when:
- Code merged and contract-compliant.
- Tests/checklist updated.
- Handoff note published.
- Continuity close-out checklist is complete.
