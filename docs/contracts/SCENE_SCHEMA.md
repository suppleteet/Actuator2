# Scene Schema + IO Envelope v1

Status: finalized for Sprint 07 scene IO scaffolding (`A-011`, `R-011`).

## Goals

- Preserve deterministic save/load behavior across workflows.
- Separate transport-level compatibility from scene-content schema.
- Provide explicit migration hooks for future upgrades.

## Persisted Root Envelope (new in Sprint 07)

```ts
type SceneEnvelope = {
  format: "actuator2.scene";
  envelopeVersion: "1.0.0";
  compatibility: {
    minReaderVersion: "1.0.0";
    policy: "reject-unsupported";
  };
  savedAtUtc: string; // ISO-8601
  workflowMode: "Rigging" | "Animation" | "Puppeteering";
  importedMeshes: ImportedMeshDocument[];
  scene: SceneDocument;
};
```

`SceneDocument` remains the deterministic scene payload shape used since Sprint 01 and still carries:
- rig topology
- actuator transforms and primitive sizes
- playback envelope fields
- stable IDs

## Scene Payload (unchanged schema lock)

```ts
type SceneDocument = {
  version: "0.1.0";
  sceneId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  characters: CharacterDocument[];
  playback: PlaybackDocument;
  metadata?: Record<string, string>;
};
```

## Imported Mesh Records

```ts
type ImportedMeshDocument = {
  id: string; // deterministic scene-stable ID
  format: "fbx" | "glb" | "obj" | "unknown";
  displayName: string;
  sourceUri: string; // blob URL, relative path, or absolute URL
  importedAtUtc: string;
};
```

## Required Envelope Fields

- `format`
- `envelopeVersion`
- `compatibility`
- `savedAtUtc`
- `workflowMode`
- `importedMeshes`
- `scene`

If any required field is missing or invalid:
- loader must fail fast with explicit error
- runtime/editor state must remain unchanged

## Deterministic Serialization Rules

- Envelope keys are emitted in stable order.
- `scene.characters` are sorted by `id`.
- Each character `rig.actuators` list is sorted by `id`.
- `importedMeshes` are sorted by `id`.
- IDs are restored exactly as serialized (no remapping).

## Round-Trip Contract

`save(load(payload))` and `load(save(state))` must preserve:
- `sceneId`, character IDs, actuator IDs, mesh IDs
- parent graph topology
- transform and primitive-size values
- workflow mode and imported mesh metadata

Allowed mutation on save:
- `savedAtUtc`
- `scene.updatedAtUtc`

## Compatibility + Migration Policy

- Supported envelope versions in Sprint 07: `1.0.0`
- Default policy: `reject-unsupported`
- Migration entrypoint must exist:

```ts
type SceneEnvelopeMigrator = (raw: unknown) => SceneEnvelope;
```

Rules:
- Migrators must be pure and deterministic.
- Unknown versions must return explicit failure.
- No in-place mutation of caller-owned objects.

## Failure Surface Contract

Load failures must include:
- machine-readable code (`unsupported_version`, `invalid_payload`, `invalid_scene`)
- human-readable message suitable for UI status reporting

## Migration Note Format

```md
Migration Note:
- schema_version_from:
- schema_version_to:
- change_summary:
- backward_compat_strategy:
- deterministic_impact:
- required_rewrite: yes/no
```
