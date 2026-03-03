# Timeline + Recording + Bake Export Contract v1

Status: updated for Sprint 07 bake/export scaffolding (`N-005`, `N-006`).

## Capture Targets

- Actuator local transforms
- Expression channels (look, blink, custom)
- Baked simulation transform frames

## Concepts

- Track: owns keys for one target channel.
- Clip: bounded time region referencing one or more tracks.
- Layer: additive or override composition group.
- Bake cache: deterministic frame-indexed transform snapshot set.
- Export job: conversion request from bake cache into interchange artifact.

## Rules

- Recording never mutates bind pose data.
- Playback is deterministic for equal input data.
- Bake capture never mutates source authoring rig state.
- Export adapters are pure with respect to `(cache, options)`.
- Layer blend order is explicit and serialized.

## Deterministic Timing

- Clip sampling time domain is `[0, durationSec]`.
- Runtime playback uses fixed-step tick size `1 / fps`.
- Bake capture samples frame `i` at `timeSec = i / fps`.
- `play` from stopped starts at `t=0`.
- `stop` resets timeline time to `t=0`.
- `scrub(t)` clamps to `[0, durationSec]` before evaluation.

## Bake Cache Contract

```ts
type BakeCache = {
  cacheId: string;
  fps: number;
  startFrame: number;
  endFrame: number;
  actuatorIds: string[]; // sorted
  frames: Array<{
    frame: number;
    timeSec: number;
    transforms: Record<string, TransformSample>;
  }>;
};
```

Rules:
- `actuatorIds` must be sorted lexicographically.
- `frames` must be contiguous and sorted by `frame`.
- Equal input + equal frame range must produce identical serialized cache.

## Export Job Contract

```ts
type ExportFormatId = "bvh" | "fbx" | "glb";

type ExportJobRequest = {
  format: ExportFormatId;
  cache: BakeCache;
  sceneId: string;
};

type ExportJobResult =
  | { status: "success"; format: ExportFormatId; fileName: string; mimeType: string; content: string }
  | { status: "unsupported"; format: ExportFormatId; reason: string }
  | { status: "failed"; format: ExportFormatId; reason: string };
```

Capability matrix baseline:
- `bvh`: implemented in Sprint 07 baseline.
- `fbx`: declared, not implemented (must return explicit `unsupported`).
- `glb`: declared, not implemented (must return explicit `unsupported`).

## Determinism Validation Baseline

- Equal capture input sequence must generate equal clip data.
- Equal clip + equal scrub time must generate equal sampled pose.
- Equal clip + equal play event sequence must generate equal per-step sampled pose sequence.
- Equal bake input + equal frame range must generate equal bake cache.
- Equal export input + equal adapter version must generate equal file content.
