# Rig Runtime Contract v0

## Responsibilities
- Maintain runtime rig graph from SceneDocument.
- Bind graph nodes to render + physics handles.
- Provide stable IDs for selection, recording, and serialization.

## APIs (conceptual)
- createRig(characterId)
- upsertActuator(node)
- removeActuator(nodeId)
- setSimulation(enabled)
- resetToBindPose()

## Invariants
- Root actuator exists for each rig.
- Parent-child graph is acyclic.
- Joint constraints resolve only against existing parent handles.
