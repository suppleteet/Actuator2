import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { TransformControls } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { Box3, BufferGeometry, Color, DoubleSide, Matrix4, Mesh, Object3D, Quaternion, Raycaster, SRGBColorSpace, SkinnedMesh, TextureLoader, Vector2, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { PlaybackClock, createSyntheticRecording, evaluateClipAtTime, type SyntheticClip } from "./animation/recorder";
import { buildFocusRequestFromActuators, type FocusRequest } from "./interaction/focusFraming";
import { bindVerticesToClosestCapsule, type Capsule, type Vec3 as SkinVec3 } from "./skinning/closestCapsuleBinding";
import { applyDeltaMush, buildVertexNeighbors } from "./skinning/deltaMush";

const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: false,
  emulate: false,
});

type DragMode = "orbit" | "pan" | "zoom" | null;
type ActuatorShape = "capsule" | "sphere" | "box";
type GizmoMode = "select" | "translate" | "rotate" | "scale";
type PivotMode = "object" | "world";
type AppMode = "Rig" | "Pose";

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

type ActuatorEntity = {
  id: string;
  rigId: string;
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
  selectedRigId: string;
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

function rootIdForRig(rigId: string): string {
  return `${rigId}_act_root`;
}

function createRootActuator(rigId: string, xOffset = 0): ActuatorEntity {
  return {
    id: rootIdForRig(rigId),
    rigId,
    parentId: null,
    type: "root",
    shape: "capsule",
    transform: {
      position: { x: xOffset, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: { x: 0.35, y: 0.8, z: 0.35 },
  };
}

type SmoothDampVec3Velocity = { x: number; y: number; z: number };
type SmoothDampQuatVelocity = { x: number; y: number; z: number; w: number };

function smoothDampScalar(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Number.POSITIVE_INFINITY,
): { value: number; velocity: number } {
  const clampedSmoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / clampedSmoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * clampedSmoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const adjustedTarget = current - change;

  const temp = (currentVelocity + omega * change) * deltaTime;
  let nextVelocity = (currentVelocity - omega * temp) * exp;
  let output = adjustedTarget + (change + temp) * exp;

  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    nextVelocity = deltaTime > 0 ? (output - originalTo) / deltaTime : 0;
  }

  return { value: output, velocity: nextVelocity };
}

function smoothDampVec3(
  current: Vector3,
  target: Vector3,
  currentVelocity: SmoothDampVec3Velocity,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Number.POSITIVE_INFINITY,
): Vector3 {
  const x = smoothDampScalar(current.x, target.x, currentVelocity.x, smoothTime, deltaTime, maxSpeed);
  const y = smoothDampScalar(current.y, target.y, currentVelocity.y, smoothTime, deltaTime, maxSpeed);
  const z = smoothDampScalar(current.z, target.z, currentVelocity.z, smoothTime, deltaTime, maxSpeed);
  currentVelocity.x = x.velocity;
  currentVelocity.y = y.velocity;
  currentVelocity.z = z.velocity;
  return new Vector3(x.value, y.value, z.value);
}

function smoothDampQuat(
  current: Quaternion,
  target: Quaternion,
  currentVelocity: SmoothDampQuatVelocity,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Number.POSITIVE_INFINITY,
): Quaternion {
  let targetX = target.x;
  let targetY = target.y;
  let targetZ = target.z;
  let targetW = target.w;
  if (current.dot(target) < 0) {
    targetX = -targetX;
    targetY = -targetY;
    targetZ = -targetZ;
    targetW = -targetW;
  }

  const x = smoothDampScalar(current.x, targetX, currentVelocity.x, smoothTime, deltaTime, maxSpeed);
  const y = smoothDampScalar(current.y, targetY, currentVelocity.y, smoothTime, deltaTime, maxSpeed);
  const z = smoothDampScalar(current.z, targetZ, currentVelocity.z, smoothTime, deltaTime, maxSpeed);
  const w = smoothDampScalar(current.w, targetW, currentVelocity.w, smoothTime, deltaTime, maxSpeed);
  currentVelocity.x = x.velocity;
  currentVelocity.y = y.velocity;
  currentVelocity.z = z.velocity;
  currentVelocity.w = w.velocity;
  return new Quaternion(x.value, y.value, z.value, w.value).normalize();
}

type DesktopInertialCameraControlsProps = {
  blocked: boolean;
  focusRequest: FocusRequest | null;
  focusNonce: number;
};

function DesktopInertialCameraControls({ blocked, focusRequest, focusNonce }: DesktopInertialCameraControlsProps) {
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
  const controlFollowVelocityRef = useRef(0);
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
  const desiredTargetVelocityRef = useRef<SmoothDampVec3Velocity>({ x: 0, y: 0, z: 0 });
  const desiredRadiusVelocityRef = useRef(0);
  const focusingRef = useRef(false);

  useEffect(() => {
    if (focusRequest === null) return;

    const fovDeg = (camera as any).fov ?? 50;
    const fovRad = (fovDeg * Math.PI) / 180;
    const safeSin = Math.max(Math.sin(fovRad * 0.5), 0.2);
    const fitDistance = Math.max((focusRequest.fitRadius * 1.35) / safeSin, 0.8);

    desiredTargetRef.current = new Vector3(focusRequest.center.x, focusRequest.center.y, focusRequest.center.z);
    desiredRadiusRef.current = fitDistance;
    desiredTargetVelocityRef.current = { x: 0, y: 0, z: 0 };
    desiredRadiusVelocityRef.current = 0;
    focusingRef.current = true;
  }, [camera, focusNonce, focusRequest]);

  useEffect(() => {
    const dom = gl.domElement;

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onPointerDown(event: PointerEvent) {
      if (isInXR || blocked) return;
      if (event.button === 0 && event.altKey) dragModeRef.current = "orbit";
      if (event.button === 1) dragModeRef.current = "pan";
      if (event.button === 2) dragModeRef.current = "zoom";
      if (dragModeRef.current === null) return;

      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;
      dom.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (isInXR || blocked || dragModeRef.current === null) return;
      if (dragModeRef.current === "orbit" && !event.altKey) return;

      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current.x = event.clientX;
      lastPointerRef.current.y = event.clientY;

      if (dragModeRef.current === "orbit") {
        velocityRef.current.theta -= dx * 0.022;
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
  }, [blocked, gl, isInXR]);

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
    const follow = smoothDampScalar(
      controlFollowRampRef.current,
      followTarget,
      controlFollowVelocityRef.current,
      dragging ? 0.05 : 0.08,
      delta,
    );
    controlFollowRampRef.current = follow.value;
    controlFollowVelocityRef.current = follow.velocity;
    const followGain = 1 + controlFollowRampRef.current * 1.35;

    thetaRef.current += velocity.theta * delta * followGain;
    phiRef.current += velocity.phi * delta * followGain;
    phiRef.current = Math.min(Math.max(phiRef.current, 0.1), Math.PI - 0.1);

    radiusRef.current += velocity.zoom * delta * followGain;
    radiusRef.current = Math.min(Math.max(radiusRef.current, 0.5), 80);

    if (focusingRef.current && desiredTargetRef.current !== null && desiredRadiusRef.current !== null) {
      const smoothedTarget = smoothDampVec3(
        targetRef.current,
        desiredTargetRef.current,
        desiredTargetVelocityRef.current,
        0.15,
        delta,
      );
      targetRef.current.copy(smoothedTarget);
      const smoothedRadius = smoothDampScalar(
        radiusRef.current,
        desiredRadiusRef.current,
        desiredRadiusVelocityRef.current,
        0.15,
        delta,
      );
      radiusRef.current = smoothedRadius.value;
      desiredRadiusVelocityRef.current = smoothedRadius.velocity;

      const targetDistance = targetRef.current.distanceTo(desiredTargetRef.current);
      const radiusDistance = Math.abs(radiusRef.current - desiredRadiusRef.current);
      const targetVelocityMag = Math.hypot(
        desiredTargetVelocityRef.current.x,
        desiredTargetVelocityRef.current.y,
        desiredTargetVelocityRef.current.z,
      );
      if (targetDistance < 0.01 && radiusDistance < 0.01 && targetVelocityMag < 0.02 && Math.abs(desiredRadiusVelocityRef.current) < 0.02) {
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
  appMode: AppMode;
  selectedActuatorId: string | null;
  selectedActuatorIds: string[];
  physicsEnabled: boolean;
  skinningEnabled: boolean;
  skinningRevision: number;
  deltaMushEnabled: boolean;
  deltaMushSettings: DeltaMushSettings;
  onSkinningStats: (stats: SkinningStats) => void;
  onSkinningComputationStatus: (status: SkinningComputationStatus) => void;
  gizmoMode: GizmoMode;
  gizmoSpace: "world" | "local";
  pivotMode: PivotMode;
  isTransformDragging: boolean;
  onSelectActuator: (id: string, options?: { additive?: boolean; toggle?: boolean }) => void;
  onClearSelection: () => void;
  onActuatorRef: (id: string, object: Object3D | null) => void;
  onTransformStart: () => void;
  onTransformChange: (id: string, worldDelta: Matrix4, localDelta: Matrix4, worldOffset: Vec3) => void;
  onTransformEnd: () => void;
};

type SkinningStats = {
  vertexCount: number;
  capsuleCount: number;
  averageWeight: number;
};

type DeltaMushSettings = {
  iterations: number;
  strength: number;
};

type SkinningComputationStatus = {
  busy: boolean;
  revision: number;
  completed: boolean;
  bindingHash: string | null;
  meshHash: string | null;
};

type ActuatorTransformSnapshot = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};

type ChadReferenceMeshProps = {
  actuators: ActuatorEntity[];
  appMode: AppMode;
  skinningEnabled: boolean;
  skinningRevision: number;
  deltaMushEnabled: boolean;
  deltaMushSettings: DeltaMushSettings;
  onSkinningStats: (stats: SkinningStats) => void;
  onSkinningComputationStatus: (status: SkinningComputationStatus) => void;
};

function ChadReferenceMesh({
  actuators,
  appMode,
  skinningEnabled,
  skinningRevision,
  deltaMushEnabled,
  deltaMushSettings,
  onSkinningStats,
  onSkinningComputationStatus,
}: ChadReferenceMeshProps) {
  const chadSource = useLoader(FBXLoader, "/assets/chad/Chad.fbx");
  const colorMap = useLoader(TextureLoader, "/assets/chad/Textures/chad_Col.png");
  const normalMap = useLoader(TextureLoader, "/assets/chad/Textures/chad_Norm.png");
  const roughnessMap = useLoader(TextureLoader, "/assets/chad/Textures/chad_Pbr.png");
  const meshScale = 0.01;
  const meshYOffset = 0.02;

  type RuntimeVertexBinding = {
    capsuleId: string;
    rootCapsuleId: string | null;
    bindWorld: SkinVec3;
    localOffset: SkinVec3;
    rootLocalOffset: SkinVec3;
    weight: number;
  };

  const baseGeometry: BufferGeometry | null = useMemo(() => {
    let foundGeometry: BufferGeometry | null = null;
    chadSource.traverse((object) => {
      if (foundGeometry !== null) return;
      if ((object as SkinnedMesh).isSkinnedMesh) {
        foundGeometry = (object as SkinnedMesh).geometry.clone();
        return;
      }
      if ((object as Mesh).isMesh) {
        foundGeometry = (object as Mesh).geometry.clone();
      }
    });
    const resolved = foundGeometry as BufferGeometry | null;
    if (resolved === null) return null;
    if (resolved.getAttribute("normal") === undefined) {
      resolved.computeVertexNormals();
    }
    return resolved;
  }, [chadSource]);

  const displayGeometry: BufferGeometry | null = useMemo(() => baseGeometry?.clone() ?? null, [baseGeometry]);

  const baseVerticesLocal = useMemo<SkinVec3[]>(() => {
    if (baseGeometry === null) return [];
    const position = baseGeometry.getAttribute("position");
    if (position === undefined) return [];
    const vertices: SkinVec3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      vertices.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i) });
    }
    return vertices;
  }, [baseGeometry]);

  const triangles = useMemo<Array<[number, number, number]>>(() => {
    if (baseGeometry === null) return [];
    const indices = baseGeometry.getIndex()?.array;
    const built: Array<[number, number, number]> = [];
    if (indices !== undefined) {
      for (let i = 0; i + 2 < indices.length; i += 3) {
        built.push([Number(indices[i]), Number(indices[i + 1]), Number(indices[i + 2])]);
      }
      return built;
    }

    for (let i = 0; i + 2 < baseVerticesLocal.length; i += 3) {
      built.push([i, i + 1, i + 2]);
    }
    return built;
  }, [baseGeometry, baseVerticesLocal.length]);

  const weldData = useMemo(() => {
    const vertexToWelded = new Array<number>(baseVerticesLocal.length);
    const weldedToVertices: number[][] = [];
    const weldedVertices: SkinVec3[] = [];
    const keyToWelded = new Map<string, number>();
    const precision = 10000;

    for (let i = 0; i < baseVerticesLocal.length; i += 1) {
      const vertex = baseVerticesLocal[i];
      const key = `${Math.round(vertex.x * precision)}|${Math.round(vertex.y * precision)}|${Math.round(vertex.z * precision)}`;
      let weldedIndex = keyToWelded.get(key);
      if (weldedIndex === undefined) {
        weldedIndex = weldedVertices.length;
        keyToWelded.set(key, weldedIndex);
        weldedVertices.push(vertex);
        weldedToVertices.push([]);
      }
      vertexToWelded[i] = weldedIndex;
      weldedToVertices[weldedIndex].push(i);
    }

    const weldedTriangles: Array<[number, number, number]> = [];
    for (const [a, b, c] of triangles) {
      const wa = vertexToWelded[a];
      const wb = vertexToWelded[b];
      const wc = vertexToWelded[c];
      if (wa === wb || wb === wc || wa === wc) continue;
      weldedTriangles.push([wa, wb, wc]);
    }

    return {
      vertexToWelded,
      weldedToVertices,
      weldedVertices,
      weldedTriangles,
    };
  }, [baseVerticesLocal, triangles]);

  const weldedNeighbors = useMemo(
    () => buildVertexNeighbors(weldData.weldedVertices.length, weldData.weldedTriangles),
    [weldData],
  );

  const baseVerticesWorld = useMemo(
    () =>
      baseVerticesLocal.map((vertex) => ({
        x: vertex.x * meshScale,
        y: vertex.y * meshScale + meshYOffset,
        z: vertex.z * meshScale,
      })),
    [baseVerticesLocal],
  );

  const meshHash = useMemo(
    () => (baseGeometry === null ? null : `mesh:${baseVerticesLocal.length}:${triangles.length}`),
    [baseGeometry, baseVerticesLocal.length, triangles.length],
  );

  const [runtimeBindings, setRuntimeBindings] = useState<RuntimeVertexBinding[] | null>(null);
  const [bindingsRevision, setBindingsRevision] = useState(0);
  const skinningJobTokenRef = useRef(0);

  useEffect(() => {
    colorMap.colorSpace = SRGBColorSpace;
    colorMap.needsUpdate = true;
  }, [colorMap]);

  useEffect(() => {
    if (baseVerticesWorld.length === 0 || meshHash === null) {
      setRuntimeBindings(null);
      setBindingsRevision(skinningRevision);
      onSkinningStats({ vertexCount: 0, capsuleCount: 0, averageWeight: 0 });
      onSkinningComputationStatus({
        busy: false,
        revision: skinningRevision,
        completed: true,
        bindingHash: null,
        meshHash: null,
      });
      return;
    }

    const revision = skinningRevision;
    const currentToken = skinningJobTokenRef.current + 1;
    skinningJobTokenRef.current = currentToken;
    onSkinningComputationStatus({
      busy: true,
      revision,
      completed: false,
      bindingHash: null,
      meshHash,
    });

    const run = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (skinningJobTokenRef.current !== currentToken) return;

      const capsules: Capsule[] = actuators
        .filter((actuator) => actuator.shape === "capsule")
        .map((actuator) => {
          const rotation = new Quaternion(
            actuator.transform.rotation.x,
            actuator.transform.rotation.y,
            actuator.transform.rotation.z,
            actuator.transform.rotation.w,
          );
          const halfHeight = Math.max((actuator.size.y * actuator.transform.scale.y) / 2, 0.01);
          const up = new Vector3(0, 1, 0).applyQuaternion(rotation);
          const center = new Vector3(
            actuator.transform.position.x,
            actuator.transform.position.y,
            actuator.transform.position.z,
          );
          const start = center.clone().addScaledVector(up, -halfHeight);
          const end = center.clone().addScaledVector(up, halfHeight);
          return {
            id: actuator.id,
            start: { x: start.x, y: start.y, z: start.z },
            end: { x: end.x, y: end.y, z: end.z },
            radius: Math.max((Math.max(actuator.size.x, actuator.size.z) * actuator.transform.scale.x) / 2, 0.02),
          };
        });
      const rootCapsuleIds = actuators
        .filter((actuator) => actuator.parentId === null && actuator.shape === "capsule")
        .map((actuator) => actuator.id);

      if (capsules.length === 0) {
        setRuntimeBindings([]);
        setBindingsRevision(revision);
        onSkinningStats({ vertexCount: baseVerticesWorld.length, capsuleCount: 0, averageWeight: 0 });
        onSkinningComputationStatus({
          busy: false,
          revision,
          completed: true,
          bindingHash: `bind:${revision}:empty`,
          meshHash,
        });
        return;
      }

      const nearest = bindVerticesToClosestCapsule(baseVerticesWorld, capsules, {
        rootCapsuleIds,
        falloffMultiplier: 2,
      });
      if (skinningJobTokenRef.current !== currentToken) return;

      const actuatorById = new Map(
        actuators.map((actuator) => [
          actuator.id,
          {
            rigId: actuator.rigId,
            position: new Vector3(
              actuator.transform.position.x,
              actuator.transform.position.y,
              actuator.transform.position.z,
            ),
            rotation: new Quaternion(
              actuator.transform.rotation.x,
              actuator.transform.rotation.y,
              actuator.transform.rotation.z,
              actuator.transform.rotation.w,
            ),
          },
        ]),
      );
      const rootIdByRig = new Map<string, string>();
      for (const actuator of actuators) {
        if (actuator.parentId !== null || actuator.shape !== "capsule") continue;
        rootIdByRig.set(actuator.rigId, actuator.id);
      }
      const fallbackRootCapsuleId = rootCapsuleIds[0] ?? null;

      const nextBindings: RuntimeVertexBinding[] = nearest.map((binding, index) => {
        const bindWorld = baseVerticesWorld[index];
        const influenceActuator = actuatorById.get(binding.capsuleId);
        const rigScopedRootId =
          influenceActuator === undefined
            ? null
            : (rootIdByRig.get(influenceActuator.rigId) ?? fallbackRootCapsuleId);
        const rootCapsuleId = rigScopedRootId ?? fallbackRootCapsuleId;
        const rootActuator = rootCapsuleId === null ? undefined : actuatorById.get(rootCapsuleId);
        const rootLocalOffset =
          rootActuator === undefined
            ? { x: 0, y: 0, z: 0 }
            : (() => {
                const offset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
                  .sub(rootActuator.position)
                  .applyQuaternion(rootActuator.rotation.clone().invert());
                return { x: offset.x, y: offset.y, z: offset.z };
              })();

        if (influenceActuator === undefined) {
          return {
            capsuleId: binding.capsuleId,
            rootCapsuleId,
            bindWorld,
            localOffset: { x: 0, y: 0, z: 0 },
            rootLocalOffset,
            weight: 0,
          };
        }

        const localOffset = new Vector3(bindWorld.x, bindWorld.y, bindWorld.z)
          .sub(influenceActuator.position)
          .applyQuaternion(influenceActuator.rotation.clone().invert());
        return {
          capsuleId: binding.capsuleId,
          rootCapsuleId,
          bindWorld,
          localOffset: { x: localOffset.x, y: localOffset.y, z: localOffset.z },
          rootLocalOffset,
          weight: binding.weight,
        };
      });

      const averageWeight = nextBindings.reduce((sum, binding) => sum + binding.weight, 0) / Math.max(nextBindings.length, 1);
      const bindingHash = `bind:${revision}:${nextBindings.length}:${capsules.length}:${averageWeight.toFixed(6)}`;
      setRuntimeBindings(nextBindings);
      setBindingsRevision(revision);
      onSkinningStats({
        vertexCount: baseVerticesWorld.length,
        capsuleCount: capsules.length,
        averageWeight,
      });
      onSkinningComputationStatus({
        busy: false,
        revision,
        completed: true,
        bindingHash,
        meshHash,
      });
    };

    void run();
  }, [baseVerticesWorld, meshHash, onSkinningComputationStatus, onSkinningStats, skinningRevision]);

  useEffect(() => {
    if (displayGeometry === null) return;
    const position = displayGeometry.getAttribute("position");
    if (position === undefined) return;

    const actuatorById = new Map(
      actuators.map((actuator) => [
        actuator.id,
        {
          position: new Vector3(
            actuator.transform.position.x,
            actuator.transform.position.y,
            actuator.transform.position.z,
          ),
          rotation: new Quaternion(
            actuator.transform.rotation.x,
            actuator.transform.rotation.y,
            actuator.transform.rotation.z,
            actuator.transform.rotation.w,
          ),
        },
      ]),
    );

    const shouldDeformInPose =
      appMode === "Pose" &&
      skinningEnabled &&
      runtimeBindings !== null &&
      runtimeBindings.length === baseVerticesLocal.length &&
      bindingsRevision >= skinningRevision;

    const deformed = baseVerticesLocal.map((bindLocal, index) => {
      if (!shouldDeformInPose) return bindLocal;
      const binding = runtimeBindings[index];
      if (binding === undefined) return bindLocal;

      const actuator = actuatorById.get(binding.capsuleId);
      const rootActuator = binding.rootCapsuleId === null ? undefined : actuatorById.get(binding.rootCapsuleId);

      const bindWorld = new Vector3(binding.bindWorld.x, binding.bindWorld.y, binding.bindWorld.z);
      const transformedWorld =
        actuator === undefined
          ? bindWorld.clone()
          : new Vector3(binding.localOffset.x, binding.localOffset.y, binding.localOffset.z)
              .applyQuaternion(actuator.rotation)
              .add(actuator.position);
      const rootWorld =
        rootActuator === undefined
          ? bindWorld.clone()
          : new Vector3(binding.rootLocalOffset.x, binding.rootLocalOffset.y, binding.rootLocalOffset.z)
              .applyQuaternion(rootActuator.rotation)
              .add(rootActuator.position);
      const weight = Math.max(0, Math.min(1, binding.weight));
      const weightedWorld = new Vector3(
        rootWorld.x + (transformedWorld.x - rootWorld.x) * weight,
        rootWorld.y + (transformedWorld.y - rootWorld.y) * weight,
        rootWorld.z + (transformedWorld.z - rootWorld.z) * weight,
      );

      return {
        x: weightedWorld.x / meshScale,
        y: (weightedWorld.y - meshYOffset) / meshScale,
        z: weightedWorld.z / meshScale,
      };
    });

    let finalVertices = deformed;
    if (shouldDeformInPose && deltaMushEnabled) {
      const deltaMushIterations = Math.max(0, Math.floor(deltaMushSettings.iterations));
      const deltaMushStrength = Math.max(0, Math.min(1, deltaMushSettings.strength));
      const weldedCurrent = weldData.weldedVertices.map((_, weldedIndex) => {
        const members = weldData.weldedToVertices[weldedIndex] ?? [];
        if (members.length === 0) return { x: 0, y: 0, z: 0 };
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const vertexIndex of members) {
          sx += deformed[vertexIndex].x;
          sy += deformed[vertexIndex].y;
          sz += deformed[vertexIndex].z;
        }
        const inv = 1 / members.length;
        return { x: sx * inv, y: sy * inv, z: sz * inv };
      });

      const smoothedWelded = applyDeltaMush(weldedCurrent, weldedNeighbors, deltaMushIterations, deltaMushStrength);
      finalVertices = deformed.map((_, vertexIndex) => {
        const weldedIndex = weldData.vertexToWelded[vertexIndex];
        return smoothedWelded[weldedIndex];
      });
    }

    for (let i = 0; i < finalVertices.length; i += 1) {
      position.setXYZ(i, finalVertices[i].x, finalVertices[i].y, finalVertices[i].z);
    }
    position.needsUpdate = true;
  }, [
    actuators,
    appMode,
    baseVerticesLocal,
    bindingsRevision,
    deltaMushEnabled,
    deltaMushSettings,
    displayGeometry,
    runtimeBindings,
    skinningEnabled,
    skinningRevision,
    weldData,
    weldedNeighbors,
  ]);

  if (displayGeometry === null) return null;

  const ignoreRaycast = () => {};

  return (
    <mesh
      geometry={displayGeometry}
      scale={[meshScale, meshScale, meshScale]}
      position={[0, meshYOffset, 0]}
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
  appMode,
  selectedActuatorId,
  selectedActuatorIds,
  physicsEnabled,
  skinningEnabled,
  skinningRevision,
  deltaMushEnabled,
  deltaMushSettings,
  onSkinningStats,
  onSkinningComputationStatus,
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
  const { scene } = useThree();
  const xrMode = useXR((state) => state.mode);
  const isInXR = xrMode !== null;
  const selectedIdSet = useMemo(() => new Set(selectedActuatorIds), [selectedActuatorIds]);
  const pivotObjectRef = useRef<Object3D>(new Object3D());
  const transformControlsRef = useRef<any>(null);
  const dragStartPivotMatrixRef = useRef(new Matrix4());
  const dragStartPivotPositionRef = useRef(new Vector3());
  const dragActuatorIdRef = useRef<string | null>(null);
  const isDragActiveRef = useRef(false);
  const hasAcceptedDragFrameRef = useRef(false);
  const backgroundBlendRef = useRef(appMode === "Pose" ? 1 : 0);
  const backgroundBlendVelocityRef = useRef(0);
  const blendedBackgroundRef = useRef(new Color("#d9ecff"));
  const lightBackground = useMemo(() => new Color("#d9ecff"), []);
  const darkBackground = useMemo(() => new Color("#1d2230"), []);

  function syncPivotFromSelection() {
    const pivotObject = pivotObjectRef.current;
    if (isTransformDragging || isDragActiveRef.current) return;

    if (pivotMode === "world") {
      pivotObject.position.set(0, 0, 0);
      pivotObject.quaternion.set(0, 0, 0, 1);
      pivotObject.scale.set(1, 1, 1);
      pivotObject.updateMatrixWorld(true);
      return;
    }

    if (selectedActuatorId !== null) {
      const selectedActuator = actuators.find((actuator) => actuator.id === selectedActuatorId);
      if (selectedActuator === undefined) return;
      pivotObject.position.set(
        selectedActuator.transform.position.x,
        selectedActuator.transform.position.y,
        selectedActuator.transform.position.z,
      );
      pivotObject.quaternion.set(
        selectedActuator.transform.rotation.x,
        selectedActuator.transform.rotation.y,
        selectedActuator.transform.rotation.z,
        selectedActuator.transform.rotation.w,
      );
      pivotObject.scale.set(1, 1, 1);
      pivotObject.updateMatrixWorld(true);
    }
  }

  useEffect(() => {
    syncPivotFromSelection();
  }, [isTransformDragging, pivotMode, selectedActuatorId, actuators]);

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

  useFrame((_, delta) => {
    const targetBlend = appMode === "Pose" ? 1 : 0;
    const blended = smoothDampScalar(
      backgroundBlendRef.current,
      targetBlend,
      backgroundBlendVelocityRef.current,
      0.15,
      delta,
    );
    backgroundBlendRef.current = blended.value;
    backgroundBlendVelocityRef.current = blended.velocity;
    const t = backgroundBlendRef.current;
    blendedBackgroundRef.current.setRGB(
      lightBackground.r + (darkBackground.r - lightBackground.r) * t,
      lightBackground.g + (darkBackground.g - lightBackground.g) * t,
      lightBackground.b + (darkBackground.b - lightBackground.b) * t,
    );
    scene.background = blendedBackgroundRef.current;

    syncPivotFromSelection();
    const controls = transformControlsRef.current;
    if (controls === null || controls === undefined) return;
    controls.traverse((object: Object3D) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const entry of material) entry.side = DoubleSide;
      } else if (material !== undefined && material !== null) {
        material.side = DoubleSide;
      }
    });
  });

  function getGeometry(shape: ActuatorShape, size: Vec3) {
    if (shape === "sphere") return <sphereGeometry args={[Math.max(size.x, size.y, size.z) * 0.5, 18, 14]} />;
    if (shape === "capsule") return <capsuleGeometry args={[Math.max(size.x, size.z) * 0.5, size.y, 8, 14]} />;
    return <boxGeometry args={[size.x, size.y, size.z]} />;
  }

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <primitive object={pivotObjectRef.current} visible={false} />
      <ChadReferenceMesh
        actuators={actuators}
        appMode={appMode}
        skinningEnabled={skinningEnabled}
        skinningRevision={skinningRevision}
        deltaMushEnabled={deltaMushEnabled}
        deltaMushSettings={deltaMushSettings}
        onSkinningStats={onSkinningStats}
        onSkinningComputationStatus={onSkinningComputationStatus}
      />

      <Physics gravity={[0, -9.81, 0]} paused={!physicsEnabled}>
        {actuators.map((actuator) => {
          const isSelected = selectedIdSet.has(actuator.id);
          const isRoot = actuator.parentId === null;
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
                onSelectActuator(actuator.id, {
                  additive: event.shiftKey,
                  toggle: event.ctrlKey || event.metaKey,
                });
              }}
              onPointerDown={(event) => event.stopPropagation()}
              castShadow
            >
              {getGeometry(actuator.shape, actuator.size)}
              <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
            </mesh>
          );
        })}

        {selectedActuatorId !== null && !isInXR && gizmoMode !== "select" ? (
          <TransformControls
            ref={transformControlsRef}
            mode={gizmoMode}
            space={gizmoSpace}
            size={0.75}
            object={pivotObjectRef.current}
            onMouseDown={() => {
              hasAcceptedDragFrameRef.current = false;
              syncPivotFromSelection();
              isDragActiveRef.current = true;
              dragActuatorIdRef.current = selectedActuatorId;
              const pivotTarget = pivotObjectRef.current;
              pivotTarget.updateMatrixWorld(true);
              dragStartPivotMatrixRef.current.copy(pivotTarget.matrixWorld);
              dragStartPivotPositionRef.current.setFromMatrixPosition(dragStartPivotMatrixRef.current);
              onTransformStart();
            }}
            onMouseUp={() => {
              isDragActiveRef.current = false;
              hasAcceptedDragFrameRef.current = false;
              dragActuatorIdRef.current = null;
              onTransformEnd();
            }}
            onObjectChange={() => {
              if (!isDragActiveRef.current) return;
              const actuatorId = dragActuatorIdRef.current;
              if (actuatorId === null) return;

              const pivotObject = pivotObjectRef.current;
              pivotObject.updateMatrixWorld(true);

              const startPivotInverse = dragStartPivotMatrixRef.current.clone().invert();
              const worldDelta = pivotObject.matrixWorld.clone().multiply(startPivotInverse);
              const localDelta = startPivotInverse.clone().multiply(pivotObject.matrixWorld.clone());
              const currentPivotPosition = new Vector3().setFromMatrixPosition(pivotObject.matrixWorld);
              const worldOffset = currentPivotPosition.sub(dragStartPivotPositionRef.current);

              if (!hasAcceptedDragFrameRef.current) {
                // Guard against TransformControls first-frame matrix jump.
                if (worldOffset.length() > 1) {
                  dragStartPivotMatrixRef.current.copy(pivotObject.matrixWorld);
                  dragStartPivotPositionRef.current.setFromMatrixPosition(pivotObject.matrixWorld);
                  return;
                }
                hasAcceptedDragFrameRef.current = true;
              }

              onTransformChange(actuatorId, worldDelta, localDelta, {
                x: worldOffset.x,
                y: worldOffset.y,
                z: worldOffset.z,
              });
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
  const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">("world");
  const [pivotMode, setPivotMode] = useState<PivotMode>("object");
  const [appMode, setAppMode] = useState<AppMode>("Rig");
  const [newActuatorShape, setNewActuatorShape] = useState<ActuatorShape>("capsule");
  const [deltaMushEnabled, setDeltaMushEnabled] = useState(true);
  const [deltaMushSettings, setDeltaMushSettings] = useState<DeltaMushSettings>({
    iterations: 2,
    strength: 0.25,
  });
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
  const playbackClockRef = useRef<PlaybackClock | null>(null);
  const transformStartSnapshotRef = useRef<EditorState | null>(null);
  const editorStateRef = useRef<EditorState>(editorState);
  const [skinningRevision, setSkinningRevision] = useState(1);
  const [skinningBusy, setSkinningBusy] = useState(false);
  const [completedSkinningRevision, setCompletedSkinningRevision] = useState(0);
  const [skinBindingHash, setSkinBindingHash] = useState("pending");
  const [skinMeshHash, setSkinMeshHash] = useState("pending");
  const [skinningEnabled, setSkinningEnabled] = useState(false);
  const [pendingPoseRevision, setPendingPoseRevision] = useState<number | null>(null);
  const bindPoseTransformsRef = useRef<Record<string, ActuatorTransformSnapshot> | null>(null);
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
  const physicsEnabled = false;

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
      const requiredRevision = skinningRevision + 1;
      setPendingPoseRevision(requiredRevision);
      setSkinningEnabled(true);
      setSkinningRevision(requiredRevision);
      return;
    }

    if (appMode === "Rig" && pendingPoseRevision === null) return;
    setPendingPoseRevision(null);
    setSkinningEnabled(false);
    setAppMode("Rig");

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
    const timer = setTimeout(() => {
      setSkinningRevision((value) => value + 1);
    }, 60);
    return () => clearTimeout(timer);
  }, [actuators, appMode, pendingPoseRevision]);

  useEffect(() => {
    if (pendingPoseRevision === null) return;
    if (skinningBusy) return;
    if (completedSkinningRevision < pendingPoseRevision) return;
    bindPoseTransformsRef.current = snapshotActuatorTransforms();
    setSkinningEnabled(true);
    setAppMode("Pose");
    setPendingPoseRevision(null);
  }, [actuators, completedSkinningRevision, pendingPoseRevision, skinningBusy]);

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
    const index = nextActuatorIndexRef.current;
    nextActuatorIndexRef.current += 1;

    const id = `act_${index.toString().padStart(4, "0")}`;

    commitEditorChange((previous) => ({
      actuators: (() => {
        const activeRigId = previous.selectedRigId;
        const rigActuators = previous.actuators.filter((actuator) => actuator.rigId === activeRigId);
        const fallbackRoot = rigActuators.find((actuator) => actuator.parentId === null) ?? createRootActuator(activeRigId);
        const parent =
          previous.actuators.find((actuator) => actuator.id === previous.selectedActuatorId && actuator.rigId === activeRigId) ??
          fallbackRoot;

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

        const childSize =
          newActuatorShape === "capsule"
            ? { x: 0.35, y: 0.7, z: 0.35 }
            : newActuatorShape === "sphere"
              ? { x: 0.45, y: 0.45, z: 0.45 }
              : { x: 0.4, y: 0.4, z: 0.4 };
        const parentHalfHeight = (parent.size.y * parent.transform.scale.y) / 2;
        const childHalfHeight = childSize.y / 2;
        const endOffset = new Vector3(0, parentHalfHeight + childHalfHeight + 0.08, 0).applyQuaternion(parentRotation);
        const spawnPosition = parentPosition.add(endOffset);

        const actuator: ActuatorEntity = {
          id: `${activeRigId}_${id}`,
          rigId: activeRigId,
          parentId: parent.id,
          type: "custom",
          shape: newActuatorShape,
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
      selectedRigId: previous.selectedRigId,
      selectedActuatorId: `${previous.selectedRigId}_${id}`,
      selectedActuatorIds: [`${previous.selectedRigId}_${id}`],
    }));
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
      } else if (gizmoMode === "scale") {
        nextScale.set(
          nextScale.x * deltaScale.x,
          nextScale.y * deltaScale.y,
          nextScale.z * deltaScale.z,
        );
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

    // Apply scene-object transforms in the same event tick as gizmo movement.
    for (const actuator of nextActuators) {
      const object = actuatorObjectRefs.current[actuator.id];
      if (object === null || object === undefined) continue;
      object.position.set(
        actuator.transform.position.x,
        actuator.transform.position.y,
        actuator.transform.position.z,
      );
      object.quaternion.set(
        actuator.transform.rotation.x,
        actuator.transform.rotation.y,
        actuator.transform.rotation.z,
        actuator.transform.rotation.w,
      );
      object.scale.set(
        actuator.transform.scale.x,
        actuator.transform.scale.y,
        actuator.transform.scale.z,
      );
      object.updateMatrixWorld(true);
    }

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
      const rigActuators = sortedActuators.filter((actuator) => actuator.rigId === rigId);
      const root = rigActuators.find((actuator) => actuator.parentId === null);
      return {
        id: `char_${(index + 1).toString().padStart(3, "0")}`,
        name: `PrototypeCharacter_${rigId}`,
        mesh: {
          meshId: "mesh_chad_fbx",
          uri: "assets/chad/Chad.fbx",
        },
        rig: {
          rootActuatorId: root?.id ?? "",
          actuators: rigActuators,
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
  }, [actuators, rigIds, syntheticClip, skinBindingHash, skinMeshHash, skinningStats.vertexCount]);

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
  }, [actuators, appMode, pendingPoseRevision, selectedActuatorIds, selectedRigId, skinningRevision]);

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
        <p>Sprint 01 focus: Chad mesh integration for rigging workflows</p>
        <div className="app__actions">
          <button type="button" onClick={() => requestAppMode("Rig")} disabled={appMode === "Rig" && pendingPoseRevision === null}>
            Rig Mode
          </button>
          <button type="button" onClick={() => requestAppMode("Pose")} disabled={appMode === "Pose" || pendingPoseRevision !== null}>
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
          <span>Mode: {appMode} (Space toggles Rig/Pose)</span>
          <span>Skinning: {skinningBusy ? "Rebuilding..." : `Ready (rev ${completedSkinningRevision})`}</span>
          <span>Playback: {playbackState} @ {playbackTimeSec.toFixed(2)}s</span>
        </div>
      </header>
      <section className="app__viewport">
        <aside className="app__panel">
          <div className="app__panel-actions">
            <button type="button" onClick={createRig}>
              Create Rig
            </button>
            <button type="button" onClick={createActuator}>
              Create Actuator
            </button>
            <button
              type="button"
              onClick={deleteSelectedActuator}
              disabled={
                selectedActuatorIds.length === 0 ||
                selectedActuatorIds.every((id) => {
                  const actuator = actuators.find((item) => item.id === id);
                  return actuator?.parentId === null;
                })
              }
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
                  const nextIterations = Number.isFinite(parsed) ? Math.max(0, Math.min(12, Math.round(parsed))) : 0;
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
                  const nextStrength = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
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
                blocked={isTransformDragging}
                focusRequest={focusRequest}
                focusNonce={focusNonce}
              />
              <SceneContent
                actuators={actuators}
                appMode={appMode}
                selectedActuatorId={selectedActuatorId}
                selectedActuatorIds={selectedActuatorIds}
                physicsEnabled={physicsEnabled}
                skinningEnabled={skinningEnabled}
                skinningRevision={skinningRevision}
                deltaMushEnabled={deltaMushEnabled}
                deltaMushSettings={deltaMushSettings}
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
