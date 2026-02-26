import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { XR, createXRStore, useXR } from "@react-three/xr";
import { Euler, Vector3 } from "three";

const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: false,
  emulate: false,
});

type DragMode = "orbit" | "pan" | "zoom" | null;
type ActuatorShape = "capsule" | "sphere" | "box";

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

function DesktopInertialCameraControls() {
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
      if (isInXR) return;
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
      if (isInXR || dragModeRef.current === null) return;
      if (!event.altKey) return;

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
      if (isInXR) return;
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
  }, [gl, isInXR]);

  useFrame((_, delta) => {
    if (isInXR) return;

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
  onSelectActuator: (id: string) => void;
};

function SceneContent({ actuators, selectedActuatorId, onSelectActuator }: SceneContentProps) {
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
              position={[actuator.transform.position.x, actuator.transform.position.y, actuator.transform.position.z]}
              rotation={new Euler(
                actuator.transform.rotation.x,
                actuator.transform.rotation.y,
                actuator.transform.rotation.z,
              )}
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

        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, -0.1, 0]} receiveShadow>
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
  const undoStackRef = useRef<EditorState[]>([]);
  const redoStackRef = useRef<EditorState[]>([]);
  const [editorState, setEditorState] = useState<EditorState>({
    actuators: [ROOT_ACTUATOR],
    selectedActuatorId: ROOT_ACTUATOR.id,
  });
  const actuators = editorState.actuators;
  const selectedActuatorId = editorState.selectedActuatorId;

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
    const row = Math.floor((index - 1) / 6);
    const column = (index - 1) % 6;

    const actuator: ActuatorEntity = {
      id,
      parentId: ROOT_ACTUATOR.id,
      type: "custom",
      shape: "box",
      transform: {
        position: {
          x: -1.5 + column * 0.6,
          y: 0.6 + row * 0.32,
          z: -0.35 - row * 0.2,
        },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      size: { x: 0.4, y: 0.4, z: 0.4 },
    };

    commitEditorChange((previous) => ({
      actuators: [...previous.actuators, actuator],
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

      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier) return;

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (key === "z") {
        event.preventDefault();
        undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
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
        <p>R-002: In-memory actuator create/select/delete with stable IDs and schema serialization</p>
        <div className="app__actions">
          <button type="button" onClick={enterVR} disabled={!canUseWebXR}>
            Enter VR
          </button>
          {!canUseWebXR ? (
            <span>WebXR unavailable in this browser</span>
          ) : (
            <span>Desktop controls (Maya-style): Alt+LMB orbit, Alt+MMB pan, Alt+RMB zoom, Alt+wheel zoom</span>
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
              <DesktopInertialCameraControls />
              <SceneContent
                actuators={actuators}
                selectedActuatorId={selectedActuatorId}
                onSelectActuator={selectActuator}
              />
            </XR>
          </Canvas>
        </div>
      </section>
    </main>
  );
}
