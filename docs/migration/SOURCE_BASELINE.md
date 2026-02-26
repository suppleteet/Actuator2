# Source Baseline (Locked)

This migration uses the Unity `Actuator` repository at commit:

- `30c6ea7288396171a03a27cc605af7c0ccd3aaf7` (`30c6ea7`)
- Commit title: `initial project push`
- Commit date: 2026-01-28

## Why this baseline

- This is the first commit containing the full original 2019 project files.
- Later commits by Mike Mandel add project-specific feature work that is out of migration scope.
- Default migration rule: ignore post-`30c6ea7` feature deltas unless explicitly approved.

## Baseline Snapshot Summary

Generated from `c:\Projects\Actuator` into:

- [unity_inventory_30c6ea7.json](/c:/Projects/Actuator2/docs/migration/unity_inventory_30c6ea7.json)

Key totals:

- `scenes`: 20
- `prefabs`: 46
- `scripts`: 115
- `models`: 16
- `materials`: 25
- `textures`: 37
- `controllers`: 1

Core source folders:

- `Assets/Actuator`
- `Assets/Gentle`
- `Assets/Resources`
- `Assets/Standard Assets`
- `Assets/Supercyan Character Pack Animal People Sample`
- `Assets/Tests`
- `Assets/ThirdParty`

## Repro Command

```powershell
node scripts/extract-unity-inventory.mjs --source c:\Projects\Actuator --out docs\migration\unity_inventory_30c6ea7.json
```

## Continuity Rule

Any migration task that depends on Unity source behavior must reference this baseline file and the inventory JSON.
