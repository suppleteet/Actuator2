# Rig Runtime Contract v0

## Responsibilities
- Maintain runtime rig graph from SceneDocument.
- Bind graph nodes to render + physics handles.
- Provide stable IDs for selection, recording, and serialization.
- Preserve deterministic `Rig` authoring state across `Sim` enable/disable transitions.

## APIs (conceptual)
- createRig(characterId)
- upsertActuator(node)
- removeActuator(nodeId)
- setSimulation(enabled)
- resetToBindPose()
- snapshotAuthoringState()
- restoreAuthoringState()

## Invariants
- Root actuator exists for each rig.
- Parent-child graph is acyclic.
- Joint constraints resolve only against existing parent handles.
- Primitive dimensions (`size` and pivot metadata) are canonical authoring data; runtime transform scale is not used as a persistent primitive-sizing channel.
- Entering simulation must not mutate canonical authoring state unless explicitly committed by a future workflow.
