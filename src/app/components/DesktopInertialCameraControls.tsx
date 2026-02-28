import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { Vector3 } from "three";
import type { FocusRequest } from "../../interaction/focusFraming";
import { smoothDampScalar, smoothDampVec3, type SmoothDampVec3Velocity } from "../smoothDamp";
import type { DragMode } from "../types";

type DesktopInertialCameraControlsProps = {
  blocked: boolean;
  focusRequest: FocusRequest | null;
  focusNonce: number;
};

export function DesktopInertialCameraControls({ blocked, focusRequest, focusNonce }: DesktopInertialCameraControlsProps) {
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
      if (
        targetDistance < 0.01 &&
        radiusDistance < 0.01 &&
        targetVelocityMag < 0.02 &&
        Math.abs(desiredRadiusVelocityRef.current) < 0.02
      ) {
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
