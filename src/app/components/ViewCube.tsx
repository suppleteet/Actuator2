import { useEffect, useRef, type MouseEvent, type MutableRefObject, type PointerEvent, type WheelEvent } from "react";
import { Quaternion } from "three";
import type { Vec3 } from "../types";

type ProjectionMode = "perspective" | "orthographic";

type ViewCubeProps = {
  cameraRef: MutableRefObject<any>;
  projection: ProjectionMode;
  onToggleProjection: () => void;
  onRequestViewDirection: (direction: Vec3, up: Vec3) => void;
};

type FaceConfig = {
  key: string;
  label: string;
  className: string;
  direction: Vec3;
  up: Vec3;
};

const FACE_CONFIGS: FaceConfig[] = [
  {
    key: "px",
    label: "+X",
    className: "app__viewcube-face--px",
    direction: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: "nx",
    label: "-X",
    className: "app__viewcube-face--nx",
    direction: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: "py",
    label: "+Y",
    className: "app__viewcube-face--py",
    direction: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  },
  {
    key: "ny",
    label: "-Y",
    className: "app__viewcube-face--ny",
    direction: { x: 0, y: -1, z: 0 },
    up: { x: 0, y: 0, z: -1 },
  },
  {
    key: "pz",
    label: "+Z",
    className: "app__viewcube-face--pz",
    direction: { x: 0, y: 0, z: 1 },
    up: { x: 0, y: 1, z: 0 },
  },
  {
    key: "nz",
    label: "-Z",
    className: "app__viewcube-face--nz",
    direction: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
  },
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

export function ViewCube({
  cameraRef,
  projection,
  onToggleProjection,
  onRequestViewDirection,
}: ViewCubeProps) {
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const qRef = useRef(new Quaternion());

  useEffect(() => {
    let rafId = 0;

    const tick = () => {
      const rotator = rotatorRef.current;
      const camera = cameraRef.current;
      if (rotator !== null && camera?.quaternion !== undefined) {
        qRef.current.copy(camera.quaternion).invert().normalize();
        const q = qRef.current;
        // Convert Three.js Y-up quaternion into CSS 3D space (Y-down)
        // so the cube's visual up-vector matches the scene up-vector.
        const qx = -q.x;
        const qy = q.y;
        const qz = -q.z;
        const qw = q.w;

        const w = Math.max(-1, Math.min(1, qw));
        const angle = 2 * Math.acos(w);
        const s = Math.sqrt(Math.max(0, 1 - w * w));
        const axisX = s < 1e-4 ? 1 : qx / s;
        const axisY = s < 1e-4 ? 0 : qy / s;
        const axisZ = s < 1e-4 ? 0 : qz / s;
        rotator.style.transform = `rotate3d(${axisX}, ${axisY}, ${axisZ}, ${angle}rad)`;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [cameraRef]);

  return (
    <div
      className="app__viewcube"
      aria-label="Viewport view cube"
      onPointerDown={stopPointer}
      onPointerUp={stopPointer}
      onPointerMove={stopPointer}
      onWheel={stopWheel}
      onClick={stopClick}
    >
      <button
        type="button"
        className="app__viewcube-projection"
        onClick={(event) => {
          event.stopPropagation();
          onToggleProjection();
        }}
      >
        {projection === "perspective" ? "Ortho" : "Persp"}
      </button>
      <div className="app__viewcube-viewport">
        <div className="app__viewcube-scene">
          <div ref={rotatorRef} className="app__viewcube-rotator">
            {FACE_CONFIGS.map((face) => (
              <button
                key={face.key}
                type="button"
                className={`app__viewcube-face ${face.className}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestViewDirection(face.direction, face.up);
                }}
              >
                {face.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
