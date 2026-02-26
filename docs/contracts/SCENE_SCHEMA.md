# Scene Schema v0

Status: finalized for Sprint 00 baseline (`A-001`).

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

## Determinism Notes
- Save then immediate load must yield equivalent document data (modulo `updatedAtUtc`).
- Playback/runtime systems must consume only serialized values, not editor transient state.
- Defaults must be explicit at serialization time (no hidden engine defaults).

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
