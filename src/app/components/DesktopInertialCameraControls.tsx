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
  suppressShiftWheelZoom: boolean;
  viewDirectionRequest: { direction: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } } | null;
  viewDirectionNonce: number;
  onActiveCameraChange?: (cameraObject: unknown) => void;
};

function shortestSignedAngleDelta(current: number, target: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const WORLD_UP = new Vector3(0, 1, 0);
const POLE_DOT_THRESHOLD = 0.985;
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 80;
const MIN_ORTHO_ZOOM = 12;
const MAX_ORTHO_ZOOM = 1200;
const ORTHO_ZOOM_SCROLL_GAIN = 0.05;
const PROJECTION_BLEND_START_ORTHO = 0.985;
const PROJECTION_BLEND_START_PERSPECTIVE = 1.015;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function framingHeightFromPerspective(radius: number, fovDeg: number): number {
  const safeFov = clamp(fovDeg, 1, 175);
  const fovRad = (safeFov * Math.PI) / 180;
  return Math.max(2 * Math.tan(fovRad * 0.5) * Math.max(radius, MIN_RADIUS), 1e-4);
}

function framingHeightFromOrthographic(cameraObject: any): number {
  const zoom = Math.max(cameraObject.zoom ?? 1, 1e-4);
  const frustumHeight = Math.max((cameraObject.top ?? 1) - (cameraObject.bottom ?? -1), 1e-4);
  return Math.max(frustumHeight / zoom, 1e-4);
}

function orthographicZoomForFraming(cameraObject: any, framingHeight: number): number {
  const frustumHeight = Math.max((cameraObject.top ?? 1) - (cameraObject.bottom ?? -1), 1e-4);
  return clamp(frustumHeight / Math.max(framingHeight, 1e-4), MIN_ORTHO_ZOOM, MAX_ORTHO_ZOOM);
}

function perspectiveRadiusForFraming(framingHeight: number, fovDeg: number): number {
  const safeFov = clamp(fovDeg, 1, 175);
  const fovRad = (safeFov * Math.PI) / 180;
  const tanHalfFov = Math.max(Math.tan(fovRad * 0.5), 1e-4);
  return clamp(framingHeight / (2 * tanHalfFov), MIN_RADIUS, MAX_RADIUS);
}

function projectionModeFromCamera(cameraObject: any): "perspective" | "orthographic" {
  return cameraObject?.isOrthographicCamera ? "orthographic" : "perspective";
}

export function DesktopInertialCameraControls({
  blocked,
  focusRequest,
  focusNonce,
  suppressShiftWheelZoom,
  viewDirectionRequest,
  viewDirectionNonce,
  onActiveCameraChange,
}: DesktopInertialCameraControlsProps) {
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
  const desiredThetaRef = useRef<number | null>(null);
  const desiredPhiRef = useRef<number | null>(null);
  const desiredThetaVelocityRef = useRef(0);
  const desiredPhiVelocityRef = useRef(0);
  const focusingRef = useRef(false);
  const projectionModeRef = useRef<"perspective" | "orthographic" | null>(null);
  const projectionFramingHeightRef = useRef(1.5);
  const projectionRadiusTargetRef = useRef<number | null>(null);
  const projectionRadiusVelocityRef = useRef(0);
  const projectionZoomTargetRef = useRef<number | null>(null);
  const projectionZoomVelocityRef = useRef(0);
  const poleUpRef = useRef(new Vector3(0, 0, -1));
  const forwardRef = useRef(new Vector3());
  const rightRef = useRef(new Vector3());
  const upRef = useRef(new Vector3());
  const parallelRef = useRef(new Vector3());
  const camOffsetRef = useRef(new Vector3());

  useEffect(() => {
    onActiveCameraChange?.(camera);
  }, [camera, onActiveCameraChange]);

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
    projectionRadiusTargetRef.current = null;
    projectionRadiusVelocityRef.current = 0;
    projectionZoomTargetRef.current = null;
    projectionZoomVelocityRef.current = 0;
  }, [camera, focusNonce, focusRequest]);

  useEffect(() => {
    if (viewDirectionRequest === null) return;
    const direction = new Vector3(
      viewDirectionRequest.direction.x,
      viewDirectionRequest.direction.y,
      viewDirectionRequest.direction.z,
    );
    if (direction.lengthSq() < 1e-8) return;
    direction.normalize();
    const clampedY = Math.min(Math.max(direction.y, -0.999), 0.999);
    desiredThetaRef.current = Math.atan2(direction.x, direction.z);
    desiredPhiRef.current = Math.min(Math.max(Math.acos(clampedY), 0.06), Math.PI - 0.06);
    desiredThetaVelocityRef.current = 0;
    desiredPhiVelocityRef.current = 0;
    const up = new Vector3(
      viewDirectionRequest.up.x,
      viewDirectionRequest.up.y,
      viewDirectionRequest.up.z,
    );
    if (up.lengthSq() > 1e-8) {
      up.normalize();
      poleUpRef.current.copy(up);
      camera.up.copy(up);
    }
    velocityRef.current.theta = 0;
    velocityRef.current.phi = 0;
    velocityRef.current.panX = 0;
    velocityRef.current.panY = 0;
    velocityRef.current.zoom = 0;
    desiredTargetRef.current = null;
    desiredRadiusRef.current = null;
    focusingRef.current = false;
    if (!initializedRef.current) {
      thetaRef.current = desiredThetaRef.current ?? thetaRef.current;
      phiRef.current = desiredPhiRef.current ?? phiRef.current;
      initializedRef.current = true;
    }
  }, [camera, viewDirectionNonce, viewDirectionRequest]);

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
      if (suppressShiftWheelZoom && event.shiftKey) return;
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
  }, [blocked, gl, isInXR, suppressShiftWheelZoom]);

  useFrame((_, delta) => {
    if (isInXR || blocked) return;

    if (!initializedRef.current) {
      const offset = camera.position.clone().sub(targetRef.current);
      radiusRef.current = Math.max(offset.length(), MIN_RADIUS);
      thetaRef.current = Math.atan2(offset.x, offset.z);
      phiRef.current = Math.acos(Math.min(Math.max(offset.y / radiusRef.current, -1), 1));
      if (camera.up.lengthSq() > 1e-8) {
        poleUpRef.current.copy(camera.up).normalize();
      }
      initializedRef.current = true;
    }

    const activeProjectionMode = projectionModeFromCamera(camera as any);
    const previousProjectionMode = projectionModeRef.current;
    if (previousProjectionMode === null) {
      projectionModeRef.current = activeProjectionMode;
    } else if (previousProjectionMode !== activeProjectionMode) {
      projectionModeRef.current = activeProjectionMode;
      const framingHeight = Math.max(projectionFramingHeightRef.current, 1e-4);
      if (activeProjectionMode === "orthographic") {
        const orthoCamera = camera as any;
        const matchedZoom = orthographicZoomForFraming(orthoCamera, framingHeight);
        const transitionStartZoom = clamp(
          matchedZoom * PROJECTION_BLEND_START_ORTHO,
          MIN_ORTHO_ZOOM,
          MAX_ORTHO_ZOOM,
        );
        orthoCamera.zoom = transitionStartZoom;
        orthoCamera.updateProjectionMatrix?.();
        projectionZoomTargetRef.current = matchedZoom;
        projectionZoomVelocityRef.current = 0;
        projectionRadiusTargetRef.current = null;
        projectionRadiusVelocityRef.current = 0;
      } else {
        const perspectiveCamera = camera as any;
        const matchedRadius = perspectiveRadiusForFraming(framingHeight, perspectiveCamera.fov ?? 50);
        radiusRef.current = clamp(
          matchedRadius * PROJECTION_BLEND_START_PERSPECTIVE,
          MIN_RADIUS,
          MAX_RADIUS,
        );
        projectionRadiusTargetRef.current = matchedRadius;
        projectionRadiusVelocityRef.current = 0;
        projectionZoomTargetRef.current = null;
        projectionZoomVelocityRef.current = 0;
      }
      velocityRef.current.zoom = 0;
    }

    const velocity = velocityRef.current;
    const dragging = dragModeRef.current !== null;
    if (dragging) {
      desiredThetaRef.current = null;
      desiredPhiRef.current = null;
      desiredThetaVelocityRef.current = 0;
      desiredPhiVelocityRef.current = 0;
    }
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

    if (desiredThetaRef.current !== null && desiredPhiRef.current !== null) {
      const thetaTarget = thetaRef.current + shortestSignedAngleDelta(thetaRef.current, desiredThetaRef.current);
      const smoothedTheta = smoothDampScalar(
        thetaRef.current,
        thetaTarget,
        desiredThetaVelocityRef.current,
        0.14,
        delta,
      );
      thetaRef.current = smoothedTheta.value;
      desiredThetaVelocityRef.current = smoothedTheta.velocity;

      const smoothedPhi = smoothDampScalar(
        phiRef.current,
        desiredPhiRef.current,
        desiredPhiVelocityRef.current,
        0.14,
        delta,
      );
      phiRef.current = Math.min(Math.max(smoothedPhi.value, 0.1), Math.PI - 0.1);
      desiredPhiVelocityRef.current = smoothedPhi.velocity;

      const thetaError = Math.abs(shortestSignedAngleDelta(thetaRef.current, desiredThetaRef.current));
      const phiError = Math.abs(phiRef.current - desiredPhiRef.current);
      if (
        thetaError < 0.002 &&
        phiError < 0.002 &&
        Math.abs(desiredThetaVelocityRef.current) < 0.01 &&
        Math.abs(desiredPhiVelocityRef.current) < 0.01
      ) {
        thetaRef.current = desiredThetaRef.current;
        phiRef.current = desiredPhiRef.current;
        desiredThetaRef.current = null;
        desiredPhiRef.current = null;
        desiredThetaVelocityRef.current = 0;
        desiredPhiVelocityRef.current = 0;
      }
    } else {
      thetaRef.current += velocity.theta * delta * followGain;
      phiRef.current += velocity.phi * delta * followGain;
      phiRef.current = Math.min(Math.max(phiRef.current, 0.1), Math.PI - 0.1);
    }

    if ((camera as any).isOrthographicCamera) {
      const orthoCamera = camera as any;
      const currentZoom = orthoCamera.zoom ?? 100;
      let nextZoom = clamp(
        currentZoom * Math.exp(-velocity.zoom * delta * ORTHO_ZOOM_SCROLL_GAIN * followGain),
        MIN_ORTHO_ZOOM,
        MAX_ORTHO_ZOOM,
      );
      if (projectionZoomTargetRef.current !== null) {
        const smoothedZoom = smoothDampScalar(
          nextZoom,
          projectionZoomTargetRef.current,
          projectionZoomVelocityRef.current,
          0.16,
          delta,
        );
        nextZoom = clamp(smoothedZoom.value, MIN_ORTHO_ZOOM, MAX_ORTHO_ZOOM);
        projectionZoomVelocityRef.current = smoothedZoom.velocity;
        if (
          Math.abs(nextZoom - projectionZoomTargetRef.current) < 0.02 &&
          Math.abs(projectionZoomVelocityRef.current) < 0.06
        ) {
          nextZoom = projectionZoomTargetRef.current;
          projectionZoomTargetRef.current = null;
          projectionZoomVelocityRef.current = 0;
        }
      }
      orthoCamera.zoom = nextZoom;
      orthoCamera.updateProjectionMatrix();
    } else {
      radiusRef.current += velocity.zoom * delta * followGain;
      radiusRef.current = clamp(radiusRef.current, MIN_RADIUS, MAX_RADIUS);
      if (projectionRadiusTargetRef.current !== null) {
        const smoothedRadius = smoothDampScalar(
          radiusRef.current,
          projectionRadiusTargetRef.current,
          projectionRadiusVelocityRef.current,
          0.16,
          delta,
        );
        radiusRef.current = clamp(smoothedRadius.value, MIN_RADIUS, MAX_RADIUS);
        projectionRadiusVelocityRef.current = smoothedRadius.velocity;
        if (
          Math.abs(radiusRef.current - projectionRadiusTargetRef.current) < 0.01 &&
          Math.abs(projectionRadiusVelocityRef.current) < 0.03
        ) {
          radiusRef.current = projectionRadiusTargetRef.current;
          projectionRadiusTargetRef.current = null;
          projectionRadiusVelocityRef.current = 0;
        }
      }
    }

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
      radiusRef.current = clamp(smoothedRadius.value, MIN_RADIUS, MAX_RADIUS);
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

    if ((camera as any).isOrthographicCamera) {
      projectionFramingHeightRef.current = framingHeightFromOrthographic(camera as any);
    } else {
      projectionFramingHeightRef.current = framingHeightFromPerspective(radiusRef.current, (camera as any).fov ?? 50);
    }

    const sinPhi = Math.sin(phiRef.current);
    const camOffset = camOffsetRef.current.set(
      radiusRef.current * sinPhi * Math.sin(thetaRef.current),
      radiusRef.current * Math.cos(phiRef.current),
      radiusRef.current * sinPhi * Math.cos(thetaRef.current),
    );

    const forward = forwardRef.current.copy(camOffset).multiplyScalar(-1).normalize();
    const up = upRef.current;
    if (Math.abs(forward.dot(WORLD_UP)) > POLE_DOT_THRESHOLD) {
      up.copy(poleUpRef.current);
    } else {
      up.copy(WORLD_UP);
    }

    parallelRef.current.copy(forward).multiplyScalar(up.dot(forward));
    up.sub(parallelRef.current);
    if (up.lengthSq() < 1e-8) {
      up.set(0, 0, 1);
      if (Math.abs(up.dot(forward)) > 0.95) up.set(1, 0, 0);
      parallelRef.current.copy(forward).multiplyScalar(up.dot(forward));
      up.sub(parallelRef.current);
    }
    up.normalize();

    const right = rightRef.current.crossVectors(forward, up).normalize();
    targetRef.current.addScaledVector(right, velocity.panX * delta * followGain);
    targetRef.current.addScaledVector(up, velocity.panY * delta * followGain);

    camera.up.copy(up);
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
