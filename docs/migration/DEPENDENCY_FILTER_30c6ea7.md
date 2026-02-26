# Dependency Filter (Actuator-First)

Scope analyzed: `Assets/Actuator` from Unity baseline commit `30c6ea7`.

Supporting scan output:

- [actuator_dependency_scan_30c6ea7.json](/c:/Projects/Actuator2/docs/migration/actuator_dependency_scan_30c6ea7.json)

## Decision

Yes, we can treat non-`Actuator` folders as ignored by default.

Use this rule:

- Start from `Assets/Actuator` only.
- Pull in external files only when directly referenced by GUID or required namespace.

## Must Keep (Referenced by Actuator)

These are directly referenced by `Assets/Actuator` scenes/prefabs/assets:

1. `Assets/ThirdParty/DeltaMush/DeltaMushSkinnedMesh.cs`
2. `Assets/ThirdParty/DeltaMush/DuctTapeToStandard/DeltaMushStandard.shader`
3. `Assets/ThirdParty/DeltaMush/Resources/DeltaMush.compute`
4. `Assets/Supercyan Character Pack Animal People Sample/Models/animal_people_wolf_1.fbx`
5. `Assets/Supercyan Character Pack Animal People Sample/Materials/High Quality/animal_people_wolf_supercyan_material_body.mat`
6. `Assets/Supercyan Character Pack Animal People Sample/Materials/High Quality/animal_people_wolf_supercyan_material_head.mat`
7. `Assets/Standard Assets/Utility/DragRigidbody.cs` (referenced by `XRRig.prefab`, Unity-specific)
8. `Assets/Tests/Mike/Prefabs/dickhead_combined.prefab` (only needed if migrating `Dickhead.unity`)

## Code-Level External Dependencies

Namespaces used from `Assets/Actuator/Scripts`:

- `CjLib` (debug drawing utility usage)
- `SimpleFileBrowser` (import dialog support)
- `Sirenix.OdinInspector` (inspector attributes/editor convenience)

Migration implication:

- For Web migration, these are generally implementation details, not product contracts.
- Keep them as behavior reference only; do not mirror Unity plugin architecture.

## Safe To Ignore By Default

Unless later explicitly scoped:

- `Assets/Gentle`
- Most of `Assets/Plugins` (except if needed for code reading context)
- Most of `Assets/Standard Assets` (except `DragRigidbody.cs` reference context)
- Most of `Assets/Supercyan Character Pack Animal People Sample` (keep only referenced wolf files unless adding that demo flow)
- Most of `Assets/Tests` (except assets tied to scenes you intentionally migrate)
- `Assets/ThirdParty/Example`

## Practical Migration Scope

Primary source of truth:

- `Assets/Actuator/Scripts`
- `Assets/Actuator/Resources`
- `Assets/Actuator/Examples/Scenes`
- `Assets/Actuator/Exports`

Secondary pull-in:

- External assets listed in "Must Keep", on-demand only.
