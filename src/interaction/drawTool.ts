import { Quaternion, Vector3 } from "three";
import { defaultPresetForActuatorType } from "../runtime/physicsPresets";
import type { ActuatorEntity, ActuatorPreset, Vec3 } from "../app/types";
import { defaultPivotForShape, normalizePrimitiveSize } from "../runtime/physicsAuthoring";

export const DRAW_WORLD_RADIUS_MIN = 0.002;
export const DRAW_WORLD_RADIUS_MAX = 2;
export const DRAW_RADIUS_MIN = 0.01;
export const DRAW_RADIUS_MAX = 1;
export const DRAW_RADIUS_STEP = 0.01;
export const DRAW_CENTERLINE_SNAP_THRESHOLD = 0.04;

export type DrawSurfaceHit = {
  point: Vec3;
  normal: Vec3;
};

export function clampDrawRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DRAW_RADIUS_MIN;
  return Math.max(DRAW_RADIUS_MIN, Math.min(DRAW_RADIUS_MAX, radius));
}

export function clampDrawWorldRadius(radius: number): number {
  if (!Number.isFinite(radius)) return DRAW_WORLD_RADIUS_MIN;
  return Math.max(DRAW_WORLD_RADIUS_MIN, Math.min(DRAW_WORLD_RADIUS_MAX, radius));
}

export function adjustDrawRadiusFromWheel(currentRadius: number, deltaY: number): number {
  const current = clampDrawRadius(currentRadius);
  if (!Number.isFinite(deltaY) || deltaY === 0) return current;
  const next = deltaY < 0 ? current + DRAW_RADIUS_STEP : current - DRAW_RADIUS_STEP;
  return clampDrawRadius(next);
}

export function computeDrawCapsulePlacement(hit: DrawSurfaceHit, radius: number): {
  center: Vec3;
  axis: Vec3;
  halfAxis: number;
  radius: number;
} {
  const clampedRadius = clampDrawWorldRadius(radius);
  const normal = new Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
  if (normal.lengthSq() < 1e-8) {
    normal.set(0, 1, 0);
  }
  normal.normalize();

  const inwardAxis = normal.clone().negate();
  const center = new Vector3(hit.point.x, hit.point.y, hit.point.z).addScaledVector(normal, -clampedRadius * 0.92);
  const halfAxis = Math.max(clampedRadius * 1.25, 0.05);

  return {
    center: { x: center.x, y: center.y, z: center.z },
    axis: { x: inwardAxis.x, y: inwardAxis.y, z: inwardAxis.z },
    halfAxis,
    radius: clampedRadius,
  };
}

export function updateCapsuleFromEndpoints(
  start: Vec3,
  end: Vec3,
  radius: number,
  previousRotation?: { x: number; y: number; z: number; w: number },
): {
  position: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  size: Vec3;
} {
  const startPoint = new Vector3(start.x, start.y, start.z);
  const endPoint = new Vector3(end.x, end.y, end.z);
  const delta = endPoint.clone().sub(startPoint);
  const distance = delta.length();

  let rotation = new Quaternion(0, 0, 0, 1);
  if (distance > 1e-6) {
    delta.normalize();
    rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta);
  } else if (previousRotation !== undefined) {
    rotation = new Quaternion(
      previousRotation.x,
      previousRotation.y,
      previousRotation.z,
      previousRotation.w,
    ).normalize();
  }

  const worldRadius = clampDrawWorldRadius(radius);
  return {
    position: { x: startPoint.x, y: startPoint.y, z: startPoint.z },
    rotation: {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    },
    size: {
      x: worldRadius * 2,
      y: distance,
      z: worldRadius * 2,
    },
  };
}

export function snapPointToMirrorCenterline(point: Vec3, threshold = DRAW_CENTERLINE_SNAP_THRESHOLD): Vec3 {
  if (Math.abs(point.x) > threshold) return { ...point };
  return { x: 0, y: point.y, z: point.z };
}

export function shouldSpawnMirrored(point: Vec3, mirrorEnabled: boolean, threshold = DRAW_CENTERLINE_SNAP_THRESHOLD): boolean {
  if (!mirrorEnabled) return false;
  return Math.abs(point.x) > threshold;
}

export function buildDrawCapsuleActuator(args: {
  id: string;
  rigId: string;
  parentId: string;
  center: Vec3;
  axis: Vec3;
  radius: number;
  halfAxis: number;
  preset?: ActuatorPreset;
}): ActuatorEntity {
  const axis = new Vector3(args.axis.x, args.axis.y, args.axis.z);
  if (axis.lengthSq() < 1e-8) {
    axis.set(0, 1, 0);
  }
  axis.normalize();

  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis);
  const center = new Vector3(args.center.x, args.center.y, args.center.z);
  const pivot = center.clone().addScaledVector(axis, -args.halfAxis);

  return {
    id: args.id,
    rigId: args.rigId,
    parentId: args.parentId,
    type: "custom",
    shape: "capsule",
    preset: args.preset ?? defaultPresetForActuatorType("custom"),
    pivot: defaultPivotForShape("capsule"),
    transform: {
      position: {
        x: pivot.x,
        y: pivot.y,
        z: pivot.z,
      },
      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: normalizePrimitiveSize({
      x: args.radius * 2,
      y: args.halfAxis * 2,
      z: args.radius * 2,
    }),
  };
}

export function mirrorPlacementAcrossX(center: Vec3, axis: Vec3): { center: Vec3; axis: Vec3 } {
  return {
    center: { x: -center.x, y: center.y, z: center.z },
    axis: { x: -axis.x, y: axis.y, z: axis.z },
  };
}
