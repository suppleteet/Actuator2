import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import { Box3, Matrix4, Object3D, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import { PlaybackClock, createSyntheticRecording, evaluateClipAtTime, type SyntheticClip } from "./animation/recorder";
import { buildFocusRequestFromActuators, type FocusRequest } from "./interaction/focusFraming";
import {
  getActuatorPrimitiveCenter,
  getCapsuleHalfAxis,
  normalizePositiveScale,
  normalizePrimitiveSize,
  scalePrimitiveSizeFromGizmoDelta,
} from "./runtime/physicsAuthoring";
import {
  defaultPresetForActuatorType,
  getActuatorMassFromPreset,
  getActuatorPresetSettings,
} from "./runtime/physicsPresets";
import { createRootActuator, composeMatrix } from "./app/actuatorModel";
import { smoothDampQuat, smoothDampVec3, type SmoothDampQuatVelocity, type SmoothDampVec3Velocity } from "./app/smoothDamp";
import {
  type ActiveMeshSource,
  type ActuatorEntity,
  type ActuatorShape,
  type ActuatorTransformSnapshot,
  type AppMode,
  type DeltaMushSettings,
  type EditorState,
  type GizmoMode,
  type PhysicsTuning,
  type PivotMode,
  type SkinningComputationStatus,
  type SkinningStats,
  type Vec3,
} from "./app/types";
import { DesktopInertialCameraControls } from "./app/components/DesktopInertialCameraControls";
import { PlaybackDriver } from "./app/components/PlaybackDriver";
import { SceneContent } from "./app/components/SceneContent";

const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: false,
  emulate: false,
});

const DEFAULT_PHYSICS_TUNING: PhysicsTuning = {
  solverIterations: 8,
  internalPgsIterations: 2,
  additionalSolverIterations: 4,
  bodyLinearDamping: 1,
  bodyAngularDamping: 1,
  rotationStiffness: 1,
  rotationVelocityBlend: 1,
  maxAngularSpeed: 1,
  pullStiffness: 240,
  pullDamping: 36,
  pullMaxForce: 4200,
};

const DEFAULT_DELTA_MUSH_SETTINGS: DeltaMushSettings = {
  iterations: 8,
  strength: 0.75,
};

export default function App() {
  const sceneMeshSources = useMemo<ActiveMeshSource[]>(
    () => [
      {
        id: "mesh_chad",
        meshUri: "/assets/chad/Chad.fbx",
        colorMapUri: "/assets/chad/Textures/chad_Col.png",
        normalMapUri: "/assets/chad/Textures/chad_Norm.png",
        roughnessMapUri: "/assets/chad/Textures/chad_Pbr.png",
        worldScale: 0.01,
        worldYOffset: 0.02,
      },
    ],
    [],
  );
  const canUseWebXR = typeof navigator !== "undefined" && "xr" in navigator;
  const createdAtRef = useRef(new Date().toISOString());
  const nextActuatorIndexRef = useRef(1);
  const nextRigIndexRef = useRef(2);
  const actuatorObjectRefs = useRef<Record<string, Object3D | null>>({});
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<any>(null);
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
  const undoStackRef = useRef<EditorState[]>([]);
  const redoStackRef = useRef<EditorState[]>([]);
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
  const [newActuatorShape, setNewActuatorShape] = useState<ActuatorShape>("capsule");
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
  const [syntheticClip, setSyntheticClip] = useState<SyntheticClip | null>(null);
  const [playbackState, setPlaybackState] = useState<"stopped" | "playing">("stopped");
  const [playbackTimeSec, setPlaybackTimeSec] = useState(0);
  const [isPosePullDragging, setIsPosePullDragging] = useState(false);
  const playbackClockRef = useRef<PlaybackClock | null>(null);
  const transformStartSnapshotRef = useRef<EditorState | null>(null);
  const editorStateRef = useRef<EditorState>(editorState);
  const [skinningRevision, setSkinningRevision] = useState(1);
  const [skinningBusy, setSkinningBusy] = useState(false);
  const [completedSkinningRevision, setCompletedSkinningRevision] = useState(0);
  const [skinBindingHash, setSkinBindingHash] = useState("pending");
  const [skinMeshHash, setSkinMeshHash] = useState("pending");
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

  const actuators = editorState.actuators;
  const selectedRigId = editorState.selectedRigId;
  const selectedActuatorId = editorState.selectedActuatorId;
  const selectedActuatorIds = editorState.selectedActuatorIds;
  const rigIds = useMemo(() => [...new Set(actuators.map((actuator) => actuator.rigId))].sort(), [actuators]);
  const onSkinningStats = useCallback((stats: SkinningStats) => {
    setSkinningStats(stats);
  }, []);
  const onSkinningComputationStatus = useCallback((status: SkinningComputationStatus) => {
    setSkinningBusy(status.busy);
    if (!status.completed) return;
    setCompletedSkinningRevision((previous) => Math.max(previous, status.revision));
    if (status.bindingHash !== null) {
      setSkinBindingHash(status.bindingHash);
    }
    if (status.meshHash !== null) {
      setSkinMeshHash(status.meshHash);
    }
  }, []);

  useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  function setActuatorObjectRef(id: string, object: Object3D | null) {
    actuatorObjectRefs.current[id] = object;
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

  function requestAppMode(nextMode: AppMode) {
    if (nextMode === "Pose") {
      if (appMode === "Pose" && pendingPoseRevision === null) return;
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
      undoStackRef.current.push(cloneEditorState(previous));
      redoStackRef.current = [];
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

  function setActiveRig(rigId: string) {
    commitEditorChange((previous) => {
      const rigActuators = previous.actuators.filter((actuator) => actuator.rigId === rigId);
      const preferred = rigActuators.find((actuator) => actuator.id === previous.selectedActuatorId) ?? rigActuators[0] ?? null;
      const nextSelection = preferred === null ? [] : [preferred.id];
      return {
        actuators: previous.actuators,
        selectedRigId: rigId,
        selectedActuatorId: preferred?.id ?? null,
        selectedActuatorIds: nextSelection,
      };
    });
  }

  function createActuator() {
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

      const created: ActuatorEntity[] = [];
      for (const parent of parents) {
        const index = nextActuatorIndexRef.current;
        nextActuatorIndexRef.current += 1;
        const id = `act_${index.toString().padStart(4, "0")}`;

        const parentRotation = new Quaternion(
          parent.transform.rotation.x,
          parent.transform.rotation.y,
          parent.transform.rotation.z,
          parent.transform.rotation.w,
        );
        const parentUp = new Vector3(0, 1, 0).applyQuaternion(parentRotation);
        const parentCenter = getActuatorPrimitiveCenter(parent);

        const childShape = parent.shape;
        const childPreset = parent.preset ?? defaultPresetForActuatorType(parent.type);
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
          id: `${activeRigId}_${id}`,
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

  function createRig() {
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
    commitEditorChange((previous) => {
      const explicitSelectionIds = previous.selectedActuatorIds.filter((id) => {
        const actuator = previous.actuators.find((item) => item.id === id);
        return actuator !== undefined && actuator.parentId !== null;
      });
      if (explicitSelectionIds.length === 0) return previous;

      const removeIds = new Set<string>(explicitSelectionIds);
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

  function clearSelection() {
    setSelection([], null);
  }

  function undo() {
    setEditorState((previous) => {
      const snapshot = undoStackRef.current.pop();
      if (snapshot === undefined) return previous;
      redoStackRef.current.push(cloneEditorState(previous));
      return snapshot;
    });
  }

  function redo() {
    setEditorState((previous) => {
      const snapshot = redoStackRef.current.pop();
      if (snapshot === undefined) return previous;
      undoStackRef.current.push(cloneEditorState(previous));
      return snapshot;
    });
  }

  function applyTransformChange(id: string, worldDelta: Matrix4, localDelta: Matrix4, worldOffset: Vec3) {
    const baseState = transformStartSnapshotRef.current ?? editorState;
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

    function applyDeltaToDescendants(parentId: string, delta: Matrix4) {
      const children = childrenByParent.get(parentId) ?? [];
      for (const childId of children) {
        const original = worldMatrixById.get(childId);
        if (original !== undefined) {
          worldMatrixById.set(childId, delta.clone().multiply(original));
        }
        applyDeltaToDescendants(childId, delta);
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

    if (gizmoMode === "scale") {
      const selectedSet = new Set(selectedOrdered);
      const nextActuators = baseState.actuators.map((actuator) => {
        if (!selectedSet.has(actuator.id)) return actuator;
        return {
          ...actuator,
          size: scalePrimitiveSizeFromGizmoDelta(actuator.size, {
            x: deltaScale.x,
            y: deltaScale.y,
            z: deltaScale.z,
          }),
          transform: {
            ...actuator.transform,
            scale: { x: 1, y: 1, z: 1 },
          },
        };
      });

      setEditorState((previous) => ({
        ...previous,
        actuators: nextActuators,
      }));
      return;
    }

    void worldDelta;
    const worldTranslateDelta = new Vector3(worldOffset.x, worldOffset.y, worldOffset.z);

    for (const selectedId of selectedOrdered) {
      const original = worldMatrixById.get(selectedId);
      if (original === undefined) continue;

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
      applyDeltaToDescendants(selectedId, subtreeDelta);
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

    setEditorState((previous) => ({
      ...previous,
      actuators: nextActuators,
    }));
  }

  function beginTransformChange() {
    if (transformStartSnapshotRef.current !== null) return;
    transformStartSnapshotRef.current = cloneEditorState(editorState);
    marqueeDragRef.current = null;
    setMarqueeRect(null);
    setIsTransformDragging(true);
  }

  function endTransformChange() {
    setIsTransformDragging(false);
    const startSnapshot = transformStartSnapshotRef.current;
    transformStartSnapshotRef.current = null;
    if (startSnapshot === null) return;

    setEditorState((current) => {
      const changed = JSON.stringify(startSnapshot.actuators) !== JSON.stringify(current.actuators);
      if (!changed) return current;
      undoStackRef.current.push(startSnapshot);
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
    setPlaybackTimeSec(timeSec);
  }

  function recordSynthetic() {
    const clip = createSyntheticRecording(actuators, {
      fps: 30,
      durationSec: 4,
      clipId: "clip_synthetic_001",
    });
    setSyntheticClip(clip);
    playbackClockRef.current = new PlaybackClock(clip.fps, clip.durationSec);
    setPlaybackState("stopped");
    applyClipAtTime(clip, 0);
  }

  function playSynthetic() {
    if (syntheticClip === null) return;
    if (playbackClockRef.current === null) {
      playbackClockRef.current = new PlaybackClock(syntheticClip.fps, syntheticClip.durationSec);
    }
    playbackClockRef.current.start();
    setPlaybackState("playing");
    setPlaybackTimeSec(0);
    applyClipAtTime(syntheticClip, 0);
  }

  function stopSynthetic() {
    playbackClockRef.current?.stop();
    setPlaybackState("stopped");
    setPlaybackTimeSec(0);
    if (syntheticClip !== null) {
      applyClipAtTime(syntheticClip, 0);
    }
  }

  function onPlaybackStep(deltaSec: number) {
    if (syntheticClip === null) return;
    const clock = playbackClockRef.current;
    if (clock === null || !clock.isPlaying()) return;

    const steppedTimes = clock.tick(deltaSec);
    for (const timeSec of steppedTimes) {
      applyClipAtTime(syntheticClip, timeSec);
    }

    if (!clock.isPlaying()) {
      setPlaybackState("stopped");
    }
  }

  const serializedScene = useMemo(() => {
    const sortedActuators = [...actuators].sort((a, b) => a.id.localeCompare(b.id));
    const characters = rigIds.map((rigId, index) => {
      const meshSource =
        sceneMeshSources.length === 0 ? null : sceneMeshSources[Math.min(index, sceneMeshSources.length - 1)];
      const rigActuators = sortedActuators.filter((actuator) => actuator.rigId === rigId);
      const rigActuatorDocuments = rigActuators.map((actuator) => {
        const presetSettings = getActuatorPresetSettings(actuator);
        return {
          id: actuator.id,
          parentId: actuator.parentId,
          type: actuator.type,
          shape: actuator.shape,
          preset: actuator.preset ?? defaultPresetForActuatorType(actuator.type),
          pivot: {
            mode: actuator.pivot.mode,
            offsetLocal: { ...actuator.pivot.offset },
          },
          transform: {
            position: { ...actuator.transform.position },
            rotation: { ...actuator.transform.rotation },
            scale: { ...actuator.transform.scale },
          },
          size: { ...actuator.size },
          joint: {
            mode: "limited",
            angularLimitDeg: { x: 45, y: 45, z: 45 },
            swingLimitDeg: 45,
            twistLimitDeg: 45,
          },
          physics: {
            mass: getActuatorMassFromPreset(actuator),
            linearDamping: presetSettings.drag,
            angularDamping: presetSettings.angularDrag,
            drivePositionSpring: presetSettings.drivePositionSpring,
            drivePositionDamper: presetSettings.drivePositionDamper,
            driveRotationSpring: presetSettings.driveRotationSpring,
            driveRotationDamper: presetSettings.driveRotationDamper,
            gravityScale: 1,
            kinematicInRigMode: true,
          },
          influence: {
            radius: Math.max(actuator.size.x, actuator.size.y, actuator.size.z) * 0.5,
            falloff: 1,
            weight: 1,
          },
        };
      });
      const root = rigActuators.find((actuator) => actuator.parentId === null);
      return {
        id: `char_${(index + 1).toString().padStart(3, "0")}`,
        name: `PrototypeCharacter_${rigId}`,
        mesh: {
          meshId: meshSource?.id ?? "mesh_active",
          uri: meshSource?.meshUri.replace(/^\//, "") ?? "",
        },
        rig: {
          rootActuatorId: root?.id ?? "",
          actuators: rigActuatorDocuments,
        },
        skinBinding: {
          version: "0.1",
          solver: "closestVolume",
          meshHash: skinMeshHash,
          bindingHash: skinBindingHash,
          generatedAtUtc: new Date().toISOString(),
          influenceCount: skinningStats.vertexCount,
        },
        channels: {
          look: { yaw: 0, pitch: 0 },
          blink: { left: 0, right: 0 },
          custom: {},
        },
      };
    });

    return JSON.stringify(
      {
        version: "0.1.0",
        sceneId: "scene_main",
        createdAtUtc: createdAtRef.current,
        updatedAtUtc: new Date().toISOString(),
        characters,
        playback: {
          fps: syntheticClip?.fps ?? 60,
          durationSec: syntheticClip?.durationSec ?? 10,
          activeClipId: syntheticClip?.clipId ?? null,
        },
      },
      null,
      2,
    );
  }, [actuators, rigIds, sceneMeshSources, syntheticClip, skinBindingHash, skinMeshHash, skinningStats.vertexCount]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

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

      if (event.code === "Space") {
        event.preventDefault();
        requestAppMode(appMode === "Rig" ? "Pose" : "Rig");
        return;
      }

      if (key === "q") setGizmoMode("select");
      if (key === "w") setGizmoMode("translate");
      if (key === "e") setGizmoMode("rotate");
      if (key === "r") setGizmoMode("scale");
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
  }, [actuators, appMode, pendingPoseRevision, physicsEnabled, selectedActuatorIds, selectedRigId, skinningRevision]);

  async function enterVR() {
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.error("Failed to enter VR session:", error);
    }
  }

  function onCanvasPointerMissed() {
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
    if (event.button !== 0) return;
    if (event.altKey) return;
    if (isTransformDragging) return;
    if (hasActuatorHit(event.clientX, event.clientY)) return;

    const local = clientToCanvasLocal(event.clientX, event.clientY);
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
    const drag = marqueeDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;

    const local = clientToCanvasLocal(event.clientX, event.clientY);
    if (local === null) return;

    const width = local.x - drag.startX;
    const height = local.y - drag.startY;
    if (!drag.moved && Math.hypot(width, height) > 4) {
      drag.moved = true;
    }
    setMarqueeRect({ x: drag.startX, y: drag.startY, width, height });
  }

  function onCanvasWrapPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
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

  return (
    <main className="app">
      <header className="app__header">
        <h1>Actuator2 Runtime Bootstrap</h1>
        <p>Sprint 03 focus: physics integration foundations</p>
        <div className="app__actions">
          <button
            type="button"
            onClick={() => requestAppMode("Rig")}
            disabled={appMode === "Rig" && pendingPoseRevision === null}
          >
            Rig Mode
          </button>
          <button
            type="button"
            onClick={() => requestAppMode("Pose")}
            disabled={appMode === "Pose" || pendingPoseRevision !== null}
          >
            Pose Mode
          </button>
          <button type="button" onClick={enterVR} disabled={!canUseWebXR}>
            Enter VR
          </button>
          {!canUseWebXR ? (
            <span>WebXR unavailable in this browser</span>
          ) : (
            <span>Desktop controls: Alt+LMB orbit, MMB pan, RMB zoom, wheel zoom</span>
          )}
          <span>Mode: {appMode} {physicsEnabled ? "(sim on)" : "(sim off)"} (Space toggles Rig/Pose)</span>
          <span>Pose Drag: click + drag actuator primitive</span>
          <span>Skinning: {skinningBusy ? "Rebuilding..." : `Ready (rev ${completedSkinningRevision})`}</span>
          <span>Playback: {playbackState} @ {playbackTimeSec.toFixed(2)}s</span>
        </div>
      </header>
      <section className="app__viewport">
        <aside className="app__panel">
          <div className="app__panel-actions">
            <button type="button" onClick={createRig} disabled={physicsEnabled}>
              Create Rig
            </button>
            <button type="button" onClick={createActuator} disabled={physicsEnabled}>
              Create Actuator
            </button>
            <button
              type="button"
              onClick={deleteSelectedActuator}
              disabled={
                physicsEnabled ||
                selectedActuatorIds.length === 0 ||
                selectedActuatorIds.every((id) => {
                  const actuator = actuators.find((item) => item.id === id);
                  return actuator?.parentId === null;
                })
              }
            >
              Delete Selected
            </button>
            <button type="button" onClick={undo} disabled={physicsEnabled || undoStackRef.current.length === 0}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={physicsEnabled || redoStackRef.current.length === 0}>
              Redo
            </button>
            <button type="button" onClick={recordSynthetic}>
              Record Synthetic
            </button>
            <button type="button" onClick={playSynthetic} disabled={syntheticClip === null}>
              Play
            </button>
            <button type="button" onClick={stopSynthetic} disabled={syntheticClip === null}>
              Stop
            </button>
          </div>

          <div className="app__panel-tools">
            <strong>Tools</strong>
            <div className="app__tool-row">
              <button type="button" className={gizmoMode === "select" ? "is-selected" : ""} onClick={() => setGizmoMode("select")}>
                Select (Q)
              </button>
              <button type="button" className={gizmoMode === "translate" ? "is-selected" : ""} onClick={() => setGizmoMode("translate")}>
                Move (W)
              </button>
              <button type="button" className={gizmoMode === "rotate" ? "is-selected" : ""} onClick={() => setGizmoMode("rotate")}>
                Rotate (E)
              </button>
              <button type="button" className={gizmoMode === "scale" ? "is-selected" : ""} onClick={() => setGizmoMode("scale")}>
                Scale (R)
              </button>
            </div>
            <div className="app__tool-row">
              <label htmlFor="space-select">Orientation</label>
              <select id="space-select" value={gizmoSpace} onChange={(event) => setGizmoSpace(event.target.value as "world" | "local") }>
                <option value="world">World</option>
                <option value="local">Local</option>
              </select>
            </div>
            <div className="app__tool-row">
              <label htmlFor="pivot-select">Pivot</label>
              <select id="pivot-select" value={pivotMode} onChange={(event) => setPivotMode(event.target.value as PivotMode)}>
                <option value="object">Object Center</option>
                <option value="world">World Origin</option>
              </select>
            </div>
            <div className="app__tool-row">
              <label htmlFor="rig-select">Active Rig</label>
              <select id="rig-select" value={selectedRigId} onChange={(event) => setActiveRig(event.target.value)}>
                {rigIds.map((rigId) => (
                  <option key={rigId} value={rigId}>
                    {rigId}
                  </option>
                ))}
              </select>
            </div>
            <div className="app__tool-row">
              <label htmlFor="new-actuator-shape">New Actuator</label>
              <select
                id="new-actuator-shape"
                value={newActuatorShape}
                onChange={(event) => setNewActuatorShape(event.target.value as ActuatorShape)}
              >
                <option value="capsule">Capsule (Default)</option>
                <option value="sphere">Sphere</option>
                <option value="box">Box</option>
              </select>
            </div>
            <div className="app__tool-row">
              <label htmlFor="delta-mush-toggle">Delta Mush</label>
              <select
                id="delta-mush-toggle"
                value={deltaMushEnabled ? "on" : "off"}
                onChange={(event) => setDeltaMushEnabled(event.target.value === "on")}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div className="app__tool-row">
              <label htmlFor="delta-mush-iterations">Mush Iterations</label>
              <input
                id="delta-mush-iterations"
                type="number"
                min={0}
                max={12}
                step={1}
                value={deltaMushSettings.iterations}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  const nextIterations = Number.isFinite(parsed)
                    ? Math.max(0, Math.min(12, Math.round(parsed)))
                    : DEFAULT_DELTA_MUSH_SETTINGS.iterations;
                  setDeltaMushSettings((previous) => ({
                    ...previous,
                    iterations: nextIterations,
                  }));
                }}
              />
            </div>
            <div className="app__tool-row">
              <label htmlFor="delta-mush-strength">Mush Strength</label>
              <input
                id="delta-mush-strength"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={deltaMushSettings.strength}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  const nextStrength = Number.isFinite(parsed)
                    ? Math.max(0, Math.min(1, parsed))
                    : DEFAULT_DELTA_MUSH_SETTINGS.strength;
                  setDeltaMushSettings((previous) => ({
                    ...previous,
                    strength: nextStrength,
                  }));
                }}
              />
            </div>
          </div>

          <div className="app__panel-status">
            <strong>Rig:</strong> {selectedRigId} | <strong>Selected:</strong>{" "}
            {selectedActuatorIds.length === 0 ? "none" : `${selectedActuatorIds.length} (active: ${selectedActuatorId})`}
            <br />
            <strong>Skin:</strong> {skinningStats.vertexCount} verts, {skinningStats.capsuleCount} capsules, avg w{" "}
            {skinningStats.averageWeight.toFixed(3)}
          </div>
          <ul className="app__actuator-list">
            {actuators
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((actuator) => (
                <li key={actuator.id}>
                  <button
                    type="button"
                    className={selectedActuatorIds.includes(actuator.id) ? "is-selected" : ""}
                    onClick={(event) =>
                      selectActuator(actuator.id, {
                        additive: event.shiftKey,
                        toggle: event.ctrlKey || event.metaKey,
                      })
                    }
                  >
                    {actuator.id}
                  </button>
                </li>
              ))}
          </ul>
          <label className="app__serialized-label" htmlFor="scene-json">
            Serialized SceneDocument
          </label>
          <textarea id="scene-json" className="app__serialized" value={serializedScene} readOnly />
        </aside>
        <div
          ref={canvasWrapRef}
          className="app__canvas-wrap"
          onPointerDown={onCanvasWrapPointerDown}
          onPointerMove={onCanvasWrapPointerMove}
          onPointerUp={onCanvasWrapPointerUp}
          onPointerCancel={onCanvasWrapPointerUp}
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
              <PlaybackDriver onStep={onPlaybackStep} />
              <DesktopInertialCameraControls
                blocked={isTransformDragging || isPosePullDragging}
                focusRequest={focusRequest}
                focusNonce={focusNonce}
              />
              <SceneContent
                meshSources={sceneMeshSources}
                actuators={actuators}
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
              />
            </XR>
          </Canvas>
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
      </section>
    </main>
  );
}
