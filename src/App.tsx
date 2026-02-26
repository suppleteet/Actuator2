import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { TransformControls } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { BufferGeometry, DoubleSide, Matrix4, Mesh, Object3D, Quaternion, SRGBColorSpace, SkinnedMesh, TextureLoader, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { PlaybackClock, createSyntheticRecording, evaluateClipAtTime, type SyntheticClip } from "./animation/recorder";
import { buildFocusRequestFromActuators, type FocusRequest } from "./interaction/focusFraming";

const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: false,
  emulate: false,
});

type DragMode = "orbit" | "pan" | "zoom" | null;
type ActuatorShape = "capsule" | "sphere" | "box";
type GizmoMode = "select" | "translate" | "rotate" | "scale";
type PivotMode = "object" | "world";

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

type ActuatorEntity = {
  id: string;
  parentId: string | null;
  type: "root" | "custom";
  shape: ActuatorShape;
  transform: {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
  size: Vec3;
};

type EditorState = {
  actuators: ActuatorEntity[];
  selectedActuatorId: string | null;
  selectedActuatorIds: string[];
};

const MIN_SCALE = 0.02;

function normalizePositiveScale(scale: Vec3): Vec3 {
  return {
    x: Math.max(Math.abs(scale.x), MIN_SCALE),
    y: Math.max(Math.abs(scale.y), MIN_SCALE),
    z: Math.max(Math.abs(scale.z), MIN_SCALE),
  };
}

function composeMatrix(position: Vec3, rotation: Quat, scale: Vec3): Matrix4 {
  return new Matrix4().compose(
    new Vector3(position.x, position.y, position.z),
    new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    new Vector3(scale.x, scale.y, scale.z),
  );
}

const ROOT_ACTUATOR: ActuatorEntity = {
  id: "act_root",
  parentId: null,
  type: "root",
  shape: "capsule",
  transform: {
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  },
  size: { x: 0.35, y: 0.8, z: 0.35 },
};

type DesktopInertialCameraControlsProps = {
  blocked: boolean;
  invertOrbitX: boolean;
  focusRequest: FocusRequest | null;
  focusNonce: number;
};

function DesktopInertialCameraControls({ blocked, invertOrbitX, focusRequest, focusNonce }: DesktopInertialCameraControlsProps) {
  const { camera, gl } = useThree();
  const mode = useXR((state) => state.mode);
  const isInXR = mode !== null;

  const targetRef = useRef(new Vector3(0, 1, 0));
  const thetaRef = useRef(0);
  const phiRef = useRef(0);
  const radiusRef = useRef(4);
  const initializedRef = useRef(false);

  const dragModeRef = useRef<DragMode>(null);
  const controlFollowRampRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({
    theta: 0,
    phi: 0,
    panX: 0,
    panY: 0,
    zoom: 0,
  });
  const desiredTargetRef = useRef<Vector3 | null>(null);
  const desiredRadiusRef = useRef<number | null>(null);
  const focusingRef = useRef(false);

  useEffect(() => {
    if (focusRequest === null) return;

    const fovDeg = (camera as any).fov ?? 50;
    const fovRad = (fovDeg * Math.PI) / 180;
    const safeSin = Math.max(Math.sin(fovRad * 0.5), 0.2);
    const fitDistance = Math.max((focusRequest.fitRadius * 1.35) / safeSin, 0.8);

    desiredTargetRef.current = new Vector3(focusRequest.center.x, focusRequest.center.y, focusRequest.center.z);
    desiredRadiusRef.current = fitDistance;
    focusingRef.current = true;
  }, [camera, focusNonce, focusRequest]);

  useEffect(() => {
    const dom = gl.domElement;

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onPointerDown(event: PointerEvent) {
      if (isInXR || blocked) return;
      if (!event.altKey) return;

      if (event.button === 0) dragModeRef.current = "orbit";
      if (event.button === 1) dragModeRef.current = "pan";
      if (event.button === 2) dragModeRef.current = "zoom";
      if (dragModeRef.current === null) return;

      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;
      dom.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (isInXR || blocked || dragModeRef.current === null) return;
      if (!event.altKey) return;

      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;

      if (dragModeRef.current === "orbit") {
        const orbitXSign = invertOrbitX ? -1 : 1;
        velocityRef.current.theta -= dx * 0.022 * orbitXSign;
        velocityRef.current.phi -= dy * 0.022;
      } else if (dragModeRef.current === "pan") {
        const panImpulse = radiusRef.current * 0.007;
        velocityRef.current.panX += -dx * panImpulse;
        velocityRef.current.panY += dy * panImpulse;
      } else if (dragModeRef.current === "zoom") {
        const zoomImpulse = Math.max(radiusRef.current * 0.09, 0.35);
        velocityRef.current.zoom += dy * zoomImpulse;
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (dragModeRef.current === null) return;
      dragModeRef.current = null;
      if (dom.hasPointerCapture(event.pointerId)) {
        dom.releasePointerCapture(event.pointerId);
      }
    }

    function onWheel(event: WheelEvent) {
      if (isInXR || blocked) return;
      if (!event.altKey) return;
      event.preventDefault();
      const modeScale = event.deltaMode === 1 ? 14 : event.deltaMode === 2 ? 120 : 1;
      const zoomImpulse = Math.max(radiusRef.current * 0.005, 0.016);
      velocityRef.current.zoom += event.deltaY * modeScale * zoomImpulse;
    }

    dom.addEventListener("contextmenu", onContextMenu);
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      dom.removeEventListener("contextmenu", onContextMenu);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [blocked, gl, invertOrbitX, isInXR]);

  useFrame((_, delta) => {
    if (isInXR || blocked) return;

    if (!initializedRef.current) {
      const offset = camera.position.clone().sub(targetRef.current);
      radiusRef.current = Math.max(offset.length(), 0.5);
      thetaRef.current = Math.atan2(offset.x, offset.z);
      phiRef.current = Math.acos(Math.min(Math.max(offset.y / radiusRef.current, -1), 1));
      initializedRef.current = true;
    }

    const velocity = velocityRef.current;
    const dragging = dragModeRef.current !== null;
    const followTarget = dragging ? 1 : 0;
    const followLerp = 1 - Math.exp(-(dragging ? 35 : 20) * delta);
    controlFollowRampRef.current += (followTarget - controlFollowRampRef.current) * followLerp;
    const followGain = 1 + controlFollowRampRef.current * 1.35;

    thetaRef.current += velocity.theta * delta * followGain;
    phiRef.current += velocity.phi * delta * followGain;
    phiRef.current = Math.min(Math.max(phiRef.current, 0.1), Math.PI - 0.1);

    radiusRef.current += velocity.zoom * delta * followGain;
    radiusRef.current = Math.min(Math.max(radiusRef.current, 0.5), 80);

    if (focusingRef.current && desiredTargetRef.current !== null && desiredRadiusRef.current !== null) {
      const focusLerp = 1 - Math.exp(-13 * delta);
      targetRef.current.lerp(desiredTargetRef.current, focusLerp);
      radiusRef.current = radiusRef.current + (desiredRadiusRef.current - radiusRef.current) * focusLerp;

      const targetDistance = targetRef.current.distanceTo(desiredTargetRef.current);
      const radiusDistance = Math.abs(radiusRef.current - desiredRadiusRef.current);
      if (targetDistance < 0.01 && radiusDistance < 0.01) {
        focusingRef.current = false;
      }
    }

    const forward = new Vector3();
    camera.getWorldDirection(forward);
    const right = new Vector3().crossVectors(forward, camera.up).normalize();
    const up = new Vector3().copy(camera.up).normalize();
    targetRef.current.addScaledVector(right, velocity.panX * delta * followGain);
    targetRef.current.addScaledVector(up, velocity.panY * delta * followGain);

    const sinPhi = Math.sin(phiRef.current);
    const camOffset = new Vector3(
      radiusRef.current * sinPhi * Math.sin(thetaRef.current),
      radiusRef.current * Math.cos(phiRef.current),
      radiusRef.current * sinPhi * Math.cos(thetaRef.current),
    );
    camera.position.copy(targetRef.current).add(camOffset);
    camera.lookAt(targetRef.current);

    const orbitDamping = Math.exp(-9 * delta);
    const panDamping = Math.exp(-10 * delta);
    const zoomDamping = Math.exp(-11 * delta);
    velocity.theta *= orbitDamping;
    velocity.phi *= orbitDamping;
    velocity.panX *= panDamping;
    velocity.panY *= panDamping;
    velocity.zoom *= zoomDamping;

    if (focusingRef.current) {
      const focusVelocityDamping = Math.exp(-24 * delta);
      velocity.theta *= focusVelocityDamping;
      velocity.phi *= focusVelocityDamping;
      velocity.panX *= focusVelocityDamping;
      velocity.panY *= focusVelocityDamping;
      velocity.zoom *= focusVelocityDamping;
    }
  });

  return null;
}

type SceneContentProps = {
  actuators: ActuatorEntity[];
  selectedActuatorId: string | null;
  selectedActuatorIds: string[];
  selectedObject: Object3D | null;
  gizmoMode: GizmoMode;
  gizmoSpace: "world" | "local";
  pivotMode: PivotMode;
  isTransformDragging: boolean;
  onSelectActuator: (id: string) => void;
  onClearSelection: () => void;
  onActuatorRef: (id: string, object: Object3D | null) => void;
  onTransformStart: () => void;
  onTransformChange: (id: string, position: Vec3, rotation: Quat, scale: Vec3) => void;
  onTransformEnd: () => void;
};

function ChadReferenceMesh() {
  const chadSource = useLoader(FBXLoader, "/assets/chad/Chad.fbx");
  const colorMap = useLoader(TextureLoader, "/assets/chad/Textures/chad_Col.png");
  const normalMap = useLoader(TextureLoader, "/assets/chad/Textures/chad_Norm.png");
  const roughnessMap = useLoader(TextureLoader, "/assets/chad/Textures/chad_Pbr.png");

  const chadMeshGeometry = useMemo(() => {
    let geometry: BufferGeometry | null = null;
    chadSource.traverse((object) => {
      if (geometry !== null) return;
      if ((object as SkinnedMesh).isSkinnedMesh) {
        geometry = (object as SkinnedMesh).geometry.clone();
        return;
      }
      if ((object as Mesh).isMesh) {
        geometry = (object as Mesh).geometry.clone();
      }
    });
    return geometry;
  }, [chadSource]);

  useEffect(() => {
    colorMap.colorSpace = SRGBColorSpace;
    colorMap.needsUpdate = true;
  }, [colorMap]);

  if (chadMeshGeometry === null) return null;

  const ignoreRaycast = () => {};

  return (
    <mesh
      geometry={chadMeshGeometry}
      scale={[0.01, 0.01, 0.01]}
      position={[0, 0.02, 0]}
      castShadow
      receiveShadow
      raycast={ignoreRaycast}
    >
      <meshStandardMaterial map={colorMap} normalMap={normalMap} roughnessMap={roughnessMap} roughness={1} metalness={0} />
    </mesh>
  );
}

function SceneContent({
  actuators,
  selectedActuatorId,
  selectedActuatorIds,
  selectedObject,
  gizmoMode,
  gizmoSpace,
  pivotMode,
  isTransformDragging,
  onSelectActuator,
  onClearSelection,
  onActuatorRef,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
}: SceneContentProps) {
  const xrMode = useXR((state) => state.mode);
  const isInXR = xrMode !== null;
  const selectedIdSet = useMemo(() => new Set(selectedActuatorIds), [selectedActuatorIds]);
  const pivotObjectRef = useRef<Object3D>(new Object3D());
  const transformControlsRef = useRef<any>(null);
  const dragStartSelectedMatrixRef = useRef(new Matrix4());
  const dragStartPivotMatrixRef = useRef(new Matrix4());
  const dragActuatorIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pivotObject = pivotObjectRef.current;
    if (isTransformDragging) return;

    if (pivotMode === "world") {
      pivotObject.position.set(0, 0, 0);
      pivotObject.quaternion.set(0, 0, 0, 1);
      pivotObject.scale.set(1, 1, 1);
      pivotObject.updateMatrixWorld(true);
      return;
    }

    if (selectedObject !== null) {
      pivotObject.position.copy(selectedObject.position);
      pivotObject.quaternion.copy(selectedObject.quaternion);
      pivotObject.scale.copy(selectedObject.scale);
      pivotObject.updateMatrixWorld(true);
    }
  }, [isTransformDragging, pivotMode, selectedObject]);

  useEffect(() => {
    const controls = transformControlsRef.current;
    if (controls === null || controls === undefined) return;

    controls.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;

      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          entry.side = DoubleSide;
          entry.needsUpdate = true;
        }
        return;
      }

      if (material !== undefined && material !== null) {
        material.side = DoubleSide;
        material.needsUpdate = true;
      }
    });
  }, [gizmoMode, gizmoSpace, pivotMode, selectedActuatorId]);

  function getGeometry(shape: ActuatorShape, size: Vec3) {
    if (shape === "sphere") return <sphereGeometry args={[Math.max(size.x, size.y, size.z) * 0.5, 18, 14]} />;
    if (shape === "capsule") return <capsuleGeometry args={[Math.max(size.x, size.z) * 0.5, size.y, 8, 14]} />;
    return <boxGeometry args={[size.x, size.y, size.z]} />;
  }

  return (
    <>
      <color attach="background" args={["#d9ecff"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <ChadReferenceMesh />

      <Physics gravity={[0, -9.81, 0]}>
        {actuators.map((actuator) => {
          const isSelected = selectedIdSet.has(actuator.id);
          const isRoot = actuator.id === "act_root";
          const color = isSelected ? "#ff6a3d" : isRoot ? "#28a26a" : "#2f7fd1";

          return (
            <mesh
              key={actuator.id}
              ref={(object) => onActuatorRef(actuator.id, object)}
              position={[actuator.transform.position.x, actuator.transform.position.y, actuator.transform.position.z]}
              quaternion={
                new Quaternion(
                  actuator.transform.rotation.x,
                  actuator.transform.rotation.y,
                  actuator.transform.rotation.z,
                  actuator.transform.rotation.w,
                )
              }
              scale={[actuator.transform.scale.x, actuator.transform.scale.y, actuator.transform.scale.z]}
              onClick={(event) => {
                event.stopPropagation();
                onSelectActuator(actuator.id);
              }}
              castShadow
            >
              {getGeometry(actuator.shape, actuator.size)}
              <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
            </mesh>
          );
        })}

        {selectedActuatorId !== null && selectedObject !== null && !isInXR && gizmoMode !== "select" ? (
          <TransformControls
            ref={transformControlsRef}
            mode={gizmoMode}
            space={gizmoSpace}
            size={0.75}
            object={pivotMode === "object" ? selectedObject : pivotObjectRef.current}
            onMouseDown={() => {
              dragActuatorIdRef.current = selectedActuatorId;
              selectedObject.updateMatrixWorld(true);
              dragStartSelectedMatrixRef.current.copy(selectedObject.matrixWorld);

              const pivotTarget = pivotMode === "object" ? selectedObject : pivotObjectRef.current;
              pivotTarget.updateMatrixWorld(true);
              dragStartPivotMatrixRef.current.copy(pivotTarget.matrixWorld);
              onTransformStart();
            }}
            onMouseUp={() => {
              dragActuatorIdRef.current = null;
              onTransformEnd();
            }}
            onObjectChange={() => {
              const actuatorId = dragActuatorIdRef.current;
              if (actuatorId === null) return;

              if (pivotMode === "object") {
                onTransformChange(
                  actuatorId,
                  {
                    x: selectedObject.position.x,
                    y: selectedObject.position.y,
                    z: selectedObject.position.z,
                  },
                  {
                    x: selectedObject.quaternion.x,
                    y: selectedObject.quaternion.y,
                    z: selectedObject.quaternion.z,
                    w: selectedObject.quaternion.w,
                  },
                  {
                    x: selectedObject.scale.x,
                    y: selectedObject.scale.y,
                    z: selectedObject.scale.z,
                  },
                );
                return;
              }

              const pivotObject = pivotObjectRef.current;
              pivotObject.updateMatrixWorld(true);

              const startPivotInverse = dragStartPivotMatrixRef.current.clone().invert();
              const deltaMatrix = pivotObject.matrixWorld.clone().multiply(startPivotInverse);
              const nextSelectedMatrix = deltaMatrix.multiply(dragStartSelectedMatrixRef.current.clone());

              const nextPosition = new Vector3();
              const nextQuaternion = new Quaternion();
              const nextScale = new Vector3();
              nextSelectedMatrix.decompose(nextPosition, nextQuaternion, nextScale);

              onTransformChange(
                actuatorId,
                { x: nextPosition.x, y: nextPosition.y, z: nextPosition.z },
                { x: nextQuaternion.x, y: nextQuaternion.y, z: nextQuaternion.z, w: nextQuaternion.w },
                { x: nextScale.x, y: nextScale.y, z: nextScale.z },
              );
            }}
          />
        ) : null}

        <RigidBody type="fixed" colliders="cuboid">
          <mesh
            position={[0, -0.1, 0]}
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onClearSelection();
            }}
          >
            <boxGeometry args={[8, 0.2, 8]} />
            <meshStandardMaterial color="#a8b8c8" />
          </mesh>
        </RigidBody>
      </Physics>
    </>
  );
}

type PlaybackDriverProps = {
  onStep: (deltaSec: number) => void;
};

function PlaybackDriver({ onStep }: PlaybackDriverProps) {
  useFrame((_, delta) => {
    onStep(delta);
  });
  return null;
}

export default function App() {
  const canUseWebXR = typeof navigator !== "undefined" && "xr" in navigator;
  const createdAtRef = useRef(new Date().toISOString());
  const nextActuatorIndexRef = useRef(1);
  const actuatorObjectRefs = useRef<Record<string, Object3D | null>>({});
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<any>(null);
  const marqueeDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const undoStackRef = useRef<EditorState[]>([]);
  const redoStackRef = useRef<EditorState[]>([]);
  const [editorState, setEditorState] = useState<EditorState>({
    actuators: [ROOT_ACTUATOR],
    selectedActuatorId: ROOT_ACTUATOR.id,
    selectedActuatorIds: [ROOT_ACTUATOR.id],
  });
  const [isTransformDragging, setIsTransformDragging] = useState(false);
  const [invertOrbitX, setInvertOrbitX] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">("world");
  const [pivotMode, setPivotMode] = useState<PivotMode>("object");
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [syntheticClip, setSyntheticClip] = useState<SyntheticClip | null>(null);
  const [playbackState, setPlaybackState] = useState<"stopped" | "playing">("stopped");
  const [playbackTimeSec, setPlaybackTimeSec] = useState(0);
  const playbackClockRef = useRef<PlaybackClock | null>(null);
  const transformStartSnapshotRef = useRef<EditorState | null>(null);

  const actuators = editorState.actuators;
  const selectedActuatorId = editorState.selectedActuatorId;
  const selectedActuatorIds = editorState.selectedActuatorIds;
  const selectedObject = selectedActuatorId !== null ? (actuatorObjectRefs.current[selectedActuatorId] ?? null) : null;

  function setActuatorObjectRef(id: string, object: Object3D | null) {
    actuatorObjectRefs.current[id] = object;
  }

  function cloneEditorState(state: EditorState): EditorState {
    return {
      selectedActuatorId: state.selectedActuatorId,
      selectedActuatorIds: [...state.selectedActuatorIds],
      actuators: state.actuators.map((actuator) => ({
        ...actuator,
        transform: {
          ...actuator.transform,
          position: { ...actuator.transform.position },
          rotation: { ...actuator.transform.rotation },
          scale: { ...actuator.transform.scale },
        },
        size: { ...actuator.size },
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

    commitEditorChange((previous) => {
      const samePrimary = previous.selectedActuatorId === primary;
      const sameIds =
        previous.selectedActuatorIds.length === sortedUnique.length &&
        previous.selectedActuatorIds.every((id, index) => id === sortedUnique[index]);
      if (samePrimary && sameIds) return previous;
      return {
        actuators: previous.actuators,
        selectedActuatorId: primary,
        selectedActuatorIds: sortedUnique,
      };
    });
  }

  function createActuator() {
    const index = nextActuatorIndexRef.current;
    nextActuatorIndexRef.current += 1;

    const id = `act_${index.toString().padStart(4, "0")}`;

    commitEditorChange((previous) => ({
      actuators: (() => {
        const parent =
          previous.actuators.find((actuator) => actuator.id === previous.selectedActuatorId) ??
          previous.actuators.find((actuator) => actuator.id === ROOT_ACTUATOR.id) ??
          ROOT_ACTUATOR;

        const parentRotation = new Quaternion(
          parent.transform.rotation.x,
          parent.transform.rotation.y,
          parent.transform.rotation.z,
          parent.transform.rotation.w,
        );
        const parentPosition = new Vector3(
          parent.transform.position.x,
          parent.transform.position.y,
          parent.transform.position.z,
        );

        const childSize = { x: 0.4, y: 0.4, z: 0.4 };
        const parentHalfHeight = (parent.size.y * parent.transform.scale.y) / 2;
        const childHalfHeight = childSize.y / 2;
        const endOffset = new Vector3(0, parentHalfHeight + childHalfHeight + 0.08, 0).applyQuaternion(parentRotation);
        const spawnPosition = parentPosition.add(endOffset);

        const actuator: ActuatorEntity = {
          id,
          parentId: parent.id,
          type: "custom",
          shape: "box",
          transform: {
            position: {
              x: spawnPosition.x,
              y: spawnPosition.y,
              z: spawnPosition.z,
            },
            rotation: {
              x: parentRotation.x,
              y: parentRotation.y,
              z: parentRotation.z,
              w: parentRotation.w,
            },
            scale: { x: 1, y: 1, z: 1 },
          },
          size: childSize,
        };

        return [...previous.actuators, actuator];
      })(),
      selectedActuatorId: id,
      selectedActuatorIds: [id],
    }));
  }

  function deleteSelectedActuator() {
    commitEditorChange((previous) => {
      const explicitSelectionIds = previous.selectedActuatorIds.filter((id) => id !== ROOT_ACTUATOR.id);
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

      return {
        actuators: previous.actuators.filter((actuator) => !removeIds.has(actuator.id)),
        selectedActuatorId: ROOT_ACTUATOR.id,
        selectedActuatorIds: [ROOT_ACTUATOR.id],
      };
    });
  }

  function selectActuator(id: string) {
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

  function applyTransformChange(id: string, position: Vec3, rotation: Quat, scale: Vec3) {
    const normalizedScale = normalizePositiveScale(scale);
    setEditorState((previous) => ({
      ...previous,
      actuators: (() => {
        const moved = previous.actuators.find((actuator) => actuator.id === id);
        if (moved === undefined) return previous.actuators;

        const movedOldMatrix = composeMatrix(moved.transform.position, moved.transform.rotation, moved.transform.scale);
        const movedNewMatrix = composeMatrix(position, rotation, normalizedScale);
        const deltaMatrix = movedNewMatrix.clone().multiply(movedOldMatrix.clone().invert());

        function isDescendant(candidateId: string): boolean {
          let current = previous.actuators.find((actuator) => actuator.id === candidateId);
          while (current !== undefined && current.parentId !== null) {
            if (current.parentId === id) return true;
            current = previous.actuators.find((actuator) => actuator.id === current?.parentId);
          }
          return false;
        }

        return previous.actuators.map((actuator) => {
          if (actuator.id === id) {
            return {
              ...actuator,
              transform: {
                ...actuator.transform,
                position: { ...position },
                rotation: { ...rotation },
                scale: normalizedScale,
              },
            };
          }

          if (!isDescendant(actuator.id)) return actuator;

          const childMatrix = composeMatrix(actuator.transform.position, actuator.transform.rotation, actuator.transform.scale);
          const childNextMatrix = deltaMatrix.clone().multiply(childMatrix);

          const childPosition = new Vector3();
          const childRotation = new Quaternion();
          const childScale = new Vector3();
          childNextMatrix.decompose(childPosition, childRotation, childScale);

          return {
            ...actuator,
            transform: {
              ...actuator.transform,
              position: {
                x: childPosition.x,
                y: childPosition.y,
                z: childPosition.z,
              },
              rotation: {
                x: childRotation.x,
                y: childRotation.y,
                z: childRotation.z,
                w: childRotation.w,
              },
              scale: normalizePositiveScale({
                x: childScale.x,
                y: childScale.y,
                z: childScale.z,
              }),
            },
          };
        });
      })(),
    }));
  }

  function beginTransformChange() {
    if (transformStartSnapshotRef.current !== null) return;
    transformStartSnapshotRef.current = cloneEditorState(editorState);
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
    return JSON.stringify(
      {
        version: "0.1.0",
        sceneId: "scene_main",
        createdAtUtc: createdAtRef.current,
        updatedAtUtc: new Date().toISOString(),
        characters: [
          {
            id: "char_001",
            name: "PrototypeCharacter",
            mesh: {
              meshId: "mesh_chad_fbx",
              uri: "assets/chad/Chad.fbx",
            },
            rig: {
              rootActuatorId: ROOT_ACTUATOR.id,
              actuators: sortedActuators,
            },
            skinBinding: {
              version: "0.1",
              solver: "closestVolume",
              meshHash: "pending",
              bindingHash: "pending",
              generatedAtUtc: new Date().toISOString(),
              influenceCount: sortedActuators.length,
            },
            channels: {
              look: { yaw: 0, pitch: 0 },
              blink: { left: 0, right: 0 },
              custom: {},
            },
          },
        ],
        playback: {
          fps: syntheticClip?.fps ?? 60,
          durationSec: syntheticClip?.durationSec ?? 10,
          activeClipId: syntheticClip?.clipId ?? null,
        },
      },
      null,
      2,
    );
  }, [actuators, syntheticClip]);

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

      if (key === "q") setGizmoMode("select");
      if (key === "w") setGizmoMode("translate");
      if (key === "e") setGizmoMode("rotate");
      if (key === "r") setGizmoMode("scale");
      if (key === "f") {
        const idsToFrame = selectedActuatorIds.length > 0 ? selectedActuatorIds : actuators.map((actuator) => actuator.id);
        const request = buildFocusRequestFromActuators(actuators, idsToFrame);
        if (request === null) return;
        setFocusRequest(request);
        setFocusNonce((value) => value + 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actuators, selectedActuatorIds]);

  async function enterVR() {
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.error("Failed to enter VR session:", error);
    }
  }

  function onCanvasPointerMissed() {
    if (marqueeDragRef.current !== null) return;
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

  function runMarqueeSelection(rect: { x: number; y: number; width: number; height: number }) {
    const cameraObject = cameraRef.current;
    if (cameraObject === null) return;
    const wrap = canvasWrapRef.current;
    if (wrap === null) return;

    const minX = Math.min(rect.x, rect.x + rect.width);
    const minY = Math.min(rect.y, rect.y + rect.height);
    const maxX = Math.max(rect.x, rect.x + rect.width);
    const maxY = Math.max(rect.y, rect.y + rect.height);

    const hits: string[] = [];
    for (const actuator of actuators) {
      const projected = new Vector3(
        actuator.transform.position.x,
        actuator.transform.position.y,
        actuator.transform.position.z,
      ).project(cameraObject);

      if (projected.z < -1 || projected.z > 1) continue;

      const px = (projected.x * 0.5 + 0.5) * wrap.clientWidth;
      const py = (-projected.y * 0.5 + 0.5) * wrap.clientHeight;
      if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
        hits.push(actuator.id);
      }
    }

    if (hits.length === 0) {
      clearSelection();
      return;
    }

    const primary = selectedActuatorId !== null && hits.includes(selectedActuatorId) ? selectedActuatorId : hits[0];
    setSelection(hits, primary);
  }

  function onCanvasWrapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.altKey) return;
    if (gizmoMode !== "select") return;
    if (isTransformDragging) return;

    const local = clientToCanvasLocal(event.clientX, event.clientY);
    if (local === null) return;

    marqueeDragRef.current = {
      pointerId: event.pointerId,
      startX: local.x,
      startY: local.y,
      moved: false,
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

    if (!wasMoved || completedRect === null) return;
    runMarqueeSelection(completedRect);
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>Actuator2 Runtime Bootstrap</h1>
        <p>Sprint 01 focus: Chad mesh integration for rigging workflows</p>
        <div className="app__actions">
          <button type="button" onClick={enterVR} disabled={!canUseWebXR}>
            Enter VR
          </button>
          <button type="button" onClick={() => setInvertOrbitX((previous) => !previous)}>
            Invert X Drag: {invertOrbitX ? "On" : "Off"}
          </button>
          {!canUseWebXR ? (
            <span>WebXR unavailable in this browser</span>
          ) : (
            <span>Desktop controls: Alt+LMB orbit, Alt+MMB pan, Alt+RMB zoom, Alt+wheel zoom</span>
          )}
          <span>Playback: {playbackState} @ {playbackTimeSec.toFixed(2)}s</span>
        </div>
      </header>
      <section className="app__viewport">
        <aside className="app__panel">
          <div className="app__panel-actions">
            <button type="button" onClick={createActuator}>
              Create Actuator
            </button>
            <button
              type="button"
              onClick={deleteSelectedActuator}
              disabled={selectedActuatorIds.length === 0 || selectedActuatorIds.every((id) => id === ROOT_ACTUATOR.id)}
            >
              Delete Selected
            </button>
            <button type="button" onClick={undo} disabled={undoStackRef.current.length === 0}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={redoStackRef.current.length === 0}>
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
          </div>

          <div className="app__panel-status">
            <strong>Selected:</strong> {selectedActuatorIds.length === 0 ? "none" : `${selectedActuatorIds.length} (active: ${selectedActuatorId})`}
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
                    onClick={() => selectActuator(actuator.id)}
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
                blocked={isTransformDragging}
                invertOrbitX={invertOrbitX}
                focusRequest={focusRequest}
                focusNonce={focusNonce}
              />
              <SceneContent
                actuators={actuators}
                selectedActuatorId={selectedActuatorId}
                selectedActuatorIds={selectedActuatorIds}
                selectedObject={selectedObject}
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
