# Rig Runtime Contract v1

Status: updated for Sprint 07 workflow and IO/import seams (`R-011`, `I-020`, `N-005`).

## Responsibilities

- Maintain runtime rig graph from `SceneDocument`.
- Bind graph nodes to render + physics handles.
- Provide stable IDs for selection, recording, serialization, bake capture, and export.
- Preserve deterministic authoring state across workflow and simulation transitions.
- Provide deterministic import integration seam for normalized meshes.

## APIs (conceptual)

- `createRig(characterId)`
- `upsertActuator(node)`
- `removeActuator(nodeId)`
- `setSimulation(enabled)`
- `snapshotAuthoringState()`
- `restoreAuthoringState(snapshot)`
- `integrateImportedMesh(meshDescriptor)`
- `captureBakeFrame(timeSec)`

## Workflow Ownership Interop

- In `Rigging`:
  - runtime accepts topology mutation and direct authoring transforms
- In `Animation`:
  - runtime topology mutation is rejected
  - transform writes from authoring tools are rejected
  - timeline sample application is allowed
- In `Puppeteering`:
  - runtime receives physics-driven transforms
  - canonical authoring state remains protected by snapshot/restore boundary

## Invariants

- Root actuator exists for each rig.
- Parent-child graph is acyclic and stays within owning rig.
- Joint constraints resolve only against existing parent handles.
- Primitive dimensions (`size`, pivot metadata) remain canonical authoring data.
- Runtime transform scale is never used as persistent primitive-size authoring data.
- Entering simulation must not mutate canonical authoring state unless a future explicit commit contract is introduced.
- Import integration cannot mutate existing IDs or reorder existing rig topology nondeterministically.
