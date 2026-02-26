import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { TransformControls } from "@react-three/drei";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";

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
};

function DesktopInertialCameraControls({ blocked, invertOrbitX }: DesktopInertialCameraControlsProps) {
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
  });

  return null;
}

type SceneContentProps = {
  actuators: ActuatorEntity[];
  selectedActuatorId: string | null;
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

function SceneContent({
  actuators,
  selectedActuatorId,
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
  const pivotObjectRef = useRef<Object3D>(new Object3D());
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

      <Physics gravity={[0, -9.81, 0]}>
        {actuators.map((actuator) => {
          const isSelected = selectedActuatorId === actuator.id;
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

export default function App() {
  const canUseWebXR = typeof navigator !== "undefined" && "xr" in navigator;
  const createdAtRef = useRef(new Date().toISOString());
  const nextActuatorIndexRef = useRef(1);
  const actuatorObjectRefs = useRef<Record<string, Object3D | null>>({});
  const undoStackRef = useRef<EditorState[]>([]);
  const redoStackRef = useRef<EditorState[]>([]);
  const [editorState, setEditorState] = useState<EditorState>({
    actuators: [ROOT_ACTUATOR],
    selectedActuatorId: ROOT_ACTUATOR.id,
  });
  const [isTransformDragging, setIsTransformDragging] = useState(false);
  const [invertOrbitX, setInvertOrbitX] = useState(false);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [gizmoSpace, setGizmoSpace] = useState<"world" | "local">("world");
  const [pivotMode, setPivotMode] = useState<PivotMode>("object");
  const transformStartSnapshotRef = useRef<EditorState | null>(null);

  const actuators = editorState.actuators;
  const selectedActuatorId = editorState.selectedActuatorId;
  const selectedObject = selectedActuatorId !== null ? (actuatorObjectRefs.current[selectedActuatorId] ?? null) : null;

  function setActuatorObjectRef(id: string, object: Object3D | null) {
    actuatorObjectRefs.current[id] = object;
  }

  function cloneEditorState(state: EditorState): EditorState {
    return {
      selectedActuatorId: state.selectedActuatorId,
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
    }));
  }

  function deleteSelectedActuator() {
    if (selectedActuatorId === null || selectedActuatorId === ROOT_ACTUATOR.id) return;

    commitEditorChange((previous) => {
      const removeIds = new Set<string>([selectedActuatorId]);
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
      };
    });
  }

  function selectActuator(id: string) {
    commitEditorChange((previous) => {
      if (previous.selectedActuatorId === id) return previous;
      return {
        actuators: previous.actuators,
        selectedActuatorId: id,
      };
    });
  }

  function clearSelection() {
    commitEditorChange((previous) => {
      if (previous.selectedActuatorId === null) return previous;
      return {
        actuators: previous.actuators,
        selectedActuatorId: null,
      };
    });
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
              meshId: "mesh_placeholder",
              uri: "assets/placeholder.glb",
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
          fps: 60,
          durationSec: 10,
          activeClipId: null,
        },
      },
      null,
      2,
    );
  }, [actuators]);

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
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function enterVR() {
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.error("Failed to enter VR session:", error);
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>Actuator2 Runtime Bootstrap</h1>
        <p>I-002: Selection + translate/rotate/scale gizmos with local/world + pivot modes</p>
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
        </div>
      </header>
      <section className="app__viewport">
        <aside className="app__panel">
          <div className="app__panel-actions">
            <button type="button" onClick={createActuator}>
              Create Actuator
            </button>
            <button type="button" onClick={deleteSelectedActuator} disabled={selectedActuatorId === ROOT_ACTUATOR.id}>
              Delete Selected
            </button>
            <button type="button" onClick={undo} disabled={undoStackRef.current.length === 0}>
              Undo
            </button>
            <button type="button" onClick={redo} disabled={redoStackRef.current.length === 0}>
              Redo
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
            <strong>Selected:</strong> {selectedActuatorId ?? "none"}
          </div>
          <ul className="app__actuator-list">
            {actuators
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((actuator) => (
                <li key={actuator.id}>
                  <button
                    type="button"
                    className={selectedActuatorId === actuator.id ? "is-selected" : ""}
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
        <div className="app__canvas-wrap">
          <Canvas camera={{ position: [2.5, 2.5, 3], fov: 50 }} shadows>
            <XR store={xrStore}>
              <DesktopInertialCameraControls blocked={isTransformDragging} invertOrbitX={invertOrbitX} />
              <SceneContent
                actuators={actuators}
                selectedActuatorId={selectedActuatorId}
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
        </div>
      </section>
    </main>
  );
}
