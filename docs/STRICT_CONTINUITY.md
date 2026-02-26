# Strict Continuity Protocol (Migration Default)

This protocol is mandatory for Actuator2 migration work on `main` and migration feature branches.

## Task Kickoff (Required)

Before starting implementation, every task must explicitly confirm:
- Scope and non-goals.
- Role owner (Architect/Runtime/Interaction/Animation/QA).
- Contract references in `docs/contracts`.
- Acceptance criteria and validation method.

## During Execution (Required)

- Keep changes scoped to one lane unless contract change is approved.
- If a contract must change, update contract docs first in a dedicated PR.
- Record implementation decisions that affect downstream lanes.
- Maintain deterministic behavior for save/load and playback.

## Task Handoff (Required)

Every completed task must include a handoff note using:
- `docs/handoffs/HANDOFF_TEMPLATE.md`

Handoff notes must include:
- What changed and why.
- Contract references.
- Validation evidence.
- Risks and next owner.

## Task Close-Out (Required)

Before merge:
- `docs/checklists/PR_CHECKLIST.md` is complete.
- Contract compliance is confirmed.
- Follow-up items are assigned to a role and tracked in sprint docs.

## When You Can Relax This Protocol

Only for short-lived spike branches explicitly labeled as spikes.
Spikes must not merge into `main` without being reworked under this protocol.
