# Structure and Cleanup Plan

Re-derived from the codebase after Cursor agent setup. Dev server: `npm run dev` → http://localhost:5173/

---

## Current State Summary

| Area | Location | Size / Notes |
|------|----------|--------------|
| **App shell** | `src/App.tsx` | **~3,772 lines** — single component with 50+ `useState`, 30+ refs, 100+ local functions, ~600 lines of JSX (header + sidebar panels + canvas). |
| **Scene/3D** | `src/app/components/SceneContent.tsx` | **~1,597 lines** — physics, skinning, gizmos, XR tools, mesh; many internal helpers and sub-responsibilities. |
| **Types** | `src/app/types.ts` | ~93 lines; clean. Some types duplicated or extended in `domain/`, `runtime/`. |
| **Domain** | `src/domain/sceneDocument.ts` | Scene document validation/serialization. |
| **Runtime** | `src/runtime/*` | workflow, scenePersistence, meshImport, physicsAuthoring, physicsPresets, simulationTransitions, assetPaths — well-scoped. |
| **Interaction** | `src/interaction/*` | input router, providers, drawTool, xrTools, xrTriggerBridge, focusFraming — well-scoped. |
| **Animation** | `src/animation/*` | recorder, bakeCache, exportPipeline — well-scoped. |
| **Styles** | `src/styles.css` | ~672 lines; BEM-style `.app__*`; single file. |

**Main issues**

1. **App.tsx** is the entire app in one file: state, event handlers, undo/redo, draw tool, VR spawn, file IO, outliner, all panel UI. Hard to navigate, test, or change one concern without touching others.
2. **SceneContent.tsx** mixes physics world, skinning, transform controls, draw surfaces, and XR tool visuals. Large prop list and several internal “sub-components” that could be components or hooks.
3. **No shared app state layer** — everything is `useState` + `useRef` in App, passed down. Adding a new feature means more state and more props.
4. **Constants and defaults** live in App (e.g. `DEFAULT_PHYSICS_TUNING`, `ACTUATOR_PRESET_OPTIONS`, `POSE_TOOL_MODE`). Better in a config or constants module.
5. **Panel UI** (Actions, Tools, Rig/Pose, Draw, Scene IO, Outliner, Status) is inline in App; no component boundaries, so no clear place to attach tests or reuse.

---

## Improvement 1: Split App into state + layout + panels

**Goal:** Reduce `App.tsx` to a thin shell: layout, one or a few state/hook entry points, and panel components that receive callbacks and state slices.

**Steps:**

1. **Extract constants and defaults**
   - New: `src/app/constants.ts` (or `src/config/defaults.ts`)
   - Move: `DEFAULT_PHYSICS_TUNING`, `DEFAULT_DELTA_MUSH_SETTINGS`, `ACTUATOR_PRESET_OPTIONS`, `MIXED_PRESET_VALUE`, `POSE_TOOL_MODE`, `SCENE_PLAYBACK_FPS`, `DEFAULT_WORKFLOW_MODE`, and any other literals that are “config”.
   - Keep App.tsx only as the place that *uses* these (or a single `useAppDefaults()` that returns them).

2. **Introduce an app-state hook**
   - New: `src/app/useEditorState.ts` (or `src/state/useEditorState.ts`)
   - Move: all `useState` and refs that represent “editor state” (actuators, selection, undo/redo, workflow mode, app mode, gizmo, view, XR, draw state, IO status, etc.).
   - Expose one object (e.g. `state`) and one object of actions (e.g. `actions`). App and panels then use `const { state, actions } = useEditorState()` (or split into smaller hooks if preferred: `useSelection()`, `useWorkflow()`, `useDrawTool()`, etc.).
   - Keep refs that are truly local (e.g. canvas ref, raycaster) in App or in the hook, and expose only what panels need.

3. **Extract panel components**
   - New: `src/app/components/panels/` (or `src/app/panels/`)
     - `AppHeader.tsx` — workflow buttons, Enter/Exit VR, status line.
     - `ActionsPanel.tsx` — Create Rig, Create Actuator, Delete, Undo/Redo, Save/Load, Import Mesh, IO status.
     - `ToolsPanel.tsx` — Gizmo mode, space, pivot, preset, shape, new-actuator options.
     - `RigPosePanel.tsx` — Rig/Pose toggle, physics/skinning toggles, playback (Record Synthetic, Play, Stop), timeline.
     - `DrawPanel.tsx` — Draw radius, mirror, snap, cursor state, interaction state.
     - `SceneIOPanel.tsx` — Bake range, Capture Bake, Export format, Export Bake, status.
     - `OutlinerPanel.tsx` — Rig list, mesh list, actuator tree, collapse, drag-and-drop reparent.
     - `StatusPanel.tsx` — Scene/workflow/rig/selected/skin/bake summary.
   - Each panel receives only the state and callbacks it needs (no giant prop list). Data flow: `useEditorState()` in App, pass slices to panels.

4. **Keep App.tsx as layout only**
   - Structure: `<main> <Header /> <section> <aside> <ActionsPanel /> <ToolsPanel /> … <OutlinerPanel /> <StatusPanel /> </aside> <CanvasWrap> … <SceneContent /> … </CanvasWrap> </section> </main>`.
   - App owns: `useEditorState()` (or multiple hooks), `useInputRouter`, and any top-level effects (e.g. XR session subscribe). No panel markup inside App.

**Outcome:** App.tsx shrinks to a few hundred lines (layout + wiring). Panels are 50–200 lines each and can be read/tested in isolation.

---

## Improvement 2: Break up SceneContent

**Goal:** Make SceneContent a composition of smaller components and optional hooks instead of one 1,600-line component.

**Steps:**

1. **Extract physics/simulation into a hook or wrapper**
   - The Rapier world, `useBeforePhysicsStep` / `useAfterPhysicsStep`, and pose-pull logic can live in a `usePhysicsScene` or `PhysicsScene` component that owns the world and exposes body/collider refs and step callbacks.
   - SceneContent then composes: `<PhysicsScene> … actuator rigid bodies + joints … </PhysicsScene>` and receives refs/callbacks from it.

2. **Extract actuator visuals and gizmos**
   - One component (e.g. `ActuatorRigidBodies` or keep per-actuator logic but in a dedicated file) that maps actuators to Rapier rigid bodies + colliders and optional transform controls.
   - Another small component or hook for “draw surfaces” (planes for draw tool hit-test).

3. **Extract skinning/mesh block**
   - `ActiveSkinnedMesh` is already a component. Ensure all skinning-related state (revision, stats, status) is passed from parent; the “skinning bridge” (recompute on revision, report stats) can be a small hook `useSkinningBridge(...)` used by SceneContent or by a wrapper.

4. **Keep SceneContent as orchestrator**
   - SceneContent becomes: compose PhysicsScene, actuator list, draw surfaces, ActiveSkinnedMesh, XRToolVisuals, and any global scene helpers. Props stay a single “scene state” object + callbacks if that simplifies the interface.

**Outcome:** SceneContent.tsx under ~400 lines; physics, actuators, draw, and skinning each live in focused files.

---

## Improvement 3: Centralize app state (optional but recommended)

**Goal:** Avoid prop drilling and make it easier to add features (e.g. new panel, new tool) without touching App’s state list.

**Options:**

- **React Context:** One `EditorProvider` that holds state + actions from `useEditorState`, and panels/components use `useEditorContext()`. No new dependencies.
- **Zustand (or similar):** Single store (e.g. `useEditorStore`) with slices (selection, workflow, undo, draw, IO, …). Good for devtools and for non-React code (e.g. input router) that needs to read/write editor state.

**Suggestion:** Start with Context + `useEditorState` in a provider. If you later hit “too many re-renders” or need to share state with non-React code, replace the Context value with a Zustand store and keep the same hook interface.

---

## Improvement 4: Types and contracts

**Goal:** Single place for domain types; contracts stay the source of truth for schema and behavior.

**Steps:**

1. **Audit types**
   - `app/types.ts`: keep as the main UI/editor types (EditorState, ActuatorEntity, GizmoMode, etc.).
   - `domain/sceneDocument.ts` and `runtime/scenePersistence.ts`: ensure they import from a shared place (e.g. `domain/` or `app/types`) for shared shapes (Vec3, Quat, ActuatorEntity-like) or re-export from `app/types` to avoid duplication.
2. **Contract alignment**
   - When changing behavior or schema, update `docs/contracts/*` first; keep types in code in sync with contract types (e.g. SceneDocument, workflow modes).

---

## Improvement 5: Styles and class names

**Goal:** Keep styles maintainable as panels and components are split.

**Options:**

- Keep a single `styles.css` with BEM (`.app__panel-section`, etc.) and give each panel a single root class (e.g. `.app__actions-panel`) so the file can be split later into `app.css`, `panels/actions.css`, etc.
- Or move to CSS modules per component (e.g. `ActionsPanel.module.css`) so each panel owns its styles. Prefer one approach consistently.

**Suggestion:** For the first refactor, keep one file; add a short comment at the top of each logical section (e.g. `/* Actions panel */`). After panels are in separate files, consider splitting CSS by panel.

---

## Improvement 6: File and folder structure (target)

```
src/
  main.tsx
  App.tsx                    # Layout + provider + input router; thin
  styles.css                 # Global + app; later split by area if needed

  app/
    constants.ts             # Defaults, preset options, tuning defaults
    types.ts                 # Editor/UI types (unchanged role)
    actuatorModel.ts
    smoothDamp.ts
    useEditorState.ts        # (or state/useEditorState.ts) single or few hooks
    components/
      DesktopInertialCameraControls.tsx
      PlaybackDriver.tsx
      ViewCube.tsx
      SceneContent.tsx       # Orchestrator only; ~300–400 lines
      ActiveSkinnedMesh.tsx
      XRToolVisuals.tsx
      panels/
        AppHeader.tsx
        ActionsPanel.tsx
        ToolsPanel.tsx
        RigPosePanel.tsx
        DrawPanel.tsx
        SceneIOPanel.tsx
        OutlinerPanel.tsx
        StatusPanel.tsx
    # Optional: state/ or context/
    #   EditorContext.tsx
    #   useEditorContext.ts

  runtime/                   # (unchanged)
  interaction/               # (unchanged)
  animation/                  # (unchanged)
  domain/                    # (unchanged)
  skinning/                  # (unchanged)
  tests/                     # (unchanged)
```

Optional extra splits under `app/components/`:

- `scene/` or `three/`: PhysicsScene, ActuatorBodies, DrawSurfaces, etc., if you extract them from SceneContent.

---

## Phased Approach

| Phase | Scope | Risk |
|------|--------|------|
| **1** | Extract constants + defaults to `app/constants.ts`. Move nothing else. | Low |
| **2** | Extract panels (Header, Actions, Tools, RigPose, Draw, SceneIO, Outliner, Status) into components; App passes state and callbacks. Keep all state in App. | Medium (many props initially) |
| **3** | Introduce `useEditorState` (and optionally Context); move state and refs into the hook; App and panels consume it. | Medium |
| **4** | Split SceneContent: physics wrapper, actuator list, draw surfaces, skinning hook. | Medium–high |
| **5** | Optional: Zustand or Context for global editor store; types audit; CSS split. | Low–medium |

Recommended order: **1 → 2 → 3**. Then 4 once the app shell is stable. Phase 5 as needed.

---

## Quick Wins (no structural change)

- **Add section comments in App.tsx:** e.g. `// --- State ---`, `// --- Refs ---`, `// --- Derived / memos ---`, `// --- Handlers: selection ---`, `// --- Handlers: draw ---`, `// --- Handlers: IO ---`, `// --- Effects ---`, `// --- Render ---`. Improves navigation without moving code.
- **Extract pure helpers from App:** e.g. `workflowToolFromGizmoMode`, `gizmoModeFromWorkflowTool`, `extractNumericSuffix`, `extractActuatorIndex`, `downloadTextFile` → move to `app/utils.ts` or `app/helpers.ts`. Reduces App size and makes them testable.
- **Replace magic numbers** in App and SceneContent with named constants (from `constants.ts` or next to the code).

---

## Success Criteria

- App.tsx under ~500 lines (layout + wiring + minimal glue).
- No single file over ~500 lines except by explicit choice (e.g. a large but cohesive module).
- New features (e.g. a new panel or tool) add new files or extend one clear module, not a 3k-line file.
- Contracts and types stay aligned; tests continue to pass; build and manual checks unchanged in behavior.
