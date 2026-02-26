# Mode + Tool State Contract v0

Status: finalized for Sprint 00 baseline (`A-002`).

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
```

## Example Transition Trace

1. `ModeRequested(Rig -> Sim)`  
2. `PhysicsRequested(enable=true)`  
3. `PhysicsChanged(enabled=true)`  
4. `ToolChanged(primary=grab, secondary=grab)`  
5. `ModeEntered(Sim)`
