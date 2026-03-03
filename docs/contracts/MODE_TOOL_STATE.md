# Mode + Tool State Contract v1

Status: finalized for Sprint 07 workflow scaffolding (`A-011`).

## State Layers

Sprint 07 separates user workflow intent from low-level runtime pose state:

- Workflow mode (authoring intent): `Rigging`, `Animation`, `Puppeteering`
- Runtime mode (simulation lane): `Rig`, `Pose`

## Workflow Modes

- `Rigging`
- `Animation`
- `Puppeteering`

## Runtime Modes

- `Rig`
- `Pose`

## Tool IDs

- `none`
- `drawActuator`
- `grab`
- `adjust`
- `select`
- `tumble`

## Core State Shape

```ts
type WorkflowMode = "Rigging" | "Animation" | "Puppeteering";
type RuntimeMode = "Rig" | "Pose";

type WorkflowState = {
  workflowMode: WorkflowMode;
  runtimeMode: RuntimeMode;
  physicsEnabled: boolean;
  skinningBusy: boolean;
  activeTool: "select" | "translate" | "rotate" | "scale" | "draw" | "grab";
  pendingTransition: WorkflowMode | null;
};
```

## Ownership Boundaries

- `Rigging`:
  - owns rig topology edits (`create/delete/reparent actuator`, `create rig`)
  - owns authoring transforms and draw authoring
  - must run with `runtimeMode=Rig` and `physicsEnabled=false`
- `Animation`:
  - owns timeline, bake-cache, and export-job authoring
  - rig topology is read-only
  - direct transform authoring is gated off except deterministic scrub/sample evaluation
  - must run with `runtimeMode=Rig` and `physicsEnabled=false`
- `Puppeteering`:
  - owns live physics-driven manipulation lane
  - rig topology is read-only
  - canonical authoring state must be restored on exit unless explicitly committed by future contract work
  - runs with `runtimeMode=Pose` and `physicsEnabled=true`

## Workflow Transition Rules

### `Rigging -> Animation`
- Actions:
  - remain in `runtimeMode=Rig`
  - keep `physicsEnabled=false`
  - force non-destructive tool fallback (`select`) when current tool is disallowed

### `Animation -> Rigging`
- Actions:
  - remain in `runtimeMode=Rig`
  - keep `physicsEnabled=false`
  - preserve selection deterministically

### `Rigging/Animation -> Puppeteering`
- Preconditions:
  - `skinningBusy=false`
- Actions:
  - enter `runtimeMode=Pose`
  - enable physics
  - force tool lane to `grab`

### `Puppeteering -> Rigging/Animation`
- Actions:
  - disable physics
  - restore deterministic authoring snapshot
  - enter `runtimeMode=Rig`
  - apply target workflow mode with its default tool gate

### Rejections
- Any transition that violates preconditions emits `WorkflowModeRejected` with explicit reason and leaves state unchanged.

## Tool Gating Matrix

Allowed authoring tools by workflow:

- `Rigging`: `select`, `translate`, `rotate`, `scale`, `draw`, `grab`
- `Animation`: `select`, `grab`
- `Puppeteering`: `grab`

If a disallowed tool is requested:
- reject and keep previous tool unchanged
- surface explicit status/reason in UI lane

## Determinism Rules

- Workflow transitions are reducer-driven and serialized.
- Equal starting state + equal workflow event sequence must yield equal resulting state.
- Transition side effects are explicit:
  - runtime mode target
  - physics target
  - tool fallback
- No hidden frame-loop mutation may change workflow state outside transition handlers.
