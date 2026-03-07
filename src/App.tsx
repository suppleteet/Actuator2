import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import { OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Box3, Matrix4, Object3D, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import { PlaybackClock, evaluateClipAtTime, type SyntheticClip } from "./animation/recorder";
import { buildFocusRequestFromActuators, type FocusRequest } from "./interaction/focusFraming";
import { useInputRouter } from "./interaction/input/router";
import type { InputAction } from "./interaction/input/types";
import {
  createInitialXrHandInputState,
  resolveXrToolState,
  type XRHandedness,
  updateXrHandInputStateFromAction,
} from "./interaction/xrTools";
import { resolveXrTriggerIntent } from "./interaction/xrTriggerBridge";
import {
  adjustDrawRadiusFromWheel,
  buildDrawCapsuleActuator,
  mirrorPlacementAcrossX,
  shouldSpawnMirrored,
  snapPointToMirrorCenterline,
  updateCapsuleFromEndpoints,
} from "./interaction/drawTool";
import {
  getActuatorPrimitiveCenter,
  getActuatorRadius,
  getCapsuleHalfAxis,
  normalizePositiveScale,
  normalizePrimitiveSize,
  scalePrimitiveSizeFromGizmoDelta,
} from "./runtime/physicsAuthoring";
import {
  defaultPresetForActuatorType,
} from "./runtime/physicsPresets";
import { resolvePublicAssetUrl } from "./runtime/assetPaths";
import {
  integrateImportedMesh,
  loadMeshGeometryForInspection,
  normalizeMeshImport,
  suggestImportDefaults,
} from "./runtime/meshImport";
import { PLACEHOLDER_WHITE_TEX_URL } from "./app/components/ActiveSkinnedMesh";
import { createRootActuator, composeMatrix } from "./app/actuatorModel";
import { smoothDampQuat, smoothDampVec3, type SmoothDampQuatVelocity, type SmoothDampVec3Velocity } from "./app/smoothDamp";
import {
  type ActiveMeshSource,
  type ActuatorEntity,
  type ActuatorPhysicsOverrides,
  type ActuatorShape,
  type ActuatorPreset,
  type ActuatorTransformSnapshot,
  type AppMode,
  type DeltaMushSettings,
  type EditorState,
  type GizmoMode,
  type PhysicsTuning,
  type PivotMode,
  type Quat,
  type SkinningComputationStatus,
  type SkinningStats,
  type Vec3,
} from "./app/types";
import {
  SceneLoadError,
  createSceneEnvelope,
  parseSceneEnvelope,
  sceneSnapshotFromEnvelope,
  stableSerializeSceneEnvelope,
  type ImportedMeshDocument,
  type SceneSnapshot,
} from "./runtime/scenePersistence";
import {
  clampToolToWorkflow,
  isToolAllowedForWorkflow,
  transitionWorkflowState,
  type WorkflowMode,
} from "./runtime/workflow";
import { captureBakeCache, type BakeCache } from "./animation/bakeCache";
import { createDefaultBakeExportRegistry, type ExportFormatId } from "./animation/exportPipeline";
import {
  DEFAULT_DELTA_MUSH_SETTINGS,
  DEFAULT_PHYSICS_TUNING,
  DEFAULT_WORKFLOW_MODE,
  MIXED_PRESET_VALUE,
  POSE_TOOL_MODE,
  SCENE_AUTOSAVE_STORAGE_KEY,
  SCENE_PLAYBACK_FPS,
} from "./app/constants";
import {
  downloadTextFile,
  extractActuatorIndex,
  extractNumericSuffix,
  gizmoModeFromWorkflowTool,
  workflowToolFromGizmoMode,
} from "./app/utils";
import { DesktopInertialCameraControls } from "./app/components/DesktopInertialCameraControls";
import { PlaybackDriver } from "./app/components/PlaybackDriver";
import { SceneContent } from "./app/components/SceneContent";
import { ViewCube } from "./app/components/ViewCube";
import { AppHeader } from "./app/components/panels/AppHeader";
import { EditorProvider } from "./app/EditorContext";
import { DockLayout } from "./app/components/DockLayout";

const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: false,
  emulate: false,
});

export default function App() {
  const textureUris = useMemo(
    () => ({
      colorMapUri: resolvePublicAssetUrl("assets/chad/Textures/chad_Col.png"),
      normalMapUri: resolvePublicAssetUrl("assets/chad/Textures/chad_Norm.png"),
      roughnessMapUri: resolvePublicAssetUrl("assets/chad/Textures/chad_Pbr.png"),
    }),
    [],
  );
  const [importedMeshes, setImportedMeshes] = useState<ImportedMeshDocument[]>(() => [
    {
      id: "mesh_steve",
      format: "fbx",
      displayName: "Steve.fbx",
      sourceUri: resolvePublicAssetUrl("Steve.fbx"),
      importedAtUtc: new Date().toISOString(),
      upAxis: "Y",
      importScale: 1,
      positionOffset: { x: 0, y: 0, z: 0 },
      rotationOffset: { x: 0, y: 0, z: 0 },
    },
  ]);
  const sceneMeshSources = useMemo<ActiveMeshSource[]>(
    () =>
      importedMeshes
        .filter((mesh): mesh is ImportedMeshDocument & { format: "fbx" | "glb" } => mesh.format === "fbx" || mesh.format === "glb")
        .map((mesh) => ({
          id: mesh.id,
          format: mesh.format,
          meshUri: mesh.sourceUri,
          colorMapUri:
            mesh.format === "fbx"
              ? (mesh.colorMapUri ?? textureUris.colorMapUri)
              : (mesh.colorMapUri ?? PLACEHOLDER_WHITE_TEX_URL),
          normalMapUri:
            mesh.format === "fbx"
              ? (mesh.normalMapUri ?? textureUris.normalMapUri)
              : (mesh.normalMapUri ?? PLACEHOLDER_WHITE_TEX_URL),
          roughnessMapUri:
            mesh.format === "fbx"
              ? (mesh.roughnessMapUri ?? textureUris.roughnessMapUri)
              : (mesh.roughnessMapUri ?? PLACEHOLDER_WHITE_TEX_URL),
          importScale: Number.isFinite(mesh.importScale) ? mesh.importScale! : 1,
          positionOffset:
            mesh.positionOffset &&
            Number.isFinite(mesh.positionOffset.x) &&
            Number.isFinite(mesh.positionOffset.y) &&
            Number.isFinite(mesh.positionOffset.z)
              ? mesh.positionOffset
              : { x: 0, y: 0, z: 0 },
          rotationOffset:
            mesh.rotationOffset &&
            Number.isFinite(mesh.rotationOffset.x) &&
            Number.isFinite(mesh.rotationOffset.y) &&
            Number.isFinite(mesh.rotationOffset.z)
              ? mesh.rotationOffset
              : { x: 0, y: 0, z: 0 },
          upAxis: mesh.upAxis === "Z" ? "Z" : "Y",
          flipNormals: mesh.flipNormals === true,
        })),
    [importedMeshes, textureUris.colorMapUri, textureUris.normalMapUri, textureUris.roughnessMapUri],
  );
  const [sceneId, setSceneId] = useState("scene_main");
  const [sceneCreatedAtUtc, setSceneCreatedAtUtc] = useState(() => new Date().toISOString());
  const nextActuatorIndexRef = useRef(1);
  const nextRigIndexRef = useRef(2);
  const sceneLoadInputRef = useRef<HTMLInputElement | null>(null);
  const meshImportInputRef = useRef<HTMLInputElement | null>(null);
  const exportRegistryRef = useRef(createDefaultBakeExportRegistry());
  const actuatorObjectRefs = useRef<Record<string, Object3D | null>>({});
  const drawSurfaceObjectRefs = useRef<Record<string, Object3D | null>>({});
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<any>(null);
  const pendingVrSpawnRef = useRef(false);
  const vrSpawnFrameRef = useRef<number | null>(null);
  const vrOriginRestoreRef = useRef<{ origin: Object3D; position: Vector3; quaternion: Quaternion } | null>(null);
  const projectionSwitchPoseRef = useRef<{
    position: Vec3;
    quaternion: { x: number; y: number; z: number; w: number };
    up: Vec3;
    orthoZoom: number | null;
  } | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerNdcRef = useRef(new Vector2());
  const marqueeDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    additive: boolean;
    toggle: boolean;
  } | null>(null);
  type UndoSnapshot = { editorState: EditorState; importedMeshes: ImportedMeshDocument[] };
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  const redoStackRef = useRef<UndoSnapshot[]>([]);
  const initialRigId = "rig_001";
  const initialRoot = createRootActuator(initialRigId);
  const [editorState, setEditorState] = useState<EditorState>({
    actuators: [initialRoot],
    selectedRigId: initialRigId,
    selectedActuatorId: initialRoot.id,
    selectedActuatorIds: [initialRoot.id],
  });
  const [isTransformDragging, setIsTransformDragging] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">("local");
  const [pivotMode, setPivotMode] = useState<PivotMode>("object");
  const [appMode, setAppMode] = useState<AppMode>("Rig");
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>(DEFAULT_WORKFLOW_MODE);
  const [viewProjection, setViewProjection] = useState<"perspective" | "orthographic">("perspective");
  const [viewDirectionRequest, setViewDirectionRequest] = useState<{ direction: Vec3; up: Vec3 } | null>(null);
  const [viewDirectionNonce, setViewDirectionNonce] = useState(0);
  const [xrMode, setXrMode] = useState<XRSessionMode | null>(() => {
    const storeAny = xrStore as any;
    const initialState = storeAny.getState?.();
    return (initialState?.mode as XRSessionMode | null | undefined) ?? null;
  });
  const [vrSupported, setVrSupported] = useState<boolean>(false);
  const [xrBusy, setXrBusy] = useState(false);
  const [newActuatorShape, setNewActuatorShape] = useState<ActuatorShape>("capsule");
  const [newActuatorPreset, setNewActuatorPreset] = useState<ActuatorPreset>("SpinePelvis");
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedMeshSourceId, setSelectedMeshSourceId] = useState<string | null>(null);
  const [pendingImportFiles, setPendingImportFiles] = useState<File[] | null>(null);
  const [outlinerParentDragSourceId, setOutlinerParentDragSourceId] = useState<string | null>(null);
  const [outlinerParentDropTargetId, setOutlinerParentDropTargetId] = useState<string | null>(null);
  const [deltaMushEnabled, setDeltaMushEnabled] = useState(true);
  const [deltaMushSettings, setDeltaMushSettings] = useState<DeltaMushSettings>(DEFAULT_DELTA_MUSH_SETTINGS);
  const [physicsTuning] = useState<PhysicsTuning>(DEFAULT_PHYSICS_TUNING);
  const [skinningStats, setSkinningStats] = useState<SkinningStats>({
    vertexCount: 0,
    capsuleCount: 0,
    averageWeight: 0,
  });
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [syntheticClip] = useState<SyntheticClip | null>(null);
  const [isPosePullDragging, setIsPosePullDragging] = useState(false);
  const [drawRadius, setDrawRadius] = useState(0.2);
  const [drawMirrorEnabled, setDrawMirrorEnabled] = useState(true);
  const [drawSnapEnabled, setDrawSnapEnabled] = useState(true);
  const [ioStatus, setIoStatus] = useState("Ready");
  const [meshImportStatus, setMeshImportStatus] = useState("No mesh imports yet.");
  const [exportStatus, setExportStatus] = useState("No bake cache captured.");
  const [bakeStartFrame, setBakeStartFrame] = useState(0);
  const [bakeEndFrame, setBakeEndFrame] = useState(60);
  const [lastBakeCache, setLastBakeCache] = useState<BakeCache | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormatId>("bvh");
  const [drawCursor, setDrawCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [drawInteractionState, setDrawInteractionState] = useState<"Idle" | "OnPress" | "OnDrag" | "OnRelease">("Idle");
  const [drawCursorRadiusPx, setDrawCursorRadiusPx] = useState(18);
  const [drawCursorHasInRangeAnchor, setDrawCursorHasInRangeAnchor] = useState(false);
  const [drawHoverActuatorId, setDrawHoverActuatorId] = useState<string | null>(null);
  const [xrHandInputs, setXrHandInputs] = useState(() => createInitialXrHandInputState());
  const xrHandInputsRef = useRef(xrHandInputs);

  const [drawDraftActuators, setDrawDraftActuators] = useState<ActuatorEntity[]>([]);
  const [worldGravityY, setWorldGravityY] = useState(-9.81);
  /** True once we've pushed an undo entry for the current properties tweak batch. */
  const propertiesBatchHasPushedRef = useRef(false);
  const propertiesBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PROPERTIES_UNDO_BATCH_MS = 400;

  useEffect(() => {
    return () => {
      if (propertiesBatchTimerRef.current !== null) {
        clearTimeout(propertiesBatchTimerRef.current);
        propertiesBatchTimerRef.current = null;
      }
    };
  }, []);

  const drawPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const drawPointerButtonsRef = useRef(0);
  const drawCursorAnchorPointRef = useRef<Vec3 | null>(null);
  const drawSessionRef = useRef<{
    pointerId: number;
    startPoint: Vec3;
    endPoint: Vec3;
    worldRadius: number;
    screenStartX: number;
    screenStartY: number;
    startNdcZ: number;
    parentId: string;
    mirrorParentId: string | null;
    rigId: string;
    mirrorSpawn: boolean;
    preset: ActuatorPreset;
  } | null>(null);
  const previousRigToolModeRef = useRef<GizmoMode>("translate");
  const playbackClockRef = useRef<PlaybackClock | null>(null);
  const transformStartSnapshotRef = useRef<EditorState | null>(null);
  const editorStateRef = useRef<EditorState>(editorState);
  const sceneIdRef = useRef(sceneId);
  const sceneCreatedAtUtcRef = useRef(sceneCreatedAtUtc);
  const workflowModeRef = useRef(workflowMode);
  const importedMeshesRef = useRef(importedMeshes);
  const bakeStartFrameRef = useRef(bakeStartFrame);
  const bakeEndFrameRef = useRef(bakeEndFrame);
  const [skinningRevision, setSkinningRevision] = useState(1);
  const [skinningBusy, setSkinningBusy] = useState(false);
  const [completedSkinningRevision, setCompletedSkinningRevision] = useState(0);
  const [skinningEnabled, setSkinningEnabled] = useState(false);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const [pendingPoseRevision, setPendingPoseRevision] = useState<number | null>(null);
  const [poseTargetActuators, setPoseTargetActuators] = useState<ActuatorEntity[] | null>(null);
  const poseEntrySnapshotRef = useRef<EditorState | null>(null);
  const bindPoseTransformsRef = useRef<Record<string, ActuatorTransformSnapshot> | null>(null);
  const simulationStartSnapshotRef = useRef<EditorState | null>(null);
  const bindBlendStateRef = useRef<{
    target: Record<string, ActuatorTransformSnapshot>;
    lastTimestampMs: number | null;
    velocityById: Record<
      string,
      {
        position: SmoothDampVec3Velocity;
        scale: SmoothDampVec3Velocity;
        rotation: SmoothDampQuatVelocity;
      }
    >;
  } | null>(null);
  const [bindBlendNonce, setBindBlendNonce] = useState(0);
  const suppressClearSelectionUntilRef = useRef(0);

  const actuators = editorState.actuators;
  const workflowTool = clampToolToWorkflow(workflowMode, workflowToolFromGizmoMode(gizmoMode, appMode));
  const workflowAllowsRigAuthoring = workflowMode === "Rigging";
  const workflowAllowsAnimationLane = workflowMode === "Animation";
  const workflowAllowsDraw = workflowMode === "Rigging";
  const showDrawDraftActuators = gizmoMode === "draw" && appMode === "Rig" && workflowAllowsDraw && !physicsEnabled;
  const sceneActuators = useMemo(
    () =>
      showDrawDraftActuators && drawDraftActuators.length > 0
        ? [...actuators, ...drawDraftActuators]
        : actuators,
    [actuators, drawDraftActuators, showDrawDraftActuators],
  );
  const selectedRigId = editorState.selectedRigId;
  const selectedActuatorId = editorState.selectedActuatorId;
  const selectedActuatorIds = editorState.selectedActuatorIds;
  const rigIds = useMemo(() => [...new Set(actuators.map((actuator) => actuator.rigId))].sort(), [actuators]);
  const exportCapabilities = useMemo(() => exportRegistryRef.current.getCapabilities(), []);
  const xrToolState = useMemo(
    () =>
      resolveXrToolState({
        appMode,
        physicsEnabled,
        handInputs: xrHandInputs,
      }),
    [appMode, physicsEnabled, xrHandInputs],
  );

  type OutlinerEntry =
    | { kind: "rig"; rigId: string; collapsed: boolean }
    | { kind: "mesh"; rigId: string; meshSource: ActiveMeshSource; depth: number }
    | { kind: "node"; actuator: ActuatorEntity; depth: number; hasChildren: boolean };

  const outlinerEntries = useMemo<OutlinerEntry[]>(() => {
    const childrenByParent = new Map<string | null, ActuatorEntity[]>();
    for (const a of actuators) {
      let group = childrenByParent.get(a.parentId);
      if (!group) { group = []; childrenByParent.set(a.parentId, group); }
      group.push(a);
    }
    for (const group of childrenByParent.values()) {
      group.sort((a, b) => a.id.localeCompare(b.id));
    }
    const result: OutlinerEntry[] = [];
    const walk = (parentId: string | null, rigId: string, depth: number) => {
      const all = childrenByParent.get(parentId) ?? [];
      const children = parentId === null ? all.filter((a) => a.rigId === rigId) : all;
      for (const child of children) {
        const grandCount = (childrenByParent.get(child.id) ?? []).length;
        result.push({ kind: "node", actuator: child, depth, hasChildren: grandCount > 0 });
        if (!collapsedNodeIds.has(child.id)) walk(child.id, rigId, depth + 1);
      }
    };
    for (const rigId of rigIds) {
      const rigCollapsed = collapsedNodeIds.has(`rig:${rigId}`);
      result.push({ kind: "rig", rigId, collapsed: rigCollapsed });
      if (!rigCollapsed) {
        for (const meshSource of sceneMeshSources) {
          result.push({ kind: "mesh", rigId, meshSource, depth: 0 });
        }
        walk(null, rigId, 0);
      }
    }
    return result;
  }, [actuators, collapsedNodeIds, rigIds, sceneMeshSources]);

  function toggleOutlinerNode(key: string) {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function beginOutlinerParentDrag(event: ReactPointerEvent<HTMLLIElement>, sourceId: string) {
    if (event.button !== 1) return;
    if (!workflowAllowsRigAuthoring || physicsEnabled || appMode !== "Rig") return;
    event.preventDefault();
    event.stopPropagation();
    setOutlinerParentDragSourceId(sourceId);
    setOutlinerParentDropTargetId(null);
  }

  function updateOutlinerParentDropTarget(targetId: string) {
    if (outlinerParentDragSourceId === null || targetId === outlinerParentDragSourceId) {
      setOutlinerParentDropTargetId(null);
      return;
    }
    const canDrop = canReparentSourcesToTarget([outlinerParentDragSourceId], targetId);
    setOutlinerParentDropTargetId(canDrop ? targetId : null);
  }

  function completeOutlinerParentDrag(event: ReactPointerEvent<HTMLLIElement>, targetId: string) {
    if (event.button !== 1) return;
    if (outlinerParentDragSourceId === null) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceId = outlinerParentDragSourceId;
    setOutlinerParentDragSourceId(null);
    setOutlinerParentDropTargetId(null);
    if (sourceId === targetId) return;
    if (!canReparentSourcesToTarget([sourceId], targetId)) return;
    reparentSourceActuatorsToTarget([sourceId], targetId);
  }
  const onSkinningStats = useCallback((stats: SkinningStats) => {
    setSkinningStats(stats);
  }, []);
  const onSkinningComputationStatus = useCallback((status: SkinningComputationStatus) => {
    setSkinningBusy(status.busy);
    if (!status.completed) return;
    setCompletedSkinningRevision((previous) => Math.max(previous, status.revision));
  }, []);
  const onActiveCameraChange = useCallback((cameraObject: any) => {
    cameraRef.current = cameraObject;
    const pendingPose = projectionSwitchPoseRef.current;
    if (cameraObject === null || cameraObject === undefined || pendingPose === null) return;

    cameraObject.position.set(
      pendingPose.position.x,
      pendingPose.position.y,
      pendingPose.position.z,
    );
    cameraObject.quaternion.set(
      pendingPose.quaternion.x,
      pendingPose.quaternion.y,
      pendingPose.quaternion.z,
      pendingPose.quaternion.w,
    );
    cameraObject.up.set(pendingPose.up.x, pendingPose.up.y, pendingPose.up.z);
    if ((cameraObject as any).isOrthographicCamera && pendingPose.orthoZoom !== null) {
      cameraObject.zoom = pendingPose.orthoZoom;
      cameraObject.updateProjectionMatrix?.();
    }
    cameraObject.updateMatrixWorld?.(true);
    projectionSwitchPoseRef.current = null;
  }, []);

  function toggleProjectionKeepView() {
    const currentCamera = cameraRef.current as any;
    if (currentCamera !== null && currentCamera !== undefined) {
      projectionSwitchPoseRef.current = {
        position: {
          x: currentCamera.position.x,
          y: currentCamera.position.y,
          z: currentCamera.position.z,
        },
        quaternion: {
          x: currentCamera.quaternion.x,
          y: currentCamera.quaternion.y,
          z: currentCamera.quaternion.z,
          w: currentCamera.quaternion.w,
        },
        up: {
          x: currentCamera.up.x,
          y: currentCamera.up.y,
          z: currentCamera.up.z,
        },
        orthoZoom: (currentCamera as any).isOrthographicCamera ? currentCamera.zoom ?? null : null,
      };
    }
    setViewProjection((value) => (value === "perspective" ? "orthographic" : "perspective"));
  }

  const requestViewDirection = useCallback((direction: Vec3, up: Vec3) => {
    setViewDirectionRequest({ direction, up });
    setViewDirectionNonce((value) => value + 1);
  }, []);

  const computeVrSpawnPose = useCallback((): { eye: Vec3; look: Vec3 } | null => {
    const bounds = new Box3();
    let hasBounds = false;

    for (const object of Object.values(drawSurfaceObjectRefs.current)) {
      if (object === null || object === undefined) continue;
      object.updateWorldMatrix?.(true, true);
      const meshBounds = new Box3().setFromObject(object);
      if (meshBounds.isEmpty()) continue;
      if (!hasBounds) {
        bounds.copy(meshBounds);
        hasBounds = true;
      } else {
        bounds.union(meshBounds);
      }
    }

    if (!hasBounds) {
      const rigActuators = actuators.filter((actuator) => actuator.rigId === selectedRigId);
      for (const actuator of rigActuators) {
        const center = getActuatorPrimitiveCenter(actuator);
        const halfX = Math.max(actuator.size.x * 0.5, 0.02);
        const halfY = Math.max(actuator.size.y * 0.5, 0.02);
        const halfZ = Math.max(actuator.size.z * 0.5, 0.02);
        bounds.expandByPoint(new Vector3(center.x - halfX, center.y - halfY, center.z - halfZ));
        bounds.expandByPoint(new Vector3(center.x + halfX, center.y + halfY, center.z + halfZ));
        hasBounds = true;
      }
    }

    if (!hasBounds || bounds.isEmpty()) return null;

    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const horizontalSpan = Math.max(size.x, size.z, 0.4);
    const verticalSpan = Math.max(size.y, 0.8);
    const startDistance = Math.max(horizontalSpan * 1.35, verticalSpan * 0.95, 1.2);

    const eye = {
      x: center.x,
      y: center.y + verticalSpan * 0.2,
      z: center.z + startDistance,
    };
    const look = {
      x: center.x,
      y: center.y - verticalSpan * 0.08,
      z: center.z,
    };

    return { eye, look };
  }, [actuators, selectedRigId]);

  const restoreVrOriginTransform = useCallback(() => {
    const restore = vrOriginRestoreRef.current;
    if (restore === null) return;
    restore.origin.position.copy(restore.position);
    restore.origin.quaternion.copy(restore.quaternion);
    restore.origin.updateMatrixWorld?.(true);
    vrOriginRestoreRef.current = null;
  }, []);

  const applyPendingVrSpawnPose = useCallback((): boolean => {
    const spawn = computeVrSpawnPose();
    if (spawn === null) return true;

    const storeAny = xrStore as any;
    const state = storeAny.getState?.();
    const origin = state?.origin as Object3D | undefined;
    const cameraObject = cameraRef.current as any;
    if (origin === undefined || origin === null || cameraObject === null || cameraObject === undefined) {
      return false;
    }

    if (vrOriginRestoreRef.current === null || vrOriginRestoreRef.current.origin !== origin) {
      vrOriginRestoreRef.current = {
        origin,
        position: origin.position.clone(),
        quaternion: origin.quaternion.clone(),
      };
    }

    const eyeTarget = new Vector3(spawn.eye.x, spawn.eye.y, spawn.eye.z);
    const lookTarget = new Vector3(spawn.look.x, spawn.look.y, spawn.look.z);

    const cameraWorldQuat = new Quaternion();
    if (typeof cameraObject.getWorldQuaternion === "function") {
      cameraObject.getWorldQuaternion(cameraWorldQuat);
    } else if (cameraObject.quaternion !== undefined) {
      cameraWorldQuat.copy(cameraObject.quaternion);
    }

    const currentForward = new Vector3(0, 0, -1).applyQuaternion(cameraWorldQuat);
    currentForward.y = 0;
    if (currentForward.lengthSq() < 1e-6) currentForward.set(0, 0, -1);
    currentForward.normalize();

    const desiredForward = lookTarget.clone().sub(eyeTarget);
    desiredForward.y = 0;
    if (desiredForward.lengthSq() < 1e-6) desiredForward.set(0, 0, -1);
    desiredForward.normalize();

    const currentYaw = Math.atan2(currentForward.x, currentForward.z);
    const desiredYaw = Math.atan2(desiredForward.x, desiredForward.z);
    origin.rotateY(desiredYaw - currentYaw);
    origin.updateMatrixWorld?.(true);

    const currentEye = new Vector3();
    if (typeof cameraObject.getWorldPosition === "function") {
      cameraObject.getWorldPosition(currentEye);
    } else if (cameraObject.position !== undefined) {
      currentEye.copy(cameraObject.position);
    }

    origin.position.add(eyeTarget.sub(currentEye));
    origin.updateMatrixWorld?.(true);
    return true;
  }, [computeVrSpawnPose]);

  const requestEnterVr = useCallback(async () => {
    if (xrBusy) return;
    pendingVrSpawnRef.current = true;
    if (vrSpawnFrameRef.current !== null) {
      cancelAnimationFrame(vrSpawnFrameRef.current);
      vrSpawnFrameRef.current = null;
    }
    setXrBusy(true);
    try {
      await (xrStore as any).enterVR?.();
    } catch (error) {
      pendingVrSpawnRef.current = false;
      console.error("Failed to enter VR session.", error);
    } finally {
      setXrBusy(false);
    }
  }, [xrBusy]);

  useEffect(() => {
    if (xrMode === "immersive-vr" && pendingVrSpawnRef.current) {
      let attempts = 0;
      const tick = () => {
        if (xrMode !== "immersive-vr" || !pendingVrSpawnRef.current) {
          vrSpawnFrameRef.current = null;
          return;
        }
        const applied = applyPendingVrSpawnPose();
        if (applied || attempts >= 120) {
          pendingVrSpawnRef.current = false;
          vrSpawnFrameRef.current = null;
          return;
        }
        attempts += 1;
        vrSpawnFrameRef.current = requestAnimationFrame(tick);
      };
      vrSpawnFrameRef.current = requestAnimationFrame(tick);
      return () => {
        if (vrSpawnFrameRef.current !== null) {
          cancelAnimationFrame(vrSpawnFrameRef.current);
          vrSpawnFrameRef.current = null;
        }
      };
    }

    if (xrMode === null) {
      pendingVrSpawnRef.current = false;
      if (vrSpawnFrameRef.current !== null) {
        cancelAnimationFrame(vrSpawnFrameRef.current);
        vrSpawnFrameRef.current = null;
      }
      restoreVrOriginTransform();
    }
  }, [applyPendingVrSpawnPose, restoreVrOriginTransform, xrMode]);

  const requestExitVr = useCallback(async () => {
    if (xrBusy) return;
    setXrBusy(true);
    try {
      const storeAny = xrStore as any;
      const state = storeAny.getState?.();
      await state?.session?.end?.();
    } catch (error) {
      console.error("Failed to end XR session.", error);
    } finally {
      setXrBusy(false);
    }
  }, [xrBusy]);

  useEffect(() => {
    const storeAny = xrStore as any;
    const state = storeAny.getState?.();
    setXrMode((state?.mode as XRSessionMode | null | undefined) ?? null);

    const unsubscribe = storeAny.subscribe?.((nextState: any) => {
      setXrMode((nextState?.mode as XRSessionMode | null | undefined) ?? null);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    const xrApi = (navigator as any).xr;
    if (xrApi === undefined || xrApi?.isSessionSupported === undefined) {
      setVrSupported(false);
      return;
    }

    xrApi
      .isSessionSupported("immersive-vr")
      .then((supported: boolean) => {
        if (!canceled) setVrSupported(Boolean(supported));
      })
      .catch(() => {
        if (!canceled) setVrSupported(false);
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  useEffect(() => {
    sceneIdRef.current = sceneId;
    sceneCreatedAtUtcRef.current = sceneCreatedAtUtc;
    workflowModeRef.current = workflowMode;
    importedMeshesRef.current = importedMeshes;
    bakeStartFrameRef.current = bakeStartFrame;
    bakeEndFrameRef.current = bakeEndFrame;
  }, [sceneId, sceneCreatedAtUtc, workflowMode, importedMeshes, bakeStartFrame, bakeEndFrame]);

  // Debug: restore drawn actuators from last session so we don't have to redraw on reload
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCENE_AUTOSAVE_STORAGE_KEY);
      if (raw === null || raw === "") return;
      const envelope = parseSceneEnvelope(raw);
      const snapshot = sceneSnapshotFromEnvelope(envelope);
      const nextState = cloneEditorState(snapshot.editorState);
      editorStateRef.current = nextState;
      setEditorState(nextState);
      setSceneId(snapshot.sceneId);
      setSceneCreatedAtUtc(snapshot.createdAtUtc);
      setImportedMeshes(snapshot.importedMeshes);
      setWorkflowMode(snapshot.workflowMode);
      syncCreationIndicesFromState(nextState);
      undoStackRef.current = [];
      redoStackRef.current = [];
      const nextRuntimeMode: AppMode = snapshot.workflowMode === "Puppeteering" ? "Pose" : "Rig";
      requestAppMode(nextRuntimeMode);
      const clampedTool = clampToolToWorkflow(snapshot.workflowMode, workflowToolFromGizmoMode(gizmoMode, nextRuntimeMode));
      setGizmoMode(gizmoModeFromWorkflowTool(clampedTool));
      setIoStatus("Restored previous session.");
    } catch {
      // Ignore invalid or missing autosave; use default state
    }
  }, []);

  // Debug: persist scene to localStorage so reload restores drawn actuators
  const AUTOSAVE_DEBOUNCE_MS = 800;
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const frameSpan = Math.max(
          1,
          Math.max(bakeStartFrameRef.current, bakeEndFrameRef.current) -
            Math.min(bakeStartFrameRef.current, bakeEndFrameRef.current) +
            1,
        );
        const snapshot: SceneSnapshot = {
          sceneId: sceneIdRef.current,
          createdAtUtc: sceneCreatedAtUtcRef.current,
          workflowMode: workflowModeRef.current,
          editorState: cloneEditorState(editorStateRef.current),
          importedMeshes: importedMeshesRef.current.map((m) => ({ ...m })),
          playback: {
            fps: SCENE_PLAYBACK_FPS,
            durationSec: frameSpan / SCENE_PLAYBACK_FPS,
            activeClipId: null,
          },
          metadata: { sourceBaseline: "30c6ea7" },
        };
        const envelope = createSceneEnvelope(snapshot);
        const serialized = stableSerializeSceneEnvelope(envelope);
        localStorage.setItem(SCENE_AUTOSAVE_STORAGE_KEY, serialized);
      } catch {
        // Ignore (e.g. invalid snapshot or quota)
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [
    editorState,
    sceneId,
    sceneCreatedAtUtc,
    workflowMode,
    importedMeshes,
    bakeStartFrame,
    bakeEndFrame,
  ]);

  useEffect(() => {
    xrHandInputsRef.current = xrHandInputs;
  }, [xrHandInputs]);

  useEffect(() => {
    if (xrMode !== null) return;
    const reset = createInitialXrHandInputState();
    xrHandInputsRef.current = reset;
    setXrHandInputs(reset);
  }, [xrMode]);

  useEffect(() => {
    if (appMode !== "Rig") return;
    previousRigToolModeRef.current = gizmoMode;
  }, [appMode, gizmoMode]);

  useEffect(() => {
    if (selectedActuatorIds.length === 0) return;
    const selected = selectedActuatorIds
      .map((id) => actuators.find((actuator) => actuator.id === id))
      .filter((actuator): actuator is ActuatorEntity => actuator !== undefined);
    if (selected.length === 0) return;

    const presets = new Set<ActuatorPreset>(
      selected.map((actuator) => actuator.preset ?? defaultPresetForActuatorType(actuator.type)),
    );
    if (presets.size !== 1) return;
    const selectedPreset = [...presets][0];
    if (selected.length === 1 && selected[0].type === "root" && actuators.length === 1) return;
    setNewActuatorPreset((previous) => (previous === selectedPreset ? previous : selectedPreset));
  }, [actuators, selectedActuatorIds]);

  const presetSelectValue = useMemo(() => {
    if (selectedActuatorIds.length <= 1) return newActuatorPreset;
    const selected = selectedActuatorIds
      .map((id) => actuators.find((actuator) => actuator.id === id))
      .filter((actuator): actuator is ActuatorEntity => actuator !== undefined);
    if (selected.length <= 1) return newActuatorPreset;
    const presets = new Set<ActuatorPreset>(
      selected.map((actuator) => actuator.preset ?? defaultPresetForActuatorType(actuator.type)),
    );
    return presets.size === 1 ? [...presets][0] : MIXED_PRESET_VALUE;
  }, [actuators, newActuatorPreset, selectedActuatorIds]);

  function setActuatorObjectRef(id: string, object: Object3D | null) {
    actuatorObjectRefs.current[id] = object;
  }

  function setDrawSurfaceRef(id: string, object: Object3D | null) {
    drawSurfaceObjectRefs.current[id] = object;
  }

  function getActuatorHitAtPointer(clientX: number, clientY: number): ActuatorEntity | null {
    const wrap = canvasWrapRef.current;
    const camera = cameraRef.current;
    if (wrap === null || camera === null) return null;

    const rect = wrap.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pointerNdcRef.current.set(x, y);
    raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);

    const candidates =
      appMode === "Rig" ? actuators.filter((actuator) => actuator.rigId === selectedRigId) : actuators;
    const hitTargets = candidates
      .map((actuator) => ({
        actuator,
        object: actuatorObjectRefs.current[actuator.id],
      }))
      .filter((entry): entry is { actuator: ActuatorEntity; object: Object3D } => entry.object !== null && entry.object !== undefined);

    const intersections = raycasterRef.current.intersectObjects(
      hitTargets.map((entry) => entry.object),
      false,
    );
    const first = intersections[0];
    if (first === undefined) return null;
    const match = hitTargets.find((entry) => entry.object === first.object);
    return match?.actuator ?? null;
  }

  function getXrControllerTipPose(handedness: XRHandedness): { position: Vec3; forward: Vec3 } | null {
    const storeAny = xrStore as any;
    const state = storeAny.getState?.();
    const inputStates = (state?.inputSourceStates ?? []) as Array<{
      type?: string;
      inputSource?: { handedness?: string };
      object?: Object3D;
    }>;
    const controller = inputStates.find(
      (inputState) => inputState.type === "controller" && inputState.inputSource?.handedness === handedness,
    );
    const controllerObject = controller?.object;
    if (controllerObject === undefined) return null;

    const worldPosition = new Vector3();
    const worldQuaternion = new Quaternion();
    controllerObject.getWorldPosition(worldPosition);
    controllerObject.getWorldQuaternion(worldQuaternion);

    const offset = new Vector3(0, 0, 0.025).applyQuaternion(worldQuaternion);
    const forward = new Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
    return {
      position: {
        x: worldPosition.x + offset.x,
        y: worldPosition.y + offset.y,
        z: worldPosition.z + offset.z,
      },
      forward: { x: forward.x, y: forward.y, z: forward.z },
    };
  }

  function resolveNearestActuatorAtWorldPoint(
    worldPoint: Vec3,
    options?: { rigId?: string; maxDistance?: number },
  ): ActuatorEntity | null {
    const maxDistance = options?.maxDistance ?? Number.POSITIVE_INFINITY;
    let best: ActuatorEntity | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const actuator of actuators) {
      if (options?.rigId !== undefined && actuator.rigId !== options.rigId) continue;
      const center = getActuatorPrimitiveCenter(actuator);
      const dx = worldPoint.x - center.x;
      const dy = worldPoint.y - center.y;
      const dz = worldPoint.z - center.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const threshold = Math.max(maxDistance, getActuatorRadius(actuator) * 1.35);
      if (distance > threshold) continue;
      if (distance < bestDistance - 1e-6) {
        best = actuator;
        bestDistance = distance;
        continue;
      }
      if (Math.abs(distance - bestDistance) <= 1e-6 && best !== null && actuator.id.localeCompare(best.id) < 0) {
        best = actuator;
        bestDistance = distance;
      }
    }

    return best;
  }

  function computeWorldUnitsPerPixelAtPoint(point: Vec3): number {
    const camera = cameraRef.current as any;
    const wrap = canvasWrapRef.current;
    if (camera === null || wrap === null) return 0.001;

    const pointWorld = new Vector3(point.x, point.y, point.z);
    const cameraPos = new Vector3(camera.position.x, camera.position.y, camera.position.z);
    const distance = Math.max(pointWorld.distanceTo(cameraPos), 0.01);

    if ((camera as any).isPerspectiveCamera) {
      const fovRad = ((camera.fov ?? 50) * Math.PI) / 180;
      const worldHeight = 2 * Math.tan(fovRad * 0.5) * distance;
      return worldHeight / Math.max(1, wrap.clientHeight);
    }

    if ((camera as any).isOrthographicCamera) {
      const worldHeight = (camera.top - camera.bottom) / Math.max(0.0001, camera.zoom ?? 1);
      return worldHeight / Math.max(1, wrap.clientHeight);
    }

    return 0.001;
  }

  function computePixelsForWorldRadiusAtPoint(radiusWorld: number, point: Vec3): number {
    const unitsPerPixel = computeWorldUnitsPerPixelAtPoint(point);
    if (unitsPerPixel <= 1e-8) return 8;
    return Math.max(4, radiusWorld / unitsPerPixel);
  }

  function computeDrawDragPointFromScreen(
    drawSession: NonNullable<typeof drawSessionRef.current>,
    clientX: number,
    clientY: number,
  ): Vec3 | null {
    const wrap = canvasWrapRef.current;
    const camera = cameraRef.current as any;
    if (wrap === null || camera === null) return null;
    const rect = wrap.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const worldPoint = new Vector3(ndcX, ndcY, drawSession.startNdcZ).unproject(camera);
    return { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z };
  }

  function mirrorTransformAcrossX(transform: ActuatorEntity["transform"]): ActuatorEntity["transform"] {
    const mirrorMatrix = new Matrix4().makeScale(-1, 1, 1);
    const matrix = composeMatrix(transform.position, transform.rotation, transform.scale);
    const mirroredMatrix = mirrorMatrix.clone().multiply(matrix).multiply(mirrorMatrix);
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    mirroredMatrix.decompose(position, rotation, scale);
    return {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      scale: normalizePositiveScale({ x: scale.x, y: scale.y, z: scale.z }),
    };
  }

  function resolveMirroredCounterpartId(
    actuatorId: string,
    sourceActuators: ActuatorEntity[],
    options?: { preferredParentId?: string | null; allowSelfOnCenterline?: boolean },
  ): string | null {
    const source = sourceActuators.find((actuator) => actuator.id === actuatorId);
    if (source === undefined) return null;
    const sourceCenter = getActuatorPrimitiveCenter(source);
    const centerlineThreshold = 0.02;
    if (Math.abs(sourceCenter.x) <= centerlineThreshold) {
      return options?.allowSelfOnCenterline === true ? source.id : null;
    }
    const targetCenter = { x: -sourceCenter.x, y: sourceCenter.y, z: sourceCenter.z };
    const preferredParentId = options?.preferredParentId;

    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of sourceActuators) {
      if (candidate.id === source.id) continue;
      if (candidate.rigId !== source.rigId) continue;
      if (candidate.shape !== source.shape) continue;
      if (candidate.type !== source.type) continue;
      if (source.parentId === null && candidate.parentId !== null) continue;

      const candidateCenter = getActuatorPrimitiveCenter(candidate);
      const dx = candidateCenter.x - targetCenter.x;
      const dy = candidateCenter.y - targetCenter.y;
      const dz = candidateCenter.z - targetCenter.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > 0.8) continue;

      let score = distance;
      const oppositeSide = sourceCenter.x * candidateCenter.x <= 0;
      if (!oppositeSide && Math.abs(sourceCenter.x) > 0.03) {
        score += 0.35;
      }
      if (preferredParentId !== undefined) {
        if (candidate.parentId !== preferredParentId) {
          score += 0.4;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        bestId = candidate.id;
      }
    }
    return bestId;
  }

  function resolveDrawMirrorParentId(parentId: string, sourceActuators: ActuatorEntity[]): string | null {
    const sourceParent = sourceActuators.find((actuator) => actuator.id === parentId);
    if (sourceParent === undefined) return null;
    return resolveMirroredCounterpartId(parentId, sourceActuators, { allowSelfOnCenterline: true });
  }

  function wouldCreateParentCycle(
    childId: string,
    nextParentId: string,
    byId: Map<string, ActuatorEntity>,
  ): boolean {
    let current = byId.get(nextParentId);
    while (current !== undefined && current.parentId !== null) {
      if (current.parentId === childId) return true;
      current = byId.get(current.parentId);
    }
    return false;
  }

  function canAssignParentToActuator(
    actuatorId: string,
    nextParentId: string,
    byId: Map<string, ActuatorEntity>,
  ): boolean {
    const actuator = byId.get(actuatorId);
    const nextParent = byId.get(nextParentId);
    if (actuator === undefined || nextParent === undefined) return false;
    if (actuator.parentId === null) return false;
    if (actuator.id === nextParent.id) return false;
    if (actuator.rigId !== nextParent.rigId) return false;
    if (wouldCreateParentCycle(actuator.id, nextParent.id, byId)) return false;
    return true;
  }

  function getPointerRayWorld(clientX: number, clientY: number): { origin: Vector3; direction: Vector3 } | null {
    const wrap = canvasWrapRef.current;
    const camera = cameraRef.current;
    if (wrap === null || camera === null) return null;
    const rect = wrap.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pointerNdcRef.current.set(x, y);
    raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);
    return {
      origin: raycasterRef.current.ray.origin.clone(),
      direction: raycasterRef.current.ray.direction.clone().normalize(),
    };
  }

  function intersectRaySphereInterval(localOrigin: Vector3, localDirection: Vector3, radius: number): [number, number] | null {
    const a = localDirection.dot(localDirection);
    const b = 2 * localOrigin.dot(localDirection);
    const c = localOrigin.dot(localOrigin) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const sqrtDiscriminant = Math.sqrt(discriminant);
    const t0 = (-b - sqrtDiscriminant) / (2 * a);
    const t1 = (-b + sqrtDiscriminant) / (2 * a);
    const entry = Math.min(t0, t1);
    const exit = Math.max(t0, t1);
    if (exit < 0) return null;
    const entryClamped = Math.max(0, entry);
    return entryClamped <= exit ? [entryClamped, exit] : null;
  }

  function intersectRayBoxInterval(localOrigin: Vector3, localDirection: Vector3, halfSize: Vec3): [number, number] | null {
    const min = { x: -halfSize.x, y: -halfSize.y, z: -halfSize.z };
    const max = { x: halfSize.x, y: halfSize.y, z: halfSize.z };
    let tMin = Number.NEGATIVE_INFINITY;
    let tMax = Number.POSITIVE_INFINITY;

    const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
    for (const axis of axes) {
      const origin = localOrigin[axis];
      const direction = localDirection[axis];
      if (Math.abs(direction) < 1e-8) {
        if (origin < min[axis] || origin > max[axis]) return null;
        continue;
      }
      const t1 = (min[axis] - origin) / direction;
      const t2 = (max[axis] - origin) / direction;
      const near = Math.min(t1, t2);
      const far = Math.max(t1, t2);
      tMin = Math.max(tMin, near);
      tMax = Math.min(tMax, far);
      if (tMax < tMin) return null;
    }

    if (tMax < 0) return null;
    const entryClamped = Math.max(0, tMin);
    return entryClamped <= tMax ? [entryClamped, tMax] : null;
  }

  function intersectRayCapsuleInterval(
    localOrigin: Vector3,
    localDirection: Vector3,
    radius: number,
    halfAxis: number,
  ): [number, number] | null {
    const candidates: number[] = [];

    const addSphereCandidates = (centerY: number) => {
      const oc = localOrigin.clone().sub(new Vector3(0, centerY, 0));
      const a = localDirection.dot(localDirection);
      const b = 2 * oc.dot(localDirection);
      const c = oc.dot(oc) - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) return;
      const sqrtDiscriminant = Math.sqrt(discriminant);
      const t0 = (-b - sqrtDiscriminant) / (2 * a);
      const t1 = (-b + sqrtDiscriminant) / (2 * a);
      if (Number.isFinite(t0)) candidates.push(t0);
      if (Number.isFinite(t1)) candidates.push(t1);
    };

    const a = localDirection.x * localDirection.x + localDirection.z * localDirection.z;
    if (a > 1e-8) {
      const b = 2 * (localOrigin.x * localDirection.x + localOrigin.z * localDirection.z);
      const c = localOrigin.x * localOrigin.x + localOrigin.z * localOrigin.z - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t0 = (-b - sqrtDiscriminant) / (2 * a);
        const t1 = (-b + sqrtDiscriminant) / (2 * a);
        const y0 = localOrigin.y + t0 * localDirection.y;
        const y1 = localOrigin.y + t1 * localDirection.y;
        if (Number.isFinite(t0) && y0 >= -halfAxis && y0 <= halfAxis) candidates.push(t0);
        if (Number.isFinite(t1) && y1 >= -halfAxis && y1 <= halfAxis) candidates.push(t1);
      }
    }

    addSphereCandidates(halfAxis);
    addSphereCandidates(-halfAxis);

    const unique = [...new Set(candidates.filter((t) => Number.isFinite(t)))].sort((lhs, rhs) => lhs - rhs);
    if (unique.length === 0) return null;

    let entry = unique[0];
    let exit = unique[unique.length - 1];

    if (unique.length === 1) {
      const clampedY = Math.max(-halfAxis, Math.min(halfAxis, localOrigin.y));
      const dy = localOrigin.y - clampedY;
      const inside = localOrigin.x * localOrigin.x + dy * dy + localOrigin.z * localOrigin.z <= radius * radius;
      if (!inside || unique[0] < 0) return null;
      entry = 0;
      exit = unique[0];
    }

    if (exit < 0) return null;
    const entryClamped = Math.max(0, entry);
    return entryClamped <= exit ? [entryClamped, exit] : null;
  }

  function computeDrawSnapMidpointInActuator(clientX: number, clientY: number, actuator: ActuatorEntity): Vec3 | null {
    const ray = getPointerRayWorld(clientX, clientY);
    if (ray === null) return null;

    const center = getActuatorPrimitiveCenter(actuator);
    const rotation = new Quaternion(
      actuator.transform.rotation.x,
      actuator.transform.rotation.y,
      actuator.transform.rotation.z,
      actuator.transform.rotation.w,
    );
    const inverseRotation = rotation.clone().invert();
    const localOrigin = ray.origin.clone().sub(center).applyQuaternion(inverseRotation);
    const localDirection = ray.direction.clone().applyQuaternion(inverseRotation).normalize();

    let interval: [number, number] | null = null;
    if (actuator.shape === "sphere") {
      interval = intersectRaySphereInterval(localOrigin, localDirection, getActuatorRadius(actuator));
    } else if (actuator.shape === "box") {
      interval = intersectRayBoxInterval(localOrigin, localDirection, {
        x: actuator.size.x * 0.5,
        y: actuator.size.y * 0.5,
        z: actuator.size.z * 0.5,
      });
    } else {
      interval = intersectRayCapsuleInterval(
        localOrigin,
        localDirection,
        getActuatorRadius(actuator),
        getCapsuleHalfAxis(actuator.size),
      );
    }
    if (interval === null) return null;

    const tMid = (interval[0] + interval[1]) * 0.5;
    const midpoint = ray.origin.clone().addScaledVector(ray.direction, tMid);
    return { x: midpoint.x, y: midpoint.y, z: midpoint.z };
  }

  function projectPointToActuatorCenterAxis(point: Vec3, actuator: ActuatorEntity): Vec3 {
    const center = getActuatorPrimitiveCenter(actuator);
    const axis = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion(
        actuator.transform.rotation.x,
        actuator.transform.rotation.y,
        actuator.transform.rotation.z,
        actuator.transform.rotation.w,
      ),
    );
    const axisLengthSq = axis.lengthSq();
    if (axisLengthSq < 1e-8) return { x: center.x, y: center.y, z: center.z };
    axis.normalize();
    const halfAxis = actuator.shape === "capsule" ? getCapsuleHalfAxis(actuator.size) : actuator.size.y * 0.5;
    const offset = new Vector3(point.x - center.x, point.y - center.y, point.z - center.z);
    const projectedDistance = offset.dot(axis);
    const clampedDistance = Math.max(-halfAxis, Math.min(halfAxis, projectedDistance));
    const projected = new Vector3(center.x, center.y, center.z).addScaledVector(axis, clampedDistance);
    return { x: projected.x, y: projected.y, z: projected.z };
  }

  function snapshotActuatorTransforms(sourceActuators: ActuatorEntity[] = actuators): Record<string, ActuatorTransformSnapshot> {
    const snapshots: Record<string, ActuatorTransformSnapshot> = {};
    for (const actuator of sourceActuators) {
      snapshots[actuator.id] = {
        position: { ...actuator.transform.position },
        rotation: { ...actuator.transform.rotation },
        scale: { ...actuator.transform.scale },
      };
    }
    return snapshots;
  }

  function syncCreationIndicesFromState(state: EditorState) {
    const maxRigSuffix = state.actuators.reduce((maxValue, actuator) => Math.max(maxValue, extractNumericSuffix(actuator.rigId)), 1);
    nextRigIndexRef.current = Math.max(2, maxRigSuffix + 1);
    const maxActuatorSuffix = state.actuators.reduce((maxValue, actuator) => Math.max(maxValue, extractActuatorIndex(actuator.id)), 0);
    nextActuatorIndexRef.current = Math.max(1, maxActuatorSuffix + 1);
  }

  function buildSceneSnapshot(): SceneSnapshot {
    const frameSpan = Math.max(1, Math.max(bakeStartFrame, bakeEndFrame) - Math.min(bakeStartFrame, bakeEndFrame) + 1);
    return {
      sceneId,
      createdAtUtc: sceneCreatedAtUtc,
      workflowMode,
      editorState: cloneEditorState(editorStateRef.current),
      importedMeshes: importedMeshes.map((mesh) => ({ ...mesh })),
      playback: {
        fps: SCENE_PLAYBACK_FPS,
        durationSec: frameSpan / SCENE_PLAYBACK_FPS,
        activeClipId: null,
      },
      metadata: {
        sourceBaseline: "30c6ea7",
      },
    };
  }

  function requestWorkflowMode(nextMode: WorkflowMode) {
    const transition = transitionWorkflowState(
      {
        workflowMode,
        runtimeMode: appMode === "Pose" ? "Pose" : "Rig",
        physicsEnabled,
        activeTool: workflowToolFromGizmoMode(gizmoMode, appMode),
      },
      nextMode,
      {
        skinningBusy,
      },
    );

    if (!transition.accepted) {
      setIoStatus(`Workflow transition rejected: ${transition.reason}.`);
      return;
    }

    const nextState = transition.state;
    setWorkflowMode(nextState.workflowMode);
    setGizmoMode(gizmoModeFromWorkflowTool(nextState.activeTool));
    if (nextState.runtimeMode === "Pose") {
      requestAppMode("Pose");
    } else {
      requestAppMode("Rig");
    }
    setIoStatus(`Workflow mode set to ${nextState.workflowMode}.`);
  }

  function saveSceneToFile() {
    try {
      const envelope = createSceneEnvelope(buildSceneSnapshot());
      const serialized = stableSerializeSceneEnvelope(envelope);
      downloadTextFile(`${sceneId}.a2scene.json`, serialized, "application/json");
      setIoStatus(`Saved scene ${sceneId} (${envelope.envelopeVersion}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown save error.";
      setIoStatus(`Save failed: ${message}`);
    }
  }

  async function loadSceneFromFile(file: File) {
    try {
      const payload = await file.text();
      const envelope = parseSceneEnvelope(payload);
      const snapshot = sceneSnapshotFromEnvelope(envelope);
      const nextState = cloneEditorState(snapshot.editorState);
      editorStateRef.current = nextState;
      setEditorState(nextState);
      setSceneId(snapshot.sceneId);
      setSceneCreatedAtUtc(snapshot.createdAtUtc);
      setImportedMeshes(snapshot.importedMeshes);
      setLastBakeCache(null);
      setWorkflowMode(snapshot.workflowMode);
      syncCreationIndicesFromState(nextState);
      undoStackRef.current = [];
      redoStackRef.current = [];

      const nextRuntimeMode: AppMode = snapshot.workflowMode === "Puppeteering" ? "Pose" : "Rig";
      requestAppMode(nextRuntimeMode);
      const clampedTool = clampToolToWorkflow(snapshot.workflowMode, workflowToolFromGizmoMode(gizmoMode, nextRuntimeMode));
      setGizmoMode(gizmoModeFromWorkflowTool(clampedTool));
      setIoStatus(`Loaded scene ${snapshot.sceneId} from ${file.name}.`);
    } catch (error) {
      if (error instanceof SceneLoadError) {
        setIoStatus(`Load failed (${error.code}): ${error.message}`);
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown load error.";
      setIoStatus(`Load failed: ${message}`);
    }
  }

  function handleSceneFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    void loadSceneFromFile(file);
  }

  function clearScene() {
    const root = createRootActuator(initialRigId);
    setEditorState({
      actuators: [root],
      selectedRigId: initialRigId,
      selectedActuatorId: root.id,
      selectedActuatorIds: [root.id],
    });
    setImportedMeshes([]);
    setCollapsedNodeIds(new Set());
  }

  /** Find texture files that match a mesh file by name stem; returns blob URLs for color/normal/roughness. */
  function findTextureUrisForMeshFile(meshFileName: string, allFiles: readonly File[]): { colorMapUri?: string; normalMapUri?: string; roughnessMapUri?: string } {
    const dot = meshFileName.lastIndexOf(".");
    const stem = (dot <= 0 ? meshFileName : meshFileName.slice(0, dot)).toLowerCase();
    const imageExt = new Set([".png", ".jpg", ".jpeg", ".webp"]);
    const result: { colorMapUri?: string; normalMapUri?: string; roughnessMapUri?: string } = {};
    const bySuffix: { color?: File; normal?: File; roughness?: File } = {};
    for (const f of allFiles) {
      const name = f.name.toLowerCase();
      const ext = name.slice(name.lastIndexOf("."));
      if (!imageExt.has(ext)) continue;
      const fileStem = name.slice(0, name.lastIndexOf("."));
      if (!fileStem.startsWith(stem) && !stem.startsWith(fileStem)) continue;
      const suffix = fileStem === stem ? "" : fileStem.slice(stem.length).replace(/^[-_]/, "").replace(/[-_]/g, "_");
      const suffixNorm = suffix.toLowerCase();
      if (
        /^(col|color|diffuse|albedo|base_color|basecolor)$/.test(suffixNorm) &&
        bySuffix.color === undefined
      ) {
        bySuffix.color = f;
      } else if (/^(norm|normal)$/.test(suffixNorm) && bySuffix.normal === undefined) {
        bySuffix.normal = f;
      } else if (
        /^(pbr|roughness|metal|metalness)$/.test(suffixNorm) &&
        bySuffix.roughness === undefined
      ) {
        bySuffix.roughness = f;
      } else if (fileStem === stem && bySuffix.color === undefined) {
        bySuffix.color = f;
      }
    }
    if (bySuffix.color) result.colorMapUri = URL.createObjectURL(bySuffix.color);
    if (bySuffix.normal) result.normalMapUri = URL.createObjectURL(bySuffix.normal);
    if (bySuffix.roughness) result.roughnessMapUri = URL.createObjectURL(bySuffix.roughness);
    return result;
  }

  async function importMeshFiles(files: readonly File[], replaceMeshes: ImportedMeshDocument[] = importedMeshes) {
    if (files.length === 0) return;
    const nextMessages: string[] = [];
    let nextMeshes = replaceMeshes.slice();
    const existingIds = new Set(nextMeshes.map((mesh) => mesh.id));

    for (const file of files) {
      const isMesh =
        /\.(fbx|glb|gltf)$/i.test(file.name);
      if (!isMesh) continue;

      const sourceUri = URL.createObjectURL(file);
      const normalized = normalizeMeshImport(
        {
          name: file.name,
          size: file.size,
          type: file.type,
        },
        sourceUri,
        {
          existingIds,
        },
      );
      if (!normalized.ok) {
        URL.revokeObjectURL(sourceUri);
        nextMessages.push(normalized.message);
        continue;
      }
      const textures = findTextureUrisForMeshFile(file.name, files);
      const meshDoc: ImportedMeshDocument = {
        ...normalized.mesh,
        ...(textures.colorMapUri && { colorMapUri: textures.colorMapUri }),
        ...(textures.normalMapUri && { normalMapUri: textures.normalMapUri }),
        ...(textures.roughnessMapUri && { roughnessMapUri: textures.roughnessMapUri }),
      };
      if (normalized.mesh.format === "fbx" || normalized.mesh.format === "glb") {
        try {
          const geometry = await loadMeshGeometryForInspection(sourceUri, normalized.mesh.format);
          if (geometry !== null) {
            const defaults = suggestImportDefaults(geometry);
            meshDoc.importScale = defaults.importScale;
            meshDoc.upAxis = defaults.upAxis;
          }
        } catch {
          /* keep meshDoc defaults */
        }
      }
      existingIds.add(normalized.mesh.id);
      nextMeshes = integrateImportedMesh(nextMeshes, meshDoc);
      nextMessages.push(`Imported ${file.name} as ${normalized.mesh.id}.`);
    }

    undoStackRef.current.push({
      editorState: cloneEditorState(editorStateRef.current),
      importedMeshes: cloneImportedMeshes(importedMeshesRef.current),
    });
    redoStackRef.current = [];
    setImportedMeshes(nextMeshes);
    if (nextMessages.length > 0) {
      setMeshImportStatus(nextMessages.join(" "));
    }
  }

  function handleMeshFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files === null || files.length === 0) return;
    const fileList = Array.from(files);
    event.target.value = "";
    const hasExistingScene = importedMeshes.length > 0 || editorState.actuators.length > 1;
    if (hasExistingScene && fileList.length > 0) {
      setPendingImportFiles(fileList);
      return;
    }
    setMeshImportStatus(`Importing ${fileList.length} file(s)...`);
    importMeshFiles(fileList);
  }

  function resolvePendingImport(clearFirst: boolean) {
    const files = pendingImportFiles;
    setPendingImportFiles(null);
    if (files === null || files.length === 0) return;
    const meshFileCount = files.filter((f) => /\.(fbx|glb|gltf)$/i.test(f.name)).length;
    setMeshImportStatus(`Importing ${files.length} file(s)...`);
    if (clearFirst && meshFileCount > 0) {
      clearScene();
      importMeshFiles(files, []);
    } else if (clearFirst && meshFileCount === 0) {
      setMeshImportStatus("No mesh files (.fbx, .glb, .gltf) in selection. Scene unchanged.");
    } else {
      importMeshFiles(files);
    }
  }

  function captureBakeFromCurrentState() {
    const start = Math.min(bakeStartFrame, bakeEndFrame);
    const end = Math.max(bakeStartFrame, bakeEndFrame);
    try {
      const cache = captureBakeCache({
        fps: SCENE_PLAYBACK_FPS,
        startFrame: start,
        endFrame: end,
        actuators: editorStateRef.current.actuators.map((actuator) => ({
          id: actuator.id,
          parentId: actuator.parentId,
          transform: {
            position: { ...actuator.transform.position },
            rotation: { ...actuator.transform.rotation },
            scale: { ...actuator.transform.scale },
          },
        })),
      });
      setLastBakeCache(cache);
      setExportStatus(`Bake cache ${cache.cacheId} captured (${cache.frames.length} frames, ${cache.actuatorIds.length} actuators).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown bake capture error.";
      setExportStatus(`Bake capture failed: ${message}`);
    }
  }

  function exportCapturedBake() {
    if (lastBakeCache === null) {
      setExportStatus("Export failed: capture a bake cache first.");
      return;
    }
    const result = exportRegistryRef.current.runExportJob({
      format: exportFormat,
      cache: lastBakeCache,
      sceneId,
    });
    if (result.status === "success") {
      downloadTextFile(result.fileName, result.content, result.mimeType);
      setExportStatus(`Exported ${result.fileName} (${result.format}).`);
      return;
    }
    if (result.status === "unsupported") {
      setExportStatus(`Export unsupported (${result.format}): ${result.reason}`);
      return;
    }
    setExportStatus(`Export failed (${result.format}): ${result.reason}`);
  }

  function requestAppMode(nextMode: AppMode) {
    if (nextMode === "Pose") {
      if (appMode === "Pose" && pendingPoseRevision === null) return;
      previousRigToolModeRef.current = gizmoMode;
      setGizmoMode(POSE_TOOL_MODE);
      poseEntrySnapshotRef.current = cloneEditorState(editorState);
      const requiredRevision = skinningRevision + 1;
      setPendingPoseRevision(requiredRevision);
      setSkinningEnabled(true);
      setSkinningRevision(requiredRevision);
      return;
    }

    if (appMode === "Rig" && pendingPoseRevision === null && !physicsEnabled) return;
    setPendingPoseRevision(null);
    setSkinningEnabled(false);
    setAppMode("Rig");
    setGizmoMode(previousRigToolModeRef.current);
    setIsPosePullDragging(false);
    setPoseTargetActuators(null);
    poseEntrySnapshotRef.current = null;

    const wasSimulating = physicsEnabled;
    if (wasSimulating) {
      setPhysicsEnabled(false);
      const snapshot = simulationStartSnapshotRef.current;
      simulationStartSnapshotRef.current = null;
      if (snapshot !== null) {
        editorStateRef.current = snapshot;
        setEditorState(snapshot);
      }
    }
    if (wasSimulating) return;

    const bindPose = bindPoseTransformsRef.current;
    if (bindPose === null) return;
    const velocityById: Record<
      string,
      {
        position: SmoothDampVec3Velocity;
        scale: SmoothDampVec3Velocity;
        rotation: SmoothDampQuatVelocity;
      }
    > = {};
    for (const actuatorId of Object.keys(bindPose)) {
      velocityById[actuatorId] = {
        position: { x: 0, y: 0, z: 0 },
        scale: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 0 },
      };
    }
    bindBlendStateRef.current = {
      target: bindPose,
      lastTimestampMs: null,
      velocityById,
    };
    setBindBlendNonce((value) => value + 1);
  }

  useEffect(() => {
    if (appMode !== "Rig") return;
    if (pendingPoseRevision !== null) return;
    if (bindBlendStateRef.current !== null) return;
    if (isTransformDragging) return;
    const timer = setTimeout(() => {
      setSkinningRevision((value) => value + 1);
    }, 60);
    return () => clearTimeout(timer);
  }, [actuators, appMode, isTransformDragging, pendingPoseRevision]);

  useEffect(() => {
    if (pendingPoseRevision === null) return;
    if (skinningBusy) return;
    if (completedSkinningRevision < pendingPoseRevision) return;
    const poseEntrySnapshot = poseEntrySnapshotRef.current ?? cloneEditorState(editorState);
    bindPoseTransformsRef.current = snapshotActuatorTransforms(poseEntrySnapshot.actuators);
    simulationStartSnapshotRef.current = poseEntrySnapshot;
    setPoseTargetActuators(poseEntrySnapshot.actuators);
    setSkinningEnabled(true);
    setAppMode("Pose");
    setPhysicsEnabled(true);
    setPendingPoseRevision(null);
  }, [actuators, completedSkinningRevision, editorState, pendingPoseRevision, skinningBusy]);

  useEffect(() => {
    const blend = bindBlendStateRef.current;
    if (blend === null) return;

    let frameId = 0;
    const update = (timestamp: number) => {
      const activeBlend = bindBlendStateRef.current;
      if (activeBlend === null) return;
      const previousTimestamp = activeBlend.lastTimestampMs ?? timestamp;
      const deltaSec = Math.max(1 / 240, Math.min((timestamp - previousTimestamp) / 1000, 1 / 15));
      activeBlend.lastTimestampMs = timestamp;

      const source = editorStateRef.current;
      let allSettled = true;
      const nextActuators = source.actuators.map((actuator) => {
        const target = activeBlend.target[actuator.id];
        if (target === undefined) return actuator;

        const velocity = activeBlend.velocityById[actuator.id] ?? {
          position: { x: 0, y: 0, z: 0 },
          scale: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 0 },
        };
        activeBlend.velocityById[actuator.id] = velocity;

        const smoothedPosition = smoothDampVec3(
          new Vector3(
            actuator.transform.position.x,
            actuator.transform.position.y,
            actuator.transform.position.z,
          ),
          new Vector3(target.position.x, target.position.y, target.position.z),
          velocity.position,
          0.08,
          deltaSec,
        );
        const smoothedScale = smoothDampVec3(
          new Vector3(
            actuator.transform.scale.x,
            actuator.transform.scale.y,
            actuator.transform.scale.z,
          ),
          new Vector3(target.scale.x, target.scale.y, target.scale.z),
          velocity.scale,
          0.08,
          deltaSec,
        );
        const smoothedRotation = smoothDampQuat(
          new Quaternion(
            actuator.transform.rotation.x,
            actuator.transform.rotation.y,
            actuator.transform.rotation.z,
            actuator.transform.rotation.w,
          ),
          new Quaternion(target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.w),
          velocity.rotation,
          0.08,
          deltaSec,
        );

        const positionError = smoothedPosition.distanceTo(
          new Vector3(target.position.x, target.position.y, target.position.z),
        );
        const scaleError = smoothedScale.distanceTo(new Vector3(target.scale.x, target.scale.y, target.scale.z));
        const rotationError = smoothedRotation.angleTo(
          new Quaternion(target.rotation.x, target.rotation.y, target.rotation.z, target.rotation.w),
        );
        const velocityMagnitude =
          Math.hypot(velocity.position.x, velocity.position.y, velocity.position.z) +
          Math.hypot(velocity.scale.x, velocity.scale.y, velocity.scale.z) +
          Math.hypot(velocity.rotation.x, velocity.rotation.y, velocity.rotation.z, velocity.rotation.w);
        if (positionError > 0.0008 || scaleError > 0.0008 || rotationError > 0.0015 || velocityMagnitude > 0.02) {
          allSettled = false;
        }

        return {
          ...actuator,
          transform: {
            ...actuator.transform,
            position: {
              x: smoothedPosition.x,
              y: smoothedPosition.y,
              z: smoothedPosition.z,
            },
            rotation: {
              x: smoothedRotation.x,
              y: smoothedRotation.y,
              z: smoothedRotation.z,
              w: smoothedRotation.w,
            },
            scale: normalizePositiveScale({
              x: smoothedScale.x,
              y: smoothedScale.y,
              z: smoothedScale.z,
            }),
          },
        };
      });

      const nextState: EditorState = {
        ...source,
        actuators: nextActuators,
      };
      editorStateRef.current = nextState;
      setEditorState(nextState);

      if (allSettled) {
        bindBlendStateRef.current = null;
      } else {
        frameId = requestAnimationFrame(update);
      }
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [bindBlendNonce]);

  function cloneImportedMeshes(meshes: ImportedMeshDocument[]): ImportedMeshDocument[] {
    return meshes.map((m) => ({ ...m }));
  }

  function cloneEditorState(state: EditorState): EditorState {
    return {
      selectedRigId: state.selectedRigId,
      selectedActuatorId: state.selectedActuatorId,
      selectedActuatorIds: [...state.selectedActuatorIds],
      actuators: state.actuators.map((actuator) => ({
        ...actuator,
        pivot: {
          ...actuator.pivot,
          offset: { ...actuator.pivot.offset },
        },
        transform: {
          ...actuator.transform,
          position: { ...actuator.transform.position },
          rotation: { ...actuator.transform.rotation },
          scale: { ...actuator.transform.scale },
        },
        size: normalizePrimitiveSize(actuator.size),
      })),
    };
  }

  function commitEditorChange(updater: (previous: EditorState) => EditorState) {
    setEditorState((previous) => {
      const next = updater(previous);
      if (next === previous) return previous;
      undoStackRef.current.push({
        editorState: cloneEditorState(previous),
        importedMeshes: cloneImportedMeshes(importedMeshesRef.current),
      });
      redoStackRef.current = [];
      editorStateRef.current = next;
      return next;
    });
  }

  function setSelection(nextIds: string[], preferredId?: string | null) {
    const sortedUnique = [...new Set(nextIds)].sort((a, b) => a.localeCompare(b));
    const primary =
      preferredId !== undefined && preferredId !== null && sortedUnique.includes(preferredId)
        ? preferredId
        : (sortedUnique[0] ?? null);
    const selectedPrimary = primary === null ? null : actuators.find((actuator) => actuator.id === primary);
    const primaryRigId = selectedPrimary?.rigId ?? selectedRigId;
    const rigConstrained =
      appMode === "Rig"
        ? sortedUnique.filter((id) => {
            const actuator = actuators.find((item) => item.id === id);
            return actuator?.rigId === primaryRigId;
          })
        : sortedUnique;
    const nextPrimary =
      preferredId !== undefined && preferredId !== null && rigConstrained.includes(preferredId)
        ? preferredId
        : (rigConstrained[0] ?? null);
    const nextRigId = primaryRigId;

    if (sortedUnique.length > 0) setSelectedMeshSourceId(null);
    commitEditorChange((previous) => {
      const samePrimary = previous.selectedActuatorId === nextPrimary;
      const sameRig = previous.selectedRigId === nextRigId;
      const sameIds =
        previous.selectedActuatorIds.length === rigConstrained.length &&
        previous.selectedActuatorIds.every((id, index) => id === rigConstrained[index]);
      if (samePrimary && sameIds && sameRig) return previous;
      return {
        actuators: previous.actuators,
        selectedRigId: nextRigId,
        selectedActuatorId: nextPrimary,
        selectedActuatorIds: rigConstrained,
      };
    });
  }

  function createActuator() {
    if (!workflowAllowsRigAuthoring || appMode !== "Rig" || physicsEnabled) {
      setIoStatus(`Create actuator is disabled in ${workflowMode} workflow.`);
      return;
    }
    commitEditorChange((previous) => {
      const activeRigId = previous.selectedRigId;
      const rigActuators = previous.actuators.filter((actuator) => actuator.rigId === activeRigId);
      const fallbackRoot = rigActuators.find((actuator) => actuator.parentId === null) ?? createRootActuator(activeRigId);
      const selectedParents = [...new Set(previous.selectedActuatorIds)]
        .map((selectedId) => previous.actuators.find((actuator) => actuator.id === selectedId && actuator.rigId === activeRigId))
        .filter((actuator): actuator is ActuatorEntity => actuator !== undefined);
      const fallbackParent =
        previous.actuators.find((actuator) => actuator.id === previous.selectedActuatorId && actuator.rigId === activeRigId) ??
        fallbackRoot;
      const parents = selectedParents.length > 0 ? selectedParents : [fallbackParent];
      const selectedParentIdSet = new Set(parents.map((parent) => parent.id));

      const created: ActuatorEntity[] = [];
      const nextId = () => {
        const index = nextActuatorIndexRef.current;
        nextActuatorIndexRef.current += 1;
        return `${activeRigId}_act_${index.toString().padStart(4, "0")}`;
      };
      for (const parent of parents) {
        const id = nextId();

        const parentRotation = new Quaternion(
          parent.transform.rotation.x,
          parent.transform.rotation.y,
          parent.transform.rotation.z,
          parent.transform.rotation.w,
        );
        const parentUp = new Vector3(0, 1, 0).applyQuaternion(parentRotation);
        const parentCenter = getActuatorPrimitiveCenter(parent);

        const childShape = parent.shape;
        const childPreset = newActuatorPreset;
        const childPivot = {
          mode: parent.pivot.mode,
          offset: { ...parent.pivot.offset },
        };
        const childSize = normalizePrimitiveSize({ ...parent.size });
        const parentHalfExtent = parent.shape === "capsule" ? getCapsuleHalfAxis(parent.size) : parent.size.y * 0.5;
        const childHalfExtent = childShape === "capsule" ? getCapsuleHalfAxis(childSize) : childSize.y * 0.5;
        const endOffset = parentUp.clone().multiplyScalar(parentHalfExtent + childHalfExtent + 0.08);
        const spawnCenter = parentCenter.add(endOffset);
        const desiredPivotWorld =
          childShape === "capsule" && childPivot.mode === "capStart"
            ? spawnCenter.clone().addScaledVector(parentUp, -childHalfExtent)
            : spawnCenter.clone();
        const rotatedPivotOffset = new Vector3(childPivot.offset.x, childPivot.offset.y, childPivot.offset.z).applyQuaternion(
          parentRotation,
        );
        const spawnTransformPosition = desiredPivotWorld.sub(rotatedPivotOffset);

        created.push({
          id,
          rigId: activeRigId,
          parentId: parent.id,
          type: "custom",
          shape: childShape,
          preset: childPreset,
          pivot: childPivot,
          transform: {
            position: {
              x: spawnTransformPosition.x,
              y: spawnTransformPosition.y,
              z: spawnTransformPosition.z,
            },
            rotation: {
              x: parentRotation.x,
              y: parentRotation.y,
              z: parentRotation.z,
              w: parentRotation.w,
            },
            scale: { x: 1, y: 1, z: 1 },
          },
          size: normalizePrimitiveSize(childSize),
        });

        // Centerline parents should create only one actuator even if child offset drifts.
        if (shouldSpawnMirrored({ x: parentCenter.x, y: parentCenter.y, z: parentCenter.z }, drawMirrorEnabled)) {
          const mirrorParentId = resolveMirroredCounterpartId(parent.id, previous.actuators);
          if (mirrorParentId !== null && !selectedParentIdSet.has(mirrorParentId)) {
            const source = created[created.length - 1];
            created.push({
              ...source,
              id: nextId(),
              parentId: mirrorParentId,
              pivot: {
                ...source.pivot,
                offset: {
                  x: -source.pivot.offset.x,
                  y: source.pivot.offset.y,
                  z: source.pivot.offset.z,
                },
              },
              transform: mirrorTransformAcrossX(source.transform),
            });
          }
        }
      }

      const createdIds = created.map((actuator) => actuator.id);
      return {
        actuators: [...previous.actuators, ...created],
        selectedRigId: previous.selectedRigId,
        selectedActuatorId: createdIds[0] ?? previous.selectedActuatorId,
        selectedActuatorIds: createdIds,
      };
    });
  }

  function buildDrawDraftActuators(
    startPoint: Vec3,
    endPoint: Vec3,
    worldRadius: number,
    rigId: string,
    parentId: string,
    mirrorParentId: string | null,
    mirrorSpawn: boolean,
    preset: ActuatorPreset,
  ): ActuatorEntity[] {
    const baseMain = buildDrawCapsuleActuator({
      id: "draft_main",
      rigId,
      parentId,
      center: startPoint,
      axis: { x: 0, y: 1, z: 0 },
      radius: worldRadius,
      halfAxis: 0,
      preset,
    });
    const mainUpdated = updateCapsuleFromEndpoints(startPoint, endPoint, worldRadius, baseMain.transform.rotation);
    const main: ActuatorEntity = {
      ...baseMain,
      transform: {
        ...baseMain.transform,
        position: mainUpdated.position,
        rotation: mainUpdated.rotation,
        scale: { x: 1, y: 1, z: 1 },
      },
      size: mainUpdated.size,
    };

    if (!mirrorSpawn || mirrorParentId === null) return [main];

    const mirrored = mirrorPlacementAcrossX(startPoint, { x: 0, y: 1, z: 0 });
    const mirroredStart = mirrored.center;
    const mirroredEnd = mirrorPlacementAcrossX(endPoint, { x: 0, y: 1, z: 0 }).center;
    const baseMirror = buildDrawCapsuleActuator({
      id: "draft_mirror",
      rigId,
      parentId: mirrorParentId,
      center: mirroredStart,
      axis: mirrored.axis,
      radius: worldRadius,
      halfAxis: 0,
      preset,
    });
    const mirrorUpdated = updateCapsuleFromEndpoints(
      mirroredStart,
      mirroredEnd,
      worldRadius,
      baseMirror.transform.rotation,
    );
    const mirrorActuator: ActuatorEntity = {
      ...baseMirror,
      transform: {
        ...baseMirror.transform,
        position: mirrorUpdated.position,
        rotation: mirrorUpdated.rotation,
        scale: { x: 1, y: 1, z: 1 },
      },
      size: mirrorUpdated.size,
    };
    return [main, mirrorActuator];
  }

  function applyDrawDraftFromSession(drawSession: NonNullable<typeof drawSessionRef.current>, nextEnd: Vec3, nextRadius: number) {
    const requestedMirrorSpawn = shouldSpawnMirrored(nextEnd, drawMirrorEnabled);
    const resolvedMirrorParentId =
      requestedMirrorSpawn ? resolveDrawMirrorParentId(drawSession.parentId, actuators) : null;
    const nextMirrorSpawn = requestedMirrorSpawn && resolvedMirrorParentId !== null;
    const nextDraft = buildDrawDraftActuators(
      drawSession.startPoint,
      nextEnd,
      nextRadius,
      drawSession.rigId,
      drawSession.parentId,
      resolvedMirrorParentId,
      nextMirrorSpawn,
      drawSession.preset,
    );
    setDrawDraftActuators(nextDraft);
    drawSessionRef.current = {
      ...drawSession,
      endPoint: nextEnd,
      worldRadius: nextRadius,
      mirrorParentId: resolvedMirrorParentId,
      mirrorSpawn: nextMirrorSpawn,
    };
  }

  function applyPresetToSelection(nextPreset: ActuatorPreset) {
    commitEditorChange((previous) => {
      if (previous.selectedActuatorIds.length === 0) return previous;
      const selectedIds = new Set(previous.selectedActuatorIds);
      if (drawMirrorEnabled) {
        for (const selectedId of previous.selectedActuatorIds) {
          const mirrorId = resolveMirroredCounterpartId(selectedId, previous.actuators);
          if (mirrorId !== null) selectedIds.add(mirrorId);
        }
      }
      let changed = false;
      const nextActuators = previous.actuators.map((actuator) => {
        if (!selectedIds.has(actuator.id)) return actuator;
        if (actuator.type === "root" || actuator.parentId === null) return actuator;
        const currentPreset = actuator.preset ?? defaultPresetForActuatorType(actuator.type);
        if (currentPreset === nextPreset) return actuator;
        changed = true;
        return {
          ...actuator,
          preset: nextPreset,
        };
      });
      if (!changed) return previous;
      return {
        ...previous,
        actuators: nextActuators,
      };
    });
  }

  function applyPropertiesTransform(
    ids: string[],
    patch: Partial<{ position: Vec3; rotation: Quat; scale: Vec3; size: Vec3 }>,
  ) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const updater = (previous: EditorState): EditorState => {
      const nextActuators = previous.actuators.map((actuator) => {
        if (!idSet.has(actuator.id)) return actuator;
        const next: ActuatorEntity = { ...actuator };
        if (patch.position != null) {
          next.transform = { ...next.transform, position: { ...patch.position } };
        }
        if (patch.rotation != null) {
          next.transform = { ...next.transform, rotation: { ...patch.rotation } };
        }
        if (patch.scale != null) {
          next.transform = { ...next.transform, scale: { ...patch.scale } };
        }
        if (patch.size != null) {
          next.size = { ...patch.size };
        }
        return next;
      });
      return { ...previous, actuators: nextActuators };
    };
    if (propertiesBatchTimerRef.current !== null) {
      clearTimeout(propertiesBatchTimerRef.current);
      propertiesBatchTimerRef.current = null;
    }
    const shouldPushUndo = !propertiesBatchHasPushedRef.current;
    if (shouldPushUndo) {
      propertiesBatchHasPushedRef.current = true;
      commitEditorChange(updater);
    } else {
      setEditorState((previous) => {
        const next = updater(previous);
        if (next === previous) return previous;
        editorStateRef.current = next;
        return next;
      });
    }
    propertiesBatchTimerRef.current = setTimeout(() => {
      propertiesBatchHasPushedRef.current = false;
      propertiesBatchTimerRef.current = null;
    }, PROPERTIES_UNDO_BATCH_MS);
  }

  function applyPropertiesPhysicsOverrides(ids: string[], overrides: ActuatorPhysicsOverrides) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const updater = (previous: EditorState): EditorState => {
      const nextActuators = previous.actuators.map((actuator) => {
        if (!idSet.has(actuator.id)) return actuator;
        const merged: ActuatorPhysicsOverrides = {
          ...actuator.physicsOverrides,
          ...overrides,
        };
        return {
          ...actuator,
          physicsOverrides: Object.keys(merged).length > 0 ? merged : undefined,
        };
      });
      return { ...previous, actuators: nextActuators };
    };
    if (propertiesBatchTimerRef.current !== null) {
      clearTimeout(propertiesBatchTimerRef.current);
      propertiesBatchTimerRef.current = null;
    }
    const shouldPushUndo = !propertiesBatchHasPushedRef.current;
    if (shouldPushUndo) {
      propertiesBatchHasPushedRef.current = true;
      commitEditorChange(updater);
    } else {
      setEditorState((previous) => {
        const next = updater(previous);
        if (next === previous) return previous;
        editorStateRef.current = next;
        return next;
      });
    }
    propertiesBatchTimerRef.current = setTimeout(() => {
      propertiesBatchHasPushedRef.current = false;
      propertiesBatchTimerRef.current = null;
    }, PROPERTIES_UNDO_BATCH_MS);
  }

  function commitDrawDraftActuators(rigId: string, draftActuators: ActuatorEntity[]) {
    commitEditorChange((previous) => {
      const createdIds: string[] = [];
      const nextActuators = draftActuators.map((draft) => {
        const index = nextActuatorIndexRef.current;
        nextActuatorIndexRef.current += 1;
        const id = `${rigId}_act_${index.toString().padStart(4, "0")}`;
        createdIds.push(id);
        return {
          ...draft,
          id,
          rigId,
        };
      });
      if (nextActuators.length === 0) return previous;
      return {
        actuators: [...previous.actuators, ...nextActuators],
        selectedRigId: previous.selectedRigId,
        selectedActuatorId: createdIds[0] ?? previous.selectedActuatorId,
        selectedActuatorIds: createdIds,
      };
    });
  }

  function commitDrawSession(drawSession: NonNullable<typeof drawSessionRef.current>) {
    const finalDraft = buildDrawDraftActuators(
      drawSession.startPoint,
      drawSession.endPoint,
      drawSession.worldRadius,
      drawSession.rigId,
      drawSession.parentId,
      drawSession.mirrorParentId,
      drawSession.mirrorSpawn,
      drawSession.preset,
    );
    commitDrawDraftActuators(drawSession.rigId, finalDraft);
  }

  function createRig() {
    if (!workflowAllowsRigAuthoring || appMode !== "Rig" || physicsEnabled) {
      setIoStatus(`Create rig is disabled in ${workflowMode} workflow.`);
      return;
    }
    const rigIndex = nextRigIndexRef.current;
    nextRigIndexRef.current += 1;
    const rigId = `rig_${rigIndex.toString().padStart(3, "0")}`;
    const root = createRootActuator(rigId, (rigIndex - 1) * 1.5);

    commitEditorChange((previous) => ({
      actuators: [...previous.actuators, root],
      selectedRigId: rigId,
      selectedActuatorId: root.id,
      selectedActuatorIds: [root.id],
    }));
  }

  function deleteSelectedActuator() {
    if (!workflowAllowsRigAuthoring || appMode !== "Rig" || physicsEnabled) {
      setIoStatus(`Delete is disabled in ${workflowMode} workflow.`);
      return;
    }
    commitEditorChange((previous) => {
      const explicitSelectionIds = previous.selectedActuatorIds.filter((id) => {
        const actuator = previous.actuators.find((item) => item.id === id);
        return actuator !== undefined && actuator.parentId !== null;
      });
      if (explicitSelectionIds.length === 0) return previous;

      const mirroredSelectionIds = drawMirrorEnabled
        ? explicitSelectionIds
            .map((id) => resolveMirroredCounterpartId(id, previous.actuators))
            .filter((id): id is string => id !== null)
        : [];

      const removeIds = new Set<string>([...explicitSelectionIds, ...mirroredSelectionIds]);
      let changed = true;

      while (changed) {
        changed = false;
        for (const actuator of previous.actuators) {
          if (actuator.parentId !== null && removeIds.has(actuator.parentId) && !removeIds.has(actuator.id)) {
            removeIds.add(actuator.id);
            changed = true;
          }
        }
      }

      const remainingForRig = previous.actuators.filter(
        (actuator) => actuator.rigId === previous.selectedRigId && !removeIds.has(actuator.id),
      );
      const nextRoot = remainingForRig.find((actuator) => actuator.parentId === null) ?? null;

      return {
        actuators: previous.actuators.filter((actuator) => !removeIds.has(actuator.id)),
        selectedRigId: previous.selectedRigId,
        selectedActuatorId: nextRoot?.id ?? null,
        selectedActuatorIds: nextRoot === null ? [] : [nextRoot.id],
      };
    });
  }

  function selectActuator(id: string, options?: { additive?: boolean; toggle?: boolean }) {
    const additive = options?.additive === true;
    const toggle = options?.toggle === true;
    const alreadySelected = selectedActuatorIds.includes(id);

    if (toggle) {
      if (alreadySelected) {
        const remaining = selectedActuatorIds.filter((selectedId) => selectedId !== id);
        setSelection(remaining, remaining[0] ?? null);
        return;
      }
      setSelection([...selectedActuatorIds, id], id);
      return;
    }

    if (additive) {
      if (alreadySelected) return;
      setSelection([...selectedActuatorIds, id], id);
      return;
    }

    setSelection([id], id);
  }

  function selectMeshSource(meshId: string) {
    setSelectedMeshSourceId(meshId);
    setSelection([], null);
  }

  function onMeshImportSettingsChange(
    meshId: string,
    patch: Partial<{
      upAxis: ImportedMeshDocument["upAxis"];
      importScale: number;
      positionOffset: Vec3;
      rotationOffset: Vec3;
      flipNormals: boolean;
    }>,
  ) {
    setImportedMeshes((prev) =>
      prev.map((m) => (m.id !== meshId ? m : { ...m, ...patch })),
    );
  }

  function canReparentSourcesToTarget(sourceIds: string[], targetParentId: string): boolean {
    if (!workflowAllowsRigAuthoring || physicsEnabled || appMode !== "Rig") return false;
    const byId = new Map(actuators.map((actuator) => [actuator.id, actuator]));
    if (!byId.has(targetParentId)) return false;
    const selected = [...new Set(sourceIds)].filter((id) => byId.has(id));
    if (selected.length === 0) return false;
    for (const sourceId of selected) {
      if (canAssignParentToActuator(sourceId, targetParentId, byId)) return true;
    }
    if (!drawMirrorEnabled) return false;
    const mirrorTargetId = resolveMirroredCounterpartId(targetParentId, actuators, { allowSelfOnCenterline: true });
    if (mirrorTargetId === null) return false;
    const selectedSet = new Set(selected);
    for (const sourceId of selected) {
      const mirrorId = resolveMirroredCounterpartId(sourceId, actuators);
      if (mirrorId === null || selectedSet.has(mirrorId)) continue;
      if (canAssignParentToActuator(mirrorId, mirrorTargetId, byId)) return true;
    }
    return false;
  }

  function reparentSourceActuatorsToTarget(sourceIds: string[], targetParentId: string) {
    commitEditorChange((previous) => {
      if (sourceIds.length === 0) return previous;
      const byId = new Map(previous.actuators.map((actuator) => [actuator.id, actuator]));
      if (!byId.has(targetParentId)) return previous;

      const selected = [...new Set(sourceIds)]
        .filter((id) => byId.has(id))
        .sort((lhs, rhs) => lhs.localeCompare(rhs));
      if (selected.length === 0) return previous;

      const selectedSet = new Set(selected);
      const parentUpdates = new Map<string, string>();

      for (const selectedId of selected) {
        if (!canAssignParentToActuator(selectedId, targetParentId, byId)) continue;
        parentUpdates.set(selectedId, targetParentId);
      }

      if (drawMirrorEnabled) {
        const mirrorTargetId = resolveMirroredCounterpartId(targetParentId, previous.actuators, {
          allowSelfOnCenterline: true,
        });
        if (mirrorTargetId !== null) {
          for (const selectedId of selected) {
            const mirrorId = resolveMirroredCounterpartId(selectedId, previous.actuators);
            if (mirrorId === null || selectedSet.has(mirrorId) || parentUpdates.has(mirrorId)) continue;
            if (!canAssignParentToActuator(mirrorId, mirrorTargetId, byId)) continue;
            parentUpdates.set(mirrorId, mirrorTargetId);
          }
        }
      }

      if (parentUpdates.size === 0) return previous;
      const nextActuators = previous.actuators.map((actuator) => {
        const nextParentId = parentUpdates.get(actuator.id);
        if (nextParentId === undefined || actuator.parentId === nextParentId) return actuator;
        return {
          ...actuator,
          parentId: nextParentId,
        };
      });
      return {
        ...previous,
        actuators: nextActuators,
      };
    });
  }

  function parentCurrentSelectionToActiveActuator() {
    if (!workflowAllowsRigAuthoring || appMode !== "Rig" || physicsEnabled) return;
    if (selectedActuatorId === null) return;
    const sourceIds = selectedActuatorIds.filter((id) => id !== selectedActuatorId);
    if (sourceIds.length === 0) return;
    reparentSourceActuatorsToTarget(sourceIds, selectedActuatorId);
  }

  function clearSelection() {
    setSelectedMeshSourceId(null);
    setSelection([], null);
  }

  function applyMirroredEditOps(
    baseActuators: ActuatorEntity[],
    nextActuators: ActuatorEntity[],
    sourceIds: Set<string>,
    primaryId: string | null,
  ): ActuatorEntity[] {
    if (!drawMirrorEnabled || sourceIds.size === 0) return nextActuators;
    const nextById = new Map(nextActuators.map((actuator) => [actuator.id, actuator]));
    const baseById = new Map(baseActuators.map((actuator) => [actuator.id, actuator]));
    const processedPairKeys = new Set<string>();
    const updates = new Map<string, ActuatorEntity>();
    for (const sourceId of sourceIds) {
      const source = nextById.get(sourceId);
      if (source === undefined) continue;
      const counterpartId = resolveMirroredCounterpartId(sourceId, baseActuators);
      if (counterpartId === null) continue;
      if (counterpartId === sourceId) continue;

      const pairKey = sourceId.localeCompare(counterpartId) <= 0 ? `${sourceId}|${counterpartId}` : `${counterpartId}|${sourceId}`;
      if (processedPairKeys.has(pairKey)) continue;
      processedPairKeys.add(pairKey);

      const counterpartInSourceSet = sourceIds.has(counterpartId);
      let driverId = sourceId;
      if (counterpartInSourceSet) {
        if (primaryId === sourceId || primaryId === counterpartId) {
          driverId = primaryId;
        } else {
          const sourceBase = baseById.get(sourceId);
          const counterpartBase = baseById.get(counterpartId);
          if (sourceBase !== undefined && counterpartBase !== undefined) {
            const sourceX = getActuatorPrimitiveCenter(sourceBase).x;
            const counterpartX = getActuatorPrimitiveCenter(counterpartBase).x;
            driverId = sourceX >= counterpartX ? sourceId : counterpartId;
          } else {
            driverId = sourceId.localeCompare(counterpartId) <= 0 ? sourceId : counterpartId;
          }
        }
      }

      const targetId = driverId === sourceId ? counterpartId : sourceId;
      const driver = nextById.get(driverId);
      const target = nextById.get(targetId);
      if (driver === undefined || target === undefined) continue;
      updates.set(targetId, {
        ...target,
        pivot: {
          ...target.pivot,
          offset: {
            x: -driver.pivot.offset.x,
            y: driver.pivot.offset.y,
            z: driver.pivot.offset.z,
          },
        },
        size: { ...driver.size },
        transform: mirrorTransformAcrossX(driver.transform),
      });
    }
    if (updates.size === 0) return nextActuators;
    return nextActuators.map((actuator) => updates.get(actuator.id) ?? actuator);
  }

  function undo() {
    if (appMode === "Pose" || pendingPoseRevision !== null) {
      requestAppMode("Rig");
      return;
    }
    const snapshot = undoStackRef.current.pop();
    if (snapshot === undefined) return;
    redoStackRef.current.push({
      editorState: cloneEditorState(editorState),
      importedMeshes: cloneImportedMeshes(importedMeshes),
    });
    setEditorState(snapshot.editorState);
    setImportedMeshes(snapshot.importedMeshes);
    if (
      selectedMeshSourceId !== null &&
      !snapshot.importedMeshes.some((m) => m.id === selectedMeshSourceId)
    ) {
      setSelectedMeshSourceId(null);
    }
  }

  function redo() {
    const snapshot = redoStackRef.current.pop();
    if (snapshot === undefined) return;
    undoStackRef.current.push({
      editorState: cloneEditorState(editorState),
      importedMeshes: cloneImportedMeshes(importedMeshes),
    });
    setEditorState(snapshot.editorState);
    setImportedMeshes(snapshot.importedMeshes);
    if (
      selectedMeshSourceId !== null &&
      !snapshot.importedMeshes.some((m) => m.id === selectedMeshSourceId)
    ) {
      setSelectedMeshSourceId(null);
    }
  }

  function applyTransformChange(
    id: string,
    worldDelta: Matrix4,
    localDelta: Matrix4,
    worldOffset: Vec3,
    options?: { includeDescendants?: boolean },
  ) {
    const baseState = transformStartSnapshotRef.current ?? editorStateRef.current;
    const moved = baseState.actuators.find((actuator) => actuator.id === id);
    if (moved === undefined) return;

    const byId = new Map(baseState.actuators.map((actuator) => [actuator.id, actuator]));
    const childrenByParent = new Map<string, string[]>();
    for (const actuator of baseState.actuators) {
      if (actuator.parentId === null) continue;
      const siblings = childrenByParent.get(actuator.parentId) ?? [];
      siblings.push(actuator.id);
      childrenByParent.set(actuator.parentId, siblings);
    }
    for (const [parentId, children] of childrenByParent.entries()) {
      children.sort((a, b) => a.localeCompare(b));
      childrenByParent.set(parentId, children);
    }

    const worldMatrixById = new Map<string, Matrix4>();
    for (const actuator of baseState.actuators) {
      worldMatrixById.set(
        actuator.id,
        composeMatrix(actuator.transform.position, actuator.transform.rotation, actuator.transform.scale),
      );
    }

    function depthOf(actuatorId: string): number {
      let depth = 0;
      let current = byId.get(actuatorId);
      while (current !== undefined && current.parentId !== null) {
        depth += 1;
        current = byId.get(current.parentId);
      }
      return depth;
    }

    function applyDeltaToDescendants(parentId: string, delta: Matrix4, touchedIds: Set<string>) {
      const children = childrenByParent.get(parentId) ?? [];
      for (const childId of children) {
        const original = worldMatrixById.get(childId);
        if (original !== undefined) {
          worldMatrixById.set(childId, delta.clone().multiply(original));
          touchedIds.add(childId);
        }
        applyDeltaToDescendants(childId, delta, touchedIds);
      }
    }

    const selectedOrdered = [...new Set(baseState.selectedActuatorIds)]
      .filter((selectedId) => byId.has(selectedId))
      .sort((a, b) => {
        const da = depthOf(a);
        const db = depthOf(b);
        if (da !== db) return da - db;
        return a.localeCompare(b);
      });

    const deltaPosition = new Vector3();
    const deltaRotation = new Quaternion();
    const deltaScale = new Vector3();
    localDelta.decompose(deltaPosition, deltaRotation, deltaScale);
    const selectedSet = new Set(selectedOrdered);

    if (gizmoMode === "scale") {
      const nextActuators = baseState.actuators.map((actuator) => {
        if (!selectedSet.has(actuator.id)) return actuator;
        return {
          ...actuator,
          size: scalePrimitiveSizeFromGizmoDelta(
            actuator.size,
            {
              x: deltaScale.x,
              y: deltaScale.y,
              z: deltaScale.z,
            },
            actuator.shape,
          ),
          transform: {
            ...actuator.transform,
            scale: { x: 1, y: 1, z: 1 },
          },
        };
      });
      const mirroredActuators = applyMirroredEditOps(
        baseState.actuators,
        nextActuators,
        selectedSet,
        baseState.selectedActuatorId,
      );

      setEditorState((previous) => ({
        ...previous,
        actuators: mirroredActuators,
      }));
      return;
    }

    void worldDelta;
    const includeDescendants = options?.includeDescendants ?? true;
    const worldTranslateDelta = new Vector3(worldOffset.x, worldOffset.y, worldOffset.z);
    const transformedSourceIds = new Set<string>();

    for (const selectedId of selectedOrdered) {
      const original = worldMatrixById.get(selectedId);
      if (original === undefined) continue;
      transformedSourceIds.add(selectedId);

      const originalPosition = new Vector3();
      const originalRotation = new Quaternion();
      const originalScale = new Vector3();
      original.decompose(originalPosition, originalRotation, originalScale);

      const nextPosition = originalPosition.clone();
      const nextRotation = originalRotation.clone();
      const nextScale = originalScale.clone();

      if (gizmoMode === "translate") {
        nextPosition.add(worldTranslateDelta);
      } else if (gizmoMode === "rotate") {
        nextRotation.multiply(deltaRotation);
      }

      const targetMatrix = new Matrix4().compose(nextPosition, nextRotation, nextScale);
      worldMatrixById.set(selectedId, targetMatrix);
      const subtreeDelta = targetMatrix.clone().multiply(original.clone().invert());
      if (includeDescendants) {
        applyDeltaToDescendants(selectedId, subtreeDelta, transformedSourceIds);
      }
    }

    const nextActuators = baseState.actuators.map((actuator) => {
      const nextMatrix = worldMatrixById.get(actuator.id);
      if (nextMatrix === undefined) return actuator;

      const nextPosition = new Vector3();
      const nextRotation = new Quaternion();
      const nextScale = new Vector3();
      nextMatrix.decompose(nextPosition, nextRotation, nextScale);

      return {
        ...actuator,
        transform: {
          ...actuator.transform,
          position: { x: nextPosition.x, y: nextPosition.y, z: nextPosition.z },
          rotation: { x: nextRotation.x, y: nextRotation.y, z: nextRotation.z, w: nextRotation.w },
          scale: normalizePositiveScale({
            x: nextScale.x,
            y: nextScale.y,
            z: nextScale.z,
          }),
        },
      };
    });
    const mirroredActuators = applyMirroredEditOps(
      baseState.actuators,
      nextActuators,
      transformedSourceIds,
      baseState.selectedActuatorId,
    );

    setEditorState((previous) => ({
      ...previous,
      actuators: mirroredActuators,
    }));
  }

  function beginTransformChange() {
    if (transformStartSnapshotRef.current !== null) return;
    transformStartSnapshotRef.current = cloneEditorState(editorStateRef.current);
    marqueeDragRef.current = null;
    setMarqueeRect(null);
    setIsTransformDragging(true);
  }

  function endTransformChange() {
    suppressClearSelectionUntilRef.current = Date.now() + 220;
    setIsTransformDragging(false);
    const startSnapshot = transformStartSnapshotRef.current;
    transformStartSnapshotRef.current = null;
    if (startSnapshot === null) return;

    setEditorState((current) => {
      const changed = JSON.stringify(startSnapshot.actuators) !== JSON.stringify(current.actuators);
      if (!changed) return current;
      undoStackRef.current.push({
        editorState: startSnapshot,
        importedMeshes: cloneImportedMeshes(importedMeshesRef.current),
      });
      redoStackRef.current = [];
      return current;
    });
  }

  function applyClipAtTime(clip: SyntheticClip, timeSec: number) {
    const samples = evaluateClipAtTime(clip, timeSec);
    setEditorState((previous) => ({
      ...previous,
      actuators: previous.actuators.map((actuator) => {
        const sample = samples.get(actuator.id);
        if (sample === undefined) return actuator;
        return {
          ...actuator,
          transform: {
            ...actuator.transform,
            position: { ...sample.position },
            rotation: { ...sample.rotation },
            scale: normalizePositiveScale(sample.scale),
          },
        };
      }),
    }));
  }

  function onPlaybackStep(deltaSec: number) {
    if (syntheticClip === null) return;
    const clock = playbackClockRef.current;
    if (clock === null || !clock.isPlaying()) return;

    const steppedTimes = clock.tick(deltaSec);
    for (const timeSec of steppedTimes) {
      applyClipAtTime(syntheticClip, timeSec);
    }

  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (isPrimaryModifier) {
        if (key === "z" && event.shiftKey) {
          event.preventDefault();
          redo();
          return;
        }
        if (key === "z") {
          event.preventDefault();
          undo();
          return;
        }
        if (key === "y") {
          event.preventDefault();
          redo();
          return;
        }
      }

      if (isTypingTarget(event.target)) return;


      if (event.code === "Space") {
        event.preventDefault();
        if (physicsEnabled) {
          requestAppMode("Rig");
        } else {
          requestAppMode("Pose");
        }
        return;
      }

      if (event.code === "Delete") {
        event.preventDefault();
        deleteSelectedActuator();
        return;
      }

      if (key === "p" && workflowAllowsRigAuthoring && appMode === "Rig" && !physicsEnabled) {
        event.preventDefault();
        parentCurrentSelectionToActiveActuator();
        return;
      }

      if (appMode === "Pose") {
        if (key === "w" || key === "q" || key === "e" || key === "r" || key === "d") {
          setGizmoMode(POSE_TOOL_MODE);
        }
      } else {
        if (key === "q" && isToolAllowedForWorkflow(workflowMode, "select")) setGizmoMode("select");
        if (key === "w" && isToolAllowedForWorkflow(workflowMode, "translate")) setGizmoMode("translate");
        if (key === "e" && isToolAllowedForWorkflow(workflowMode, "rotate")) setGizmoMode("rotate");
        if (key === "r" && isToolAllowedForWorkflow(workflowMode, "scale")) setGizmoMode("scale");
        if (key === "d" && isToolAllowedForWorkflow(workflowMode, "draw")) setGizmoMode("draw");
      }
      if (key === "f") {
        const idsToFrame =
          selectedActuatorIds.length > 0
            ? selectedActuatorIds
            : actuators.filter((actuator) => actuator.rigId === selectedRigId).map((actuator) => actuator.id);
        const request = buildFocusRequestFromActuators(actuators, idsToFrame);
        if (request === null) return;
        setFocusRequest(request);
        setFocusNonce((value) => value + 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    actuators,
    appMode,
    pendingPoseRevision,
    physicsEnabled,
    requestAppMode,
    selectedActuatorId,
    selectedActuatorIds,
    selectedRigId,
    skinningRevision,
    workflowAllowsRigAuthoring,
    workflowMode,
  ]);

  useEffect(() => {
    if (outlinerParentDragSourceId === null) return;
    const clearDrag = () => {
      setOutlinerParentDragSourceId(null);
      setOutlinerParentDropTargetId(null);
    };
    window.addEventListener("pointerup", clearDrag);
    window.addEventListener("pointercancel", clearDrag);
    window.addEventListener("blur", clearDrag);
    return () => {
      window.removeEventListener("pointerup", clearDrag);
      window.removeEventListener("pointercancel", clearDrag);
      window.removeEventListener("blur", clearDrag);
    };
  }, [outlinerParentDragSourceId]);

  useEffect(() => {
    if (gizmoMode === "draw" && appMode === "Rig" && workflowAllowsDraw && !physicsEnabled) {
      if (isTransformDragging || transformStartSnapshotRef.current !== null) {
        endTransformChange();
      }
      clearSelection();
      return;
    }
    drawSessionRef.current = null;
    setDrawDraftActuators([]);
    setDrawCursor((previous) => ({ ...previous, visible: false }));
    setDrawCursorHasInRangeAnchor(false);
    setDrawHoverActuatorId(null);
  }, [appMode, gizmoMode, isTransformDragging, physicsEnabled, workflowAllowsDraw]);

  function onCanvasPointerMissed() {
    if (gizmoMode === "draw") return;
    if (appMode === "Pose") return; // keep selection when releasing grab
    if (Date.now() < suppressClearSelectionUntilRef.current) return;
    if (marqueeDragRef.current !== null) return;
    if (isTransformDragging) return;
    clearSelection();
  }

  function clientToCanvasLocal(clientX: number, clientY: number): { x: number; y: number; width: number; height: number } | null {
    const wrap = canvasWrapRef.current;
    if (wrap === null) return null;
    const rect = wrap.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function isPointerInsideCanvas(clientX: number, clientY: number): boolean {
    const local = clientToCanvasLocal(clientX, clientY);
    if (local === null) return false;
    return local.x >= 0 && local.y >= 0 && local.x <= local.width && local.y <= local.height;
  }

  function getActuatorScreenRect(actuator: ActuatorEntity): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const cameraObject = cameraRef.current;
    const wrap = canvasWrapRef.current;
    const object = actuatorObjectRefs.current[actuator.id];
    if (cameraObject === null || wrap === null || object === null || object === undefined) return null;

    const bounds = new Box3().setFromObject(object);
    const boundsMin = bounds.min;
    const boundsMax = bounds.max;
    const corners = [
      new Vector3(boundsMin.x, boundsMin.y, boundsMin.z),
      new Vector3(boundsMin.x, boundsMin.y, boundsMax.z),
      new Vector3(boundsMin.x, boundsMax.y, boundsMin.z),
      new Vector3(boundsMin.x, boundsMax.y, boundsMax.z),
      new Vector3(boundsMax.x, boundsMin.y, boundsMin.z),
      new Vector3(boundsMax.x, boundsMin.y, boundsMax.z),
      new Vector3(boundsMax.x, boundsMax.y, boundsMin.z),
      new Vector3(boundsMax.x, boundsMax.y, boundsMax.z),
    ];

    let projectedMinX = Number.POSITIVE_INFINITY;
    let projectedMinY = Number.POSITIVE_INFINITY;
    let projectedMaxX = Number.NEGATIVE_INFINITY;
    let projectedMaxY = Number.NEGATIVE_INFINITY;
    let hasVisibleCorner = false;
    for (const corner of corners) {
      corner.project(cameraObject);
      if (corner.z < -1 || corner.z > 1) continue;
      hasVisibleCorner = true;
      const px = (corner.x * 0.5 + 0.5) * wrap.clientWidth;
      const py = (-corner.y * 0.5 + 0.5) * wrap.clientHeight;
      projectedMinX = Math.min(projectedMinX, px);
      projectedMinY = Math.min(projectedMinY, py);
      projectedMaxX = Math.max(projectedMaxX, px);
      projectedMaxY = Math.max(projectedMaxY, py);
    }
    if (!hasVisibleCorner) return null;
    return { minX: projectedMinX, minY: projectedMinY, maxX: projectedMaxX, maxY: projectedMaxY };
  }

  function resolveDrawParentActuator(
    clientX: number,
    clientY: number,
    localX: number,
    localY: number,
  ): { actuator: ActuatorEntity; center: Vec3; radiusPx: number } | null {
    const directHit = getActuatorHitAtPointer(clientX, clientY);
    if (directHit !== null) {
      const center = getActuatorPrimitiveCenter(directHit);
      const centerPoint = { x: center.x, y: center.y, z: center.z };
      return {
        actuator: directHit,
        center: centerPoint,
        radiusPx: computePixelsForWorldRadiusAtPoint(drawRadius, centerPoint),
      };
    }

    const candidates = appMode === "Rig" ? actuators.filter((actuator) => actuator.rigId === selectedRigId) : actuators;
    let best: { actuator: ActuatorEntity; center: Vec3; radiusPx: number; distanceSq: number } | null = null;
    for (const candidate of candidates) {
      const rect = getActuatorScreenRect(candidate);
      if (rect === null) continue;
      const closestX = Math.max(rect.minX, Math.min(localX, rect.maxX));
      const closestY = Math.max(rect.minY, Math.min(localY, rect.maxY));
      const dx = localX - closestX;
      const dy = localY - closestY;
      const distanceSq = dx * dx + dy * dy;
      const center = getActuatorPrimitiveCenter(candidate);
      const centerPoint = { x: center.x, y: center.y, z: center.z };
      // Keep hover/capture radius tighter than the visual cursor radius for better desktop precision.
      const hitRadiusPx = computePixelsForWorldRadiusAtPoint(drawRadius * 0.5, centerPoint);
      const radiusPx = computePixelsForWorldRadiusAtPoint(drawRadius, centerPoint);
      if (distanceSq > hitRadiusPx * hitRadiusPx) continue;
      if (best === null || distanceSq < best.distanceSq) {
        best = { actuator: candidate, center: centerPoint, radiusPx, distanceSq };
      }
    }
    if (best === null) return null;
    return { actuator: best.actuator, center: best.center, radiusPx: best.radiusPx };
  }


  function collectMarqueeHits(rect: { x: number; y: number; width: number; height: number }): string[] {
    const cameraObject = cameraRef.current;
    if (cameraObject === null) return [];
    const wrap = canvasWrapRef.current;
    if (wrap === null) return [];

    const minX = Math.min(rect.x, rect.x + rect.width);
    const minY = Math.min(rect.y, rect.y + rect.height);
    const maxX = Math.max(rect.x, rect.x + rect.width);
    const maxY = Math.max(rect.y, rect.y + rect.height);

    const hits: string[] = [];
    const candidates =
      appMode === "Rig" ? actuators.filter((actuator) => actuator.rigId === selectedRigId) : actuators;

    for (const actuator of candidates) {
      const object = actuatorObjectRefs.current[actuator.id];
      if (object === null || object === undefined) continue;

      const bounds = new Box3().setFromObject(object);
      const boundsMin = bounds.min;
      const boundsMax = bounds.max;

      const corners = [
        new Vector3(boundsMin.x, boundsMin.y, boundsMin.z),
        new Vector3(boundsMin.x, boundsMin.y, boundsMax.z),
        new Vector3(boundsMin.x, boundsMax.y, boundsMin.z),
        new Vector3(boundsMin.x, boundsMax.y, boundsMax.z),
        new Vector3(boundsMax.x, boundsMin.y, boundsMin.z),
        new Vector3(boundsMax.x, boundsMin.y, boundsMax.z),
        new Vector3(boundsMax.x, boundsMax.y, boundsMin.z),
        new Vector3(boundsMax.x, boundsMax.y, boundsMax.z),
      ];

      let projectedMinX = Number.POSITIVE_INFINITY;
      let projectedMinY = Number.POSITIVE_INFINITY;
      let projectedMaxX = Number.NEGATIVE_INFINITY;
      let projectedMaxY = Number.NEGATIVE_INFINITY;
      let hasVisibleCorner = false;

      for (const corner of corners) {
        corner.project(cameraObject);
        if (corner.z < -1 || corner.z > 1) continue;
        hasVisibleCorner = true;
        const px = (corner.x * 0.5 + 0.5) * wrap.clientWidth;
        const py = (-corner.y * 0.5 + 0.5) * wrap.clientHeight;
        projectedMinX = Math.min(projectedMinX, px);
        projectedMinY = Math.min(projectedMinY, py);
        projectedMaxX = Math.max(projectedMaxX, px);
        projectedMaxY = Math.max(projectedMaxY, py);
      }

      if (!hasVisibleCorner) continue;
      const intersects =
        projectedMaxX >= minX &&
        projectedMinX <= maxX &&
        projectedMaxY >= minY &&
        projectedMinY <= maxY;

      if (intersects) {
        hits.push(actuator.id);
      }
    }

    return hits;
  }

  function hasActuatorHit(clientX: number, clientY: number): boolean {
    const wrap = canvasWrapRef.current;
    const camera = cameraRef.current;
    if (wrap === null || camera === null) return false;

    const rect = wrap.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pointerNdcRef.current.set(x, y);
    raycasterRef.current.setFromCamera(pointerNdcRef.current, camera);

    const objects = actuators
      .map((actuator) => actuatorObjectRefs.current[actuator.id])
      .filter((object): object is Object3D => object !== null && object !== undefined);
    return raycasterRef.current.intersectObjects(objects, false).length > 0;
  }

  function onCanvasWrapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const local = clientToCanvasLocal(event.clientX, event.clientY);
    if (event.button !== 0) return;
    if (event.altKey) return;
    if (gizmoMode !== "select") return;
    if (isTransformDragging) return;
    if (hasActuatorHit(event.clientX, event.clientY)) return;
    if (local === null) return;

    marqueeDragRef.current = {
      pointerId: event.pointerId,
      startX: local.x,
      startY: local.y,
      moved: false,
      additive: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    };

    setMarqueeRect({ x: local.x, y: local.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onCanvasWrapPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (gizmoMode !== "select") return;
    const local = clientToCanvasLocal(event.clientX, event.clientY);
    const drag = marqueeDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;

    if (local === null) return;

    const width = local.x - drag.startX;
    const height = local.y - drag.startY;
    if (!drag.moved && Math.hypot(width, height) > 4) {
      drag.moved = true;
    }
    setMarqueeRect({ x: drag.startX, y: drag.startY, width, height });
  }

  function onCanvasWrapPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (gizmoMode !== "select") return;
    const drag = marqueeDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const local = clientToCanvasLocal(event.clientX, event.clientY);
    const completedRect =
      local === null
        ? null
        : {
            x: drag.startX,
            y: drag.startY,
            width: local.x - drag.startX,
            height: local.y - drag.startY,
          };
    const wasMoved = drag.moved;
    marqueeDragRef.current = null;
    setMarqueeRect(null);

    if (!wasMoved) {
      const hitActuator = hasActuatorHit(event.clientX, event.clientY);
      const hasModifier = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!hitActuator && !hasModifier && !isTransformDragging) {
        clearSelection();
      }
      return;
    }
    if (completedRect === null) return;

    const hits = collectMarqueeHits(completedRect);
    if (drag.additive) {
      setSelection([...selectedActuatorIds, ...hits], selectedActuatorId);
      return;
    }
    if (drag.toggle) {
      const next = new Set(selectedActuatorIds);
      for (const id of hits) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      setSelection([...next], selectedActuatorId);
      return;
    }
    if (hits.length === 0) {
      clearSelection();
      return;
    }
    const primary = selectedActuatorId !== null && hits.includes(selectedActuatorId) ? selectedActuatorId : hits[0];
    setSelection(hits, primary);
  }

  function onCanvasWrapDragOver(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function onCanvasWrapDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    importMeshFiles(files);
  }

  useEffect(() => {
    let frame = 0;
    const updateDrawCursorPerFrame = () => {
      if (gizmoMode === "draw" && appMode === "Rig" && workflowAllowsDraw && !physicsEnabled && drawCursor.visible) {
        const pointer = drawPointerClientRef.current;
        if (pointer !== null) {
          const local = clientToCanvasLocal(pointer.x, pointer.y);
          if (local !== null) {
            const resolved = resolveDrawParentActuator(pointer.x, pointer.y, local.x, local.y);
            if (resolved !== null) {
              drawCursorAnchorPointRef.current = resolved.center;
              setDrawHoverActuatorId((previous) => (previous === resolved.actuator.id ? previous : resolved.actuator.id));
              setDrawCursorHasInRangeAnchor((previous) => (previous ? previous : true));
              setDrawCursorRadiusPx((prev) => (Math.abs(prev - resolved.radiusPx) > 0.2 ? resolved.radiusPx : prev));
            } else {
              drawCursorAnchorPointRef.current = null;
              setDrawHoverActuatorId((previous) => (previous === null ? previous : null));
              setDrawCursorHasInRangeAnchor((previous) => (previous ? false : previous));
            }
          } else {
            drawCursorAnchorPointRef.current = null;
            setDrawHoverActuatorId((previous) => (previous === null ? previous : null));
            setDrawCursorHasInRangeAnchor((previous) => (previous ? false : previous));
          }
        } else {
          drawCursorAnchorPointRef.current = null;
          setDrawHoverActuatorId((previous) => (previous === null ? previous : null));
          setDrawCursorHasInRangeAnchor((previous) => (previous ? false : previous));
        }
      }
      frame = requestAnimationFrame(updateDrawCursorPerFrame);
    };
    frame = requestAnimationFrame(updateDrawCursorPerFrame);
    return () => cancelAnimationFrame(frame);
  }, [actuators, appMode, drawCursor.visible, drawRadius, gizmoMode, physicsEnabled, selectedRigId, workflowAllowsDraw]);

  useEffect(() => {
    if (gizmoMode !== "draw") {
      if (drawInteractionState !== "Idle") setDrawInteractionState("Idle");
      return;
    }
    if (drawInteractionState !== "OnRelease") return;
    const timer = window.setTimeout(() => {
      setDrawInteractionState("Idle");
    }, 120);
    return () => window.clearTimeout(timer);
  }, [drawInteractionState, gizmoMode]);


  function createActuatorFromXrDraw(handedness: XRHandedness): boolean {
    if (!workflowAllowsRigAuthoring || appMode !== "Rig" || physicsEnabled) return false;
    const pose = getXrControllerTipPose(handedness);
    if (pose === null) return false;

    const parent = resolveNearestActuatorAtWorldPoint(pose.position, {
      rigId: selectedRigId,
      maxDistance: Math.max(0.45, drawRadius * 3),
    });
    if (parent === null) return false;

    const startCandidate = drawSnapEnabled ? snapPointToMirrorCenterline(pose.position) : pose.position;
    const start = projectPointToActuatorCenterAxis(startCandidate, parent);
    const endCandidate = {
      x: start.x + pose.forward.x * Math.max(0.16, drawRadius * 2),
      y: start.y + pose.forward.y * Math.max(0.16, drawRadius * 2),
      z: start.z + pose.forward.z * Math.max(0.16, drawRadius * 2),
    };
    const endSnapped = drawSnapEnabled ? snapPointToMirrorCenterline(endCandidate) : endCandidate;
    const end = projectPointToActuatorCenterAxis(endSnapped, parent);

    let mirrorSpawn = shouldSpawnMirrored(start, drawMirrorEnabled);
    const mirrorParentId = mirrorSpawn ? resolveDrawMirrorParentId(parent.id, actuators) : null;
    if (mirrorSpawn && mirrorParentId === null) {
      mirrorSpawn = false;
    }

    const draftActuators = buildDrawDraftActuators(
      start,
      end,
      drawRadius,
      parent.rigId,
      parent.id,
      mirrorParentId,
      mirrorSpawn,
      newActuatorPreset,
    );
    if (draftActuators.length === 0) return false;

    setDrawInteractionState("OnRelease");
    commitDrawDraftActuators(parent.rigId, draftActuators);
    return true;
  }

  function selectNearestActuatorFromXr(handedness: XRHandedness, toggle: boolean): boolean {
    const pose = getXrControllerTipPose(handedness);
    if (pose === null) return false;

    const target = resolveNearestActuatorAtWorldPoint(pose.position, {
      rigId: selectedRigId,
      maxDistance: Math.max(0.18, drawRadius * 1.25),
    });
    if (target === null) {
      if (!toggle && appMode !== "Pose") {
        clearSelection();
      }
      return false;
    }

    selectActuator(target.id, toggle ? { toggle: true } : undefined);
    return true;
  }

  const onInputAction = useCallback((action: InputAction) => {
    if (action.source.provider === "xr") {
      const nextXrHandInputs = updateXrHandInputStateFromAction(xrHandInputsRef.current, action);
      if (nextXrHandInputs !== xrHandInputsRef.current) {
        xrHandInputsRef.current = nextXrHandInputs;
        setXrHandInputs(nextXrHandInputs);
      }
      if (xrMode !== "immersive-vr") return;

      const resolvedXrToolState = resolveXrToolState({
        appMode,
        physicsEnabled,
        handInputs: nextXrHandInputs,
      });
      const triggerIntent = resolveXrTriggerIntent(action, resolvedXrToolState);
      if (triggerIntent.handedness === null || triggerIntent.intent === "none") return;

      if (triggerIntent.intent === "draw") {
        createActuatorFromXrDraw(triggerIntent.handedness);
      } else if (triggerIntent.intent === "select") {
        selectNearestActuatorFromXr(triggerIntent.handedness, triggerIntent.toggleSelection);
      }
      return;
    }

    if (gizmoMode !== "draw" || appMode !== "Rig" || !workflowAllowsDraw || physicsEnabled) {
      return;
    }

    const pointer = action.pointer;
    const pointerInsideCanvas =
      pointer === null ? false : isPointerInsideCanvas(pointer.clientX, pointer.clientY);

    if (pointer !== null) {
      drawPointerClientRef.current = { x: pointer.clientX, y: pointer.clientY };
      drawPointerButtonsRef.current = pointer.buttons;
      setDrawCursor({ x: pointer.localX, y: pointer.localY, visible: pointerInsideCanvas });
    } else {
      setDrawHoverActuatorId(null);
      setDrawCursorHasInRangeAnchor(false);
      setDrawCursor((previous) => (previous.visible ? { ...previous, visible: false } : previous));
    }

    if (action.phase !== "OnRelease" && !pointerInsideCanvas && drawSessionRef.current === null) {
      return;
    }

    if (action.phase === "OnMove") {
      if (pointerInsideCanvas && pointer !== null) {
        const resolved = resolveDrawParentActuator(pointer.clientX, pointer.clientY, pointer.localX, pointer.localY);
        if (resolved !== null) {
          drawCursorAnchorPointRef.current = resolved.center;
          setDrawHoverActuatorId((previous) => (previous === resolved.actuator.id ? previous : resolved.actuator.id));
          setDrawCursorHasInRangeAnchor((previous) => (previous ? previous : true));
          setDrawCursorRadiusPx((prev) => (Math.abs(prev - resolved.radiusPx) > 0.2 ? resolved.radiusPx : prev));
        } else {
          drawCursorAnchorPointRef.current = null;
          setDrawHoverActuatorId((previous) => (previous === null ? previous : null));
          setDrawCursorHasInRangeAnchor((previous) => (previous ? false : previous));
        }
      } else if (drawSessionRef.current === null) {
        drawCursorAnchorPointRef.current = null;
        setDrawHoverActuatorId((previous) => (previous === null ? previous : null));
        setDrawCursorHasInRangeAnchor((previous) => (previous ? false : previous));
      }

      const drawSession = drawSessionRef.current;
      const pointerHasPrimaryDown = pointer !== null && (pointer.buttons & 1) === 1;
      if (drawSession !== null && pointer !== null && pointerHasPrimaryDown && !action.modifiers.altKey) {
        const dragPoint = computeDrawDragPointFromScreen(drawSession, pointer.clientX, pointer.clientY);
        if (dragPoint !== null) {
          setDrawInteractionState("OnDrag");
          const end = drawSnapEnabled ? snapPointToMirrorCenterline(dragPoint) : dragPoint;
          applyDrawDraftFromSession(drawSession, end, drawSession.worldRadius);
        }
      }
      return;
    }

    if (action.phase === "OnWheel") {
      if (action.control.kind !== "axis1") return;
      if (!action.modifiers.shiftKey) return;
      const wheelDelta = action.control.value;
      setDrawRadius((current) => {
        const next = adjustDrawRadiusFromWheel(current, wheelDelta);
        const drawSession = drawSessionRef.current;
        if (drawSession !== null) {
          applyDrawDraftFromSession(drawSession, drawSession.endPoint, next);
        }
        return next;
      });
      return;
    }

    if (action.phase === "OnPress") {
      if (pointer === null || !pointerInsideCanvas) return;
      if (action.modifiers.altKey) return;
      if (pointer.button !== 0) return;
      if (action.control.kind !== "button" || !action.control.pressed) return;

      const resolvedParent = resolveDrawParentActuator(pointer.clientX, pointer.clientY, pointer.localX, pointer.localY);
      if (resolvedParent === null) return;
      setDrawInteractionState("OnPress");
      const parent = resolvedParent.actuator;
      const parentCenter = resolvedParent.center;
      drawCursorAnchorPointRef.current = parentCenter;
      setDrawHoverActuatorId((previous) => (previous === parent.id ? previous : parent.id));
      setDrawCursorHasInRangeAnchor(true);
      setDrawCursorRadiusPx((prev) => (Math.abs(prev - resolvedParent.radiusPx) > 0.2 ? resolvedParent.radiusPx : prev));

      const camera = cameraRef.current as any;
      const parentNdc = new Vector3(parentCenter.x, parentCenter.y, parentCenter.z).project(camera);
      const rect = (canvasWrapRef.current as HTMLDivElement).getBoundingClientRect();
      const startNdcX = ((pointer.clientX - rect.left) / rect.width) * 2 - 1;
      const startNdcY = -((pointer.clientY - rect.top) / rect.height) * 2 + 1;
      const startWorld = new Vector3(startNdcX, startNdcY, parentNdc.z).unproject(camera);
      const startCandidate = drawSnapEnabled
        ? snapPointToMirrorCenterline({ x: startWorld.x, y: startWorld.y, z: parentCenter.z })
        : { x: startWorld.x, y: startWorld.y, z: parentCenter.z };
      const snappedMidpoint = drawSnapEnabled
        ? computeDrawSnapMidpointInActuator(pointer.clientX, pointer.clientY, parent)
        : null;
      const start =
        snappedMidpoint ?? projectPointToActuatorCenterAxis(startCandidate, parent);
      let mirrorSpawn = shouldSpawnMirrored(start, drawMirrorEnabled);
      const mirrorParentId = mirrorSpawn ? resolveDrawMirrorParentId(parent.id, actuators) : null;
      if (mirrorSpawn && mirrorParentId === null) {
        mirrorSpawn = false;
      }
      setDrawDraftActuators(
        buildDrawDraftActuators(start, start, drawRadius, parent.rigId, parent.id, mirrorParentId, mirrorSpawn, newActuatorPreset),
      );
      drawSessionRef.current = {
        pointerId: pointer.pointerId,
        startPoint: start,
        endPoint: start,
        worldRadius: drawRadius,
        screenStartX: pointer.localX,
        screenStartY: pointer.localY,
        startNdcZ: parentNdc.z,
        parentId: parent.id,
        mirrorParentId,
        rigId: parent.rigId,
        mirrorSpawn,
        preset: newActuatorPreset,
      };
      return;
    }

    if (action.phase === "OnDrag") {
      if (pointer === null) return;
      if (action.modifiers.altKey) return;
      const drawSession = drawSessionRef.current;
      if (drawSession === null) return;
      setDrawInteractionState("OnDrag");
      const dragPoint = computeDrawDragPointFromScreen(drawSession, pointer.clientX, pointer.clientY);
      if (dragPoint === null) return;
      const end = drawSnapEnabled ? snapPointToMirrorCenterline(dragPoint) : dragPoint;
      applyDrawDraftFromSession(drawSession, end, drawSession.worldRadius);
      return;
    }

    if (action.phase === "OnRelease") {
      setDrawInteractionState("OnRelease");
      const drawSession = drawSessionRef.current;
      if (drawSession !== null) {
        flushSync(() => {
          commitDrawSession(drawSession);
          setDrawDraftActuators([]);
        });
      } else {
        setDrawDraftActuators([]);
      }
      drawSessionRef.current = null;
    }
  }, [
    actuators,
    appMode,
    createActuatorFromXrDraw,
    drawMirrorEnabled,
    drawRadius,
    drawSnapEnabled,
    gizmoMode,
    newActuatorPreset,
    physicsEnabled,
    selectedRigId,
    selectNearestActuatorFromXr,
    workflowAllowsDraw,
    xrMode,
  ]);

  useInputRouter({
    targetRef: canvasWrapRef,
    enabled: (gizmoMode === "draw" && appMode === "Rig" && workflowAllowsDraw && !physicsEnabled) || xrMode !== null,
    getXRSession: () => {
      const storeAny = xrStore as any;
      const state = storeAny.getState?.();
      return state?.session ?? null;
    },
    providers: {
      desktop: true,
      touch: true,
      xr: true,
    },
    onAction: onInputAction,
  });

  const editorContextValue = useMemo(
    () => ({
      state: {
        editorState,
        workflowMode,
        selectedActuatorIds,
      },
    }),
    [editorState, workflowMode, selectedActuatorIds],
  );

  const panelContextValue = useMemo(
    () => ({
      actions: {
        workflowAllowsRigAuthoring,
        physicsEnabled,
        appMode,
        actuators,
        selectedActuatorIds,
        undoStackLength: undoStackRef.current.length,
        redoStackLength: redoStackRef.current.length,
        ioStatus,
        meshImportStatus,
        sceneLoadInputRef,
        onCreateRig: createRig,
        onCreateActuator: createActuator,
        onDeleteSelected: deleteSelectedActuator,
        onUndo: undo,
        onRedo: redo,
        onSaveScene: saveSceneToFile,
        onRequestLoadScene: () => sceneLoadInputRef.current?.click(),
        onSceneFileChange: handleSceneFileInputChange,
      },
      tools: {
        appMode,
        workflowMode,
        workflowAllowsRigAuthoring,
        workflowAllowsDraw,
        gizmoMode,
        gizmoSpace,
        pivotMode,
        newActuatorShape,
        presetSelectValue,
        drawRadius,
        drawMirrorEnabled,
        drawSnapEnabled,
        deltaMushEnabled,
        deltaMushSettings,
        onSetGizmoMode: setGizmoMode,
        onSetGizmoSpace: setGizmoSpace,
        onSetPivotMode: setPivotMode,
        onSetNewActuatorShape: setNewActuatorShape,
        onPresetChange: (preset: ActuatorPreset) => {
          setNewActuatorPreset(preset);
          applyPresetToSelection(preset);
        },
        onSetDrawRadius: setDrawRadius,
        onSetDrawMirrorEnabled: setDrawMirrorEnabled,
        onSetDrawSnapEnabled: setDrawSnapEnabled,
        onSetDeltaMushEnabled: setDeltaMushEnabled,
        onSetDeltaMushSettings: setDeltaMushSettings,
      },
      sceneIO: {
        workflowMode,
        workflowAllowsAnimationLane,
        bakeStartFrame,
        bakeEndFrame,
        exportFormat,
        exportCapabilities,
        lastBakeCache,
        exportStatus,
        onBakeStartFrameChange: setBakeStartFrame,
        onBakeEndFrameChange: setBakeEndFrame,
        onCaptureBake: captureBakeFromCurrentState,
        onExportFormatChange: setExportFormat,
        onExportBake: exportCapturedBake,
      },
      outliner: {
        entries: outlinerEntries,
        selectedActuatorIds,
        selectedMeshSourceId,
        collapsedNodeIds,
        outlinerParentDragSourceId,
        outlinerParentDropTargetId,
        onToggleNode: toggleOutlinerNode,
        onBeginParentDrag: beginOutlinerParentDrag,
        onUpdateParentDropTarget: updateOutlinerParentDropTarget,
        onClearParentDropTarget: (targetId: string) => {
          if (outlinerParentDropTargetId === targetId) setOutlinerParentDropTargetId(null);
        },
        onCompleteParentDrag: completeOutlinerParentDrag,
        onSelectActuator: selectActuator,
        onSelectMesh: selectMeshSource,
      },
      status: {
        sceneId,
        workflowMode,
        selectedRigId,
        selectedActuatorId,
        selectedActuatorIds,
        skinningStats,
        lastBakeCache,
      },
      properties: {
        actuators,
        selectedActuatorIds,
        selectedMeshSourceId,
        importedMeshes,
        worldGravityY,
        onWorldGravityYChange: setWorldGravityY,
        onTransformChange: applyPropertiesTransform,
        onPhysicsOverridesChange: applyPropertiesPhysicsOverrides,
        onMeshImportSettingsChange,
      },
      sceneContent: (
        <div
          ref={canvasWrapRef}
          className="app__canvas-wrap"
          onPointerDown={onCanvasWrapPointerDown}
          onPointerMove={onCanvasWrapPointerMove}
          onPointerUp={onCanvasWrapPointerUp}
          onPointerCancel={onCanvasWrapPointerUp}
          onDragOver={onCanvasWrapDragOver}
          onDrop={onCanvasWrapDrop}
          onPointerLeave={() => {
            if (gizmoMode === "draw" && workflowAllowsDraw) {
              setDrawCursor((previous) => ({ ...previous, visible: false }));
            }
          }}
        >
          <Canvas
            camera={{ position: [2.5, 2.5, 3], fov: 50 }}
            shadows
            onCreated={({ camera }) => {
              cameraRef.current = camera;
            }}
            onPointerMissed={onCanvasPointerMissed}
          >
            <XR store={xrStore}>
              {viewProjection === "perspective" ? (
                <PerspectiveCamera makeDefault position={[2.5, 2.5, 3]} fov={50} near={0.01} far={800} />
              ) : (
                <OrthographicCamera makeDefault position={[2.5, 2.5, 3]} zoom={120} near={-1000} far={2000} />
              )}
              <PlaybackDriver onStep={onPlaybackStep} />
              <DesktopInertialCameraControls
                blocked={isTransformDragging || isPosePullDragging}
                focusRequest={focusRequest}
                focusNonce={focusNonce}
                suppressShiftWheelZoom={gizmoMode === "draw" && appMode === "Rig" && workflowAllowsDraw && !physicsEnabled}
                viewDirectionRequest={viewDirectionRequest}
                viewDirectionNonce={viewDirectionNonce}
                onActiveCameraChange={onActiveCameraChange}
              />
              <SceneContent
                meshSources={sceneMeshSources}
                actuators={sceneActuators}
                appMode={appMode}
                pendingPoseRevision={pendingPoseRevision}
                poseTargetActuators={poseTargetActuators}
                selectedActuatorId={selectedActuatorId}
                selectedActuatorIds={selectedActuatorIds}
                physicsEnabled={physicsEnabled}
                skinningEnabled={skinningEnabled}
                skinningRevision={skinningRevision}
                deltaMushEnabled={deltaMushEnabled}
                deltaMushSettings={deltaMushSettings}
                physicsTuning={physicsTuning}
                worldGravityY={worldGravityY}
                onSkinningStats={onSkinningStats}
                onSkinningComputationStatus={onSkinningComputationStatus}
                gizmoMode={gizmoMode}
                gizmoSpace={gizmoSpace}
                pivotMode={pivotMode}
                isTransformDragging={isTransformDragging}
                onSelectActuator={selectActuator}
                onClearSelection={clearSelection}
                onActuatorRef={setActuatorObjectRef}
                onTransformStart={beginTransformChange}
                onTransformChange={applyTransformChange}
                onTransformEnd={endTransformChange}
                onPosePullDraggingChange={setIsPosePullDragging}
                onDrawSurfaceRef={setDrawSurfaceRef}
                onUpAxisDetected={(meshId) => {
                  setImportedMeshes((prev) =>
                    prev.map((m) => (m.id === meshId ? { ...m, upAxis: "Z" as const } : m)),
                  );
                }}
                drawHoverActuatorId={drawHoverActuatorId}
                xrActiveToolsByHand={xrToolState.toolsByHand}
                xrAltModeByHand={xrToolState.altModeByHand}
              />
            </XR>
          </Canvas>
          <ViewCube
            cameraRef={cameraRef}
            onToggleProjection={toggleProjectionKeepView}
            onRequestViewDirection={requestViewDirection}
          />
          {gizmoMode === "draw" && appMode === "Rig" && workflowAllowsDraw && !physicsEnabled && drawCursor.visible ? (
            <div
              className={`app__draw-cursor${drawCursorHasInRangeAnchor ? "" : " app__draw-cursor--inactive"}`}
              style={{
                left: drawCursor.x,
                top: drawCursor.y,
                width: `${Math.max(8, drawCursorRadiusPx * 2)}px`,
                height: `${Math.max(8, drawCursorRadiusPx * 2)}px`,
              }}
            />
          ) : null}
          {marqueeRect !== null ? (
            <div
              className="app__marquee"
              style={{
                left: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width),
                top: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height),
                width: Math.abs(marqueeRect.width),
                height: Math.abs(marqueeRect.height),
              }}
            />
          ) : null}
        </div>
      ),
    }),
    [
      actuators,
      appMode,
      bakeStartFrame,
      bakeEndFrame,
      collapsedNodeIds,
      deltaMushEnabled,
      deltaMushSettings,
      drawCursor,
      drawCursorHasInRangeAnchor,
      drawCursorRadiusPx,
      drawMirrorEnabled,
      drawSnapEnabled,
      drawRadius,
      exportCapabilities,
      exportFormat,
      focusNonce,
      focusRequest,
      gizmoMode,
      gizmoSpace,
      importedMeshes,
      ioStatus,
      isTransformDragging,
      lastBakeCache,
      marqueeRect,
      meshImportStatus,
      newActuatorShape,
      outlinerEntries,
      outlinerParentDropTargetId,
      outlinerParentDragSourceId,
      pendingPoseRevision,
      physicsEnabled,
      physicsTuning,
      pivotMode,
      poseTargetActuators,
      presetSelectValue,
      sceneActuators,
      sceneMeshSources,
      selectedActuatorId,
      selectedActuatorIds,
      selectedMeshSourceId,
      skinningRevision,
      skinningStats,
      viewDirectionNonce,
      viewDirectionRequest,
      viewProjection,
      workflowAllowsAnimationLane,
      workflowAllowsDraw,
      workflowMode,
      workflowAllowsRigAuthoring,
      workflowAllowsDraw,
      worldGravityY,
      xrToolState.altModeByHand,
      xrToolState.toolsByHand,
    ],
  );

  return (
    <EditorProvider value={editorContextValue}>
    <input
      id="app-mesh-import-input"
      ref={meshImportInputRef}
      type="file"
      accept=".fbx,.glb,.gltf,.obj,.png,.jpg,.jpeg,.webp,model/gltf-binary,model/gltf+json,image/png,image/jpeg,image/webp"
      multiple
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      onChange={handleMeshFileInputChange}
    />
    {pendingImportFiles !== null ? (
      <div className="app__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="app-clear-scene-title">
        <div className="app__modal">
          <h2 id="app-clear-scene-title" className="app__modal-title">Clear the scene?</h2>
          <p className="app__modal-text">
            Yes = Clear current scene and rig, then import the selected file(s).
            <br />
            No = Add the file(s) to the current scene.
          </p>
          <div className="app__modal-actions">
            <button type="button" className="app__modal-btn app__modal-btn--primary" onClick={() => resolvePendingImport(true)}>Yes</button>
            <button type="button" className="app__modal-btn" onClick={() => resolvePendingImport(false)}>No</button>
          </div>
        </div>
      </div>
    ) : null}
    <main className="app">
      <AppHeader
        workflowMode={workflowMode}
        appMode={appMode}
        physicsEnabled={physicsEnabled}
        workflowTool={workflowTool}
        skinningBusy={skinningBusy}
        completedSkinningRevision={completedSkinningRevision}
        xrMode={xrMode}
        vrSupported={vrSupported}
        xrBusy={xrBusy}
        onRequestWorkflowMode={requestWorkflowMode}
        onEnterVr={requestEnterVr}
        onExitVr={requestExitVr}
      />
      <section className="app__viewport app__viewport--dock">
        <DockLayout panelContextValue={panelContextValue} />
      </section>
    </main>
    </EditorProvider>
  );
}


