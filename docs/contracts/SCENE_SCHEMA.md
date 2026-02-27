# Scene Schema v0

Status: finalized for Sprint 01 persistence baseline (`A-003`).

## Goals
- Provide a deterministic, serializable scene document.
- Support stable IDs for save/load, selection, playback, and migration.
- Keep engine-agnostic shape while mapping cleanly to Web runtime systems.

## Root Document

```ts
type SceneDocument = {
  version: "0.1.0";
  sceneId: string;
  createdAtUtc: string;   // ISO-8601
  updatedAtUtc: string;   // ISO-8601
  characters: CharacterDocument[];
  playback: PlaybackDocument;
  metadata?: Record<string, string>;
};
```

## Required Fields (Save/Load Contract)

Required root keys:
- `version`
- `sceneId`
- `createdAtUtc`
- `updatedAtUtc`
- `characters`
- `playback`

Required character keys:
- `id`
- `name`
- `mesh`
- `rig`
- `skinBinding`
- `channels`

Required actuator keys:
- `id`
- `parentId`
- `type`
- `shape`
- `transform`
- `size`
- `joint`
- `physics`
- `influence`

## Character Document

```ts
type CharacterDocument = {
  id: string;
  name: string;
  mesh: MeshRef;
  rig: RigDocument;
  skinBinding: SkinBindingDocument;
  channels: ExpressionChannelsDocument;
};
```

## Mesh Reference

```ts
type MeshRef = {
  meshId: string;         // stable ID within scene
  uri: string;            // relative path or URL
  nodePath?: string;      // optional source node path in imported asset
};
```

## Sprint 01 Mesh Import Constraints (`A-005`)

These constraints define the current migration boundary for mesh integration work:

- Supported source baseline for Sprint 01:
  - Unity baseline `30c6ea7` Chad asset set migrated to web assets path (`assets/chad/*`).
  - Runtime import path currently targets `assets/chad/Chad.fbx`.
- Runtime behavior boundary:
  - Mesh-only rendering path is in scope.
  - Embedded skeleton, animation clips, and playback coupling are out of scope for Sprint 01 runtime integration.
- Material handling baseline:
  - Runtime consumes texture maps from migrated Chad asset folder when available.
  - Unity `.mat` files are treated as source references; runtime shading uses explicit web material setup.
  - Missing maps must fall back to deterministic default material values (no random or device-specific variation).
- Mesh identity and determinism:
  - `mesh.meshId` must remain stable for the same imported source asset.
  - `mesh.uri` must be a deterministic relative runtime path.
  - `mesh.nodePath` is optional and may be omitted for single-mesh import usage.

## Rig

```ts
type RigDocument = {
  rootActuatorId: string;
  actuators: ActuatorNodeDocument[];
};
```

## Actuator Node

```ts
type ActuatorNodeDocument = {
  id: string;
  parentId: string | null;
  type: "root" | "spine" | "limb" | "joint" | "secondary" | "custom";
  shape: "capsule" | "sphere" | "box";
  transform: TransformDocument;
  size: Vec3;
  joint: JointDocument;
  physics: PhysicsDocument;
  influence: InfluenceDocument;
};
```

## Shared Value Types

```ts
type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

type TransformDocument = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};
```

## Joint/Physics/Influence

```ts
type JointDocument = {
  mode: "fixed" | "limited";
  angularLimitDeg: Vec3;     // per-axis limit
  swingLimitDeg: number;
  twistLimitDeg: number;
};

type PhysicsDocument = {
  mass: number;
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  kinematicInRigMode: boolean;
};

type InfluenceDocument = {
  radius: number;
  falloff: number;
  weight: number;
  mirrorGroup?: string;
};
```

## Skin Binding

```ts
type SkinBindingDocument = {
  version: string;
  solver: "closestVolume";
  meshHash: string;
  bindingHash: string;
  generatedAtUtc: string;   // ISO-8601
  influenceCount: number;
};
```

## Channels + Playback

```ts
type ExpressionChannelsDocument = {
  look: { yaw: number; pitch: number };
  blink: { left: number; right: number };
  custom: Record<string, number>;
};

type PlaybackDocument = {
  fps: number;
  durationSec: number;
  activeClipId: string | null;
};
```

## Invariants
- `version` must be set and semver-like; this contract locks `0.1.0`.
- `sceneId`, character IDs, and actuator IDs are immutable once created.
- Each character must have exactly one `rootActuatorId`.
- `rootActuatorId` must exist in `actuators`.
- Actuator graph must be acyclic.
- `parentId = null` only for the root actuator.
- Quaternion values must be finite numbers.
- Serialization order must be stable:
  - `characters` sorted by `id`
  - each `actuators` list sorted by `id`

## Multi-Rig Scene Rules (`A-006`)

- A scene may contain multiple independent character rigs via `characters[]`.
- Actuator IDs must be globally unique across the full scene (not only within a single character).
- Parent-child relationships are constrained to the same character rig.
- Cross-rig parenting is invalid and must be rejected during validation/load.
- Selection and tool operations may target actuators across rigs, but serialization must preserve per-character rig ownership.
- Deterministic ordering still applies scene-wide (`characters` then each character's `actuators`).

## Load Defaults (Explicit Materialization)

Loader must materialize explicit values so runtime behavior is deterministic:

- Missing `metadata` -> `{}`.
- Missing `mesh.nodePath` -> omitted (do not synthesize a placeholder path).
- Missing `channels.custom` -> `{}`.
- Missing `playback.activeClipId` -> `null`.

No other required field can be omitted; documents missing required fields are invalid and must be rejected before runtime mutation.

## Round-Trip Behavior

`save(load(doc))` and `load(save(state))` must be deterministic:
- Preserve immutable identifiers (`sceneId`, character IDs, actuator IDs).
- Preserve actuator parent graph topology and transforms.
- Preserve explicit value types (numbers remain numbers, booleans remain booleans).
- Preserve sorted output order for `characters` and `actuators`.
- `updatedAtUtc` may change on save; all other persisted fields must remain equivalent unless edited by user action.

## Determinism Notes
- Save then immediate load must yield equivalent document data (modulo `updatedAtUtc`).
- Playback/runtime systems must consume only serialized values, not editor transient state.
- Defaults must be explicit at serialization time (no hidden engine defaults).

## Migration Note Format

When schema or load behavior changes, record a migration note entry in task/PR docs using this format:

```md
Migration Note:
- schema_version_from:
- schema_version_to:
- change_summary:
- backward_compat_strategy:
- deterministic_impact:
- required_rewrite: yes/no
```

Use `required_rewrite: yes` only if a saved document must be rewritten to remain valid.

## Sample JSON Payload

```json
{
  "version": "0.1.0",
  "sceneId": "scene_main",
  "createdAtUtc": "2026-02-26T00:00:00Z",
  "updatedAtUtc": "2026-02-26T00:00:00Z",
  "characters": [
    {
      "id": "char_001",
      "name": "EndBoss",
      "mesh": {
        "meshId": "mesh_endboss",
        "uri": "assets/characters/endboss.glb",
        "nodePath": "/Armature/Body"
      },
      "rig": {
        "rootActuatorId": "act_root",
        "actuators": [
          {
            "id": "act_root",
            "parentId": null,
            "type": "root",
            "shape": "capsule",
            "transform": {
              "position": { "x": 0, "y": 1, "z": 0 },
              "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
              "scale": { "x": 1, "y": 1, "z": 1 }
            },
            "size": { "x": 0.3, "y": 0.8, "z": 0.3 },
            "joint": {
              "mode": "fixed",
              "angularLimitDeg": { "x": 0, "y": 0, "z": 0 },
              "swingLimitDeg": 0,
              "twistLimitDeg": 0
            },
            "physics": {
              "mass": 1,
              "linearDamping": 2,
              "angularDamping": 2,
              "gravityScale": 1,
              "kinematicInRigMode": true
            },
            "influence": {
              "radius": 0.8,
              "falloff": 1,
              "weight": 1
            }
          }
        ]
      },
      "skinBinding": {
        "version": "0.1",
        "solver": "closestVolume",
        "meshHash": "meshhash_001",
        "bindingHash": "bindhash_001",
        "generatedAtUtc": "2026-02-26T00:00:00Z",
        "influenceCount": 1
      },
      "channels": {
        "look": { "yaw": 0, "pitch": 0 },
        "blink": { "left": 0, "right": 0 },
        "custom": {}
      }
    }
  ],
  "playback": {
    "fps": 60,
    "durationSec": 10,
    "activeClipId": null
  },
  "metadata": {
    "sourceBaseline": "30c6ea7"
  }
}
```
