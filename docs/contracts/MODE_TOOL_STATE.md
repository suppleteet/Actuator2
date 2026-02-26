# Mode + Tool State Contract v0

Status: finalized for Sprint 01 playback transition baseline (`A-004`).

## Modes
- `Rig`
- `Sim`
- `RecordPlayback`

## Playback States
- `Stopped`
- `Playing`
- `Scrubbing`

## Input Hands
- `primary`
- `secondary`

## Tool IDs
- `none`
- `drawActuator`
- `grab`
- `adjust`
- `select`
- `tumble`

## Core State Shape

```ts
type AppModeState = {
  mode: "Rig" | "Sim" | "RecordPlayback";
  playbackState: "Stopped" | "Playing" | "Scrubbing";
  physicsEnabled: boolean;
  skinningBusy: boolean;
  activeToolsByHand: {
    primary: ToolId;
    secondary: ToolId;
  };
  selection: {
    actuatorIds: string[];
    characterIds: string[];
  };
  pendingTransition: ModeEventType | null;
};
```

## Events

```ts
type ModeEventType =
  | "ModeRequested"
  | "ModeEntered"
  | "ModeRejected"
  | "PhysicsRequested"
  | "PhysicsChanged"
  | "PlaybackRequested"
  | "PlaybackChanged"
  | "ToolRequested"
  | "ToolChanged"
  | "SelectionChanged";
```

## Transition Rules

### 1) `Rig -> Sim`
- Precondition: `skinningBusy = false`.
- Action: request physics enable.
- Completion: `mode = Sim`, `physicsEnabled = true`.
- Default tools:
  - `primary = grab`
  - `secondary = grab`

### 2) `Sim -> Rig`
- Precondition: none.
- Action: disable physics with deterministic reset/blend-off.
- Completion: `mode = Rig`, `physicsEnabled = false`.
- Default tools:
  - `primary = drawActuator`
  - `secondary = grab`

### 3) `Rig -> RecordPlayback`
- Precondition: scene contains >= 1 character and valid rig root.
- Action: initialize playback clock to deterministic tick source.
- Completion: `mode = RecordPlayback`, `playbackState = Stopped`, `physicsEnabled = false`.
- Default tools:
  - `primary = grab`
  - `secondary = grab`

### 4) `RecordPlayback -> Rig`
- Precondition: none.
- Action: stop playback and flush runtime transient track state.
- Completion: `mode = Rig`, `playbackState = Stopped`.

### 5) Rejections
- Any mode request that violates preconditions emits `ModeRejected` with reason and leaves state unchanged.

## Tool Gating Matrix

Allowed tools by mode:

- `Rig`: `drawActuator`, `grab`, `adjust`, `select`, `tumble`
- `Sim`: `grab`, `tumble`, `select`
- `RecordPlayback`: `grab`, `select`, `tumble`

If disallowed tool is requested:
- reject via `ToolChanged` with previous tool state unchanged.

## Determinism Rules
- All mode/tool transitions are event-driven and serialized through a single reducer/dispatcher.
- For equal prior state + equal event sequence, resulting state must be identical.
- Selection updates are ordered and stable (IDs sorted before write).
- No hidden per-frame mutation of mode/tool state outside event handlers.

## Event Payload Contracts

```ts
type ModeRequestedPayload = {
  toMode: "Rig" | "Sim" | "RecordPlayback";
  source: "ui" | "shortcut" | "api";
};

type ToolRequestedPayload = {
  hand: "primary" | "secondary";
  tool: ToolId;
  source: "ui" | "shortcut" | "api";
};

type ModeRejectedPayload = {
  requestedMode: "Rig" | "Sim" | "RecordPlayback";
  reason: "SkinningBusy" | "InvalidRigState" | "InvalidPlaybackState" | "Unknown";
};

type PlaybackRequestedPayload = {
  action: "record" | "play" | "stop" | "scrub";
  clipId: string | null;
  timeSec?: number; // required for scrub
  source: "ui" | "shortcut" | "api";
};

type PlaybackChangedPayload = {
  playbackState: "Stopped" | "Playing" | "Scrubbing";
  activeClipId: string | null;
  timeSec: number;
};
```

## Record/Play/Stop/Scrub Transition Table

All playback transitions are serialized through the same event dispatcher used by mode/tool changes.

| Current mode/state | Event | Preconditions | Result |
|---|---|---|---|
| `RecordPlayback` + `Stopped` | `PlaybackRequested(action=record)` | valid scene + rig root | begin capture session, remain `Stopped` until explicit stop/commit |
| `RecordPlayback` + `Stopped` | `PlaybackRequested(action=play)` | `activeClipId != null` | `playbackState = Playing`, clock seeks to `0` |
| `RecordPlayback` + `Playing` | `PlaybackRequested(action=stop)` | none | `playbackState = Stopped`, clock time `0` |
| `RecordPlayback` + `Stopped` | `PlaybackRequested(action=scrub,timeSec=t)` | `activeClipId != null`, finite `t` | `playbackState = Scrubbing`, sampled pose at `t` |
| `RecordPlayback` + `Scrubbing` | `PlaybackRequested(action=scrub,timeSec=t)` | same as above | remain `Scrubbing`, sampled pose updated at `t` |
| `RecordPlayback` + `Scrubbing` | `PlaybackRequested(action=play)` | `activeClipId != null` | `playbackState = Playing`, play from scrubbed `t` |
| `RecordPlayback` + `Playing` | `PlaybackRequested(action=scrub,timeSec=t)` | finite `t` | `playbackState = Scrubbing`, play halted, pose sampled at `t` |
| any non-`RecordPlayback` mode | any playback request | n/a | reject via `ModeRejected(reason=InvalidPlaybackState)` |

## Playback Determinism Notes

- Playback clock is fixed-step and monotonic for a given `fps`.
- Scrub sampling must be pure with respect to `(clip data, timeSec)` input.
- `stop` always returns playback time to `0` and applies the `t=0` pose for active clip when present.
- Equal starting state + equal playback event sequence must produce equal `PlaybackChanged` sequence.

## Example Transition Trace

1. `ModeRequested(Rig -> Sim)`  
2. `PhysicsRequested(enable=true)`  
3. `PhysicsChanged(enabled=true)`  
4. `ToolChanged(primary=grab, secondary=grab)`  
5. `ModeEntered(Sim)`
