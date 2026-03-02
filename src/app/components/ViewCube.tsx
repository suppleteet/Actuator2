import { Canvas, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useMemo, useRef, type MouseEvent, type MutableRefObject, type PointerEvent, type WheelEvent } from "react";
import { Group, Quaternion, Vector3 } from "three";
import type { Vec3 } from "../types";

type ViewCubeProps = {
  cameraRef: MutableRefObject<any>;
  onToggleProjection: () => void;
  onRequestViewDirection: (direction: Vec3, up: Vec3) => void;
};

type FaceConfig = {
  key: string;
  label: string;
  normal: Vec3;
  up: Vec3;
  tint: string;
};

const FACE_CONFIGS: FaceConfig[] = [
  { key: "px", label: "RIGHT", normal: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, tint: "#d4ddea" },
  { key: "nx", label: "LEFT", normal: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, tint: "#d4ddea" },
  { key: "py", label: "TOP", normal: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: -1 }, tint: "#dbe3ee" },
  { key: "ny", label: "BOTTOM", normal: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 }, tint: "#c7d1df" },
  { key: "pz", label: "FRONT", normal: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, tint: "#d9e2ee" },
  { key: "nz", label: "BACK", normal: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, tint: "#cad5e4" },
];

function stopPointer(event: PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopWheel(event: WheelEvent<HTMLElement>) {
  event.stopPropagation();
}

function stopClick(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function normalizeDirection(direction: Vec3): Vec3 {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-5) return { x: 0, y: 0, z: 1 };
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

function upVectorForDirection(direction: Vec3): Vec3 {
  if (Math.abs(direction.y) > 0.95) {
    // Top/down rolled 180 so +Z appears down on screen.
    return { x: 0, y: 0, z: direction.y >= 0 ? -1 : 1 };
  }
  return { x: 0, y: 1, z: 0 };
}

type CubeSceneProps = {
  sourceCameraRef: MutableRefObject<any>;
  onToggleProjection: () => void;
  onRequestViewDirection: (direction: Vec3, up: Vec3) => void;
};

function CubeScene({ sourceCameraRef, onToggleProjection, onRequestViewDirection }: CubeSceneProps) {
  const groupRef = useRef<Group | null>(null);
  const inverseSourceQuat = useRef(new Quaternion());
  const projectionToggleArmedRef = useRef(false);

  const faces = useMemo(
    () =>
      FACE_CONFIGS.map((face) => {
        const normal = new Vector3(face.normal.x, face.normal.y, face.normal.z);
        const up = new Vector3(face.up.x, face.up.y, face.up.z);
        const right = new Vector3().crossVectors(up, normal).normalize();
        const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
        const position = normal.clone().multiplyScalar(0.51);
        return { ...face, normal, up, right, quaternion, position };
      }),
    [],
  );

  useFrame(() => {
    const source = sourceCameraRef.current;
    const group = groupRef.current;
    if (source === null || source === undefined || group === null || source.quaternion === undefined) return;
    inverseSourceQuat.current.copy(source.quaternion).invert().normalize();
    group.quaternion.copy(inverseSourceQuat.current);
  });

  function requestDirection(direction: Vector3) {
    const normalized = normalizeDirection({ x: direction.x, y: direction.y, z: direction.z });
    if (projectionToggleArmedRef.current) {
      onToggleProjection();
    } else {
      projectionToggleArmedRef.current = true;
    }
    onRequestViewDirection(normalized, upVectorForDirection(normalized));
  }

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d6e0ec" metalness={0.05} roughness={0.78} />
      </mesh>
      {faces.map((face) => (
        <group key={face.key} position={face.position} quaternion={face.quaternion}>
          <mesh
            onClick={(event) => {
              event.stopPropagation();
              requestDirection(face.normal);
            }}
          >
            <planeGeometry args={[0.86, 0.86]} />
            <meshStandardMaterial color={face.tint} metalness={0.04} roughness={0.86} />
          </mesh>
          <Text
            position={[0, 0, 0.002]}
            fontSize={0.12}
            color="#2b3442"
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, 0]}
          >
            {face.label}
          </Text>
          {[
            { key: "top", symbol: "^", offset: [0, 0.43, 0.006] as const, dir: face.up },
            { key: "bottom", symbol: "v", offset: [0, -0.43, 0.006] as const, dir: face.up.clone().multiplyScalar(-1) },
            { key: "left", symbol: "<", offset: [-0.43, 0, 0.006] as const, dir: face.right.clone().multiplyScalar(-1) },
            { key: "right", symbol: ">", offset: [0.43, 0, 0.006] as const, dir: face.right },
          ].map((arrow) => (
            <group key={`${face.key}-${arrow.key}`} position={arrow.offset}>
              <mesh
                onClick={(event) => {
                  event.stopPropagation();
                  requestDirection(arrow.dir);
                }}
              >
                <planeGeometry args={[0.18, 0.18]} />
                <meshStandardMaterial color="#c0cedf" metalness={0.04} roughness={0.82} />
              </mesh>
              <Text fontSize={0.14} color="#1f2834" anchorX="center" anchorY="middle" position={[0, 0, 0.003]}>
                {arrow.symbol}
              </Text>
            </group>
          ))}
          {[
            {
              key: "tl",
              pos: [-0.43, 0.43, 0.007] as const,
              dir: face.normal.clone().add(face.up).add(face.right.clone().multiplyScalar(-1)).normalize(),
            },
            {
              key: "tr",
              pos: [0.43, 0.43, 0.007] as const,
              dir: face.normal.clone().add(face.up).add(face.right).normalize(),
            },
            {
              key: "bl",
              pos: [-0.43, -0.43, 0.007] as const,
              dir: face.normal.clone().add(face.up.clone().multiplyScalar(-1)).add(face.right.clone().multiplyScalar(-1)).normalize(),
            },
            {
              key: "br",
              pos: [0.43, -0.43, 0.007] as const,
              dir: face.normal.clone().add(face.up.clone().multiplyScalar(-1)).add(face.right).normalize(),
            },
          ].map((corner) => (
            <mesh
              key={`${face.key}-${corner.key}`}
              position={corner.pos}
              onClick={(event) => {
                event.stopPropagation();
                requestDirection(corner.dir);
              }}
            >
              <planeGeometry args={[0.14, 0.14]} />
              <meshStandardMaterial color="#c6d3e1" metalness={0.04} roughness={0.86} />
            </mesh>
          ))}
        </group>
      ))}
      <ambientLight intensity={0.72} />
      <directionalLight position={[2.2, 2.6, 2.4]} intensity={0.76} />
    </group>
  );
}

export function ViewCube({ cameraRef, onToggleProjection, onRequestViewDirection }: ViewCubeProps) {
  return (
    <div
      className="app__viewcube"
      data-scene-ui="true"
      aria-label="Viewport view cube"
      onPointerDown={stopPointer}
      onPointerUp={stopPointer}
      onPointerMove={stopPointer}
      onWheel={stopWheel}
      onClick={stopClick}
    >
      <div className="app__viewcube-viewport">
        <Canvas
          orthographic={false}
          camera={{ position: [0, 0, 2.7], fov: 34, near: 0.1, far: 10 }}
          dpr={[1, 1.5]}
          frameloop="always"
        >
          <CubeScene
            sourceCameraRef={cameraRef}
            onToggleProjection={onToggleProjection}
            onRequestViewDirection={onRequestViewDirection}
          />
        </Canvas>
      </div>
    </div>
  );
}
