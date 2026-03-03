import { Quaternion, Vector3 } from "three";

export type ActuatorShape = "capsule" | "sphere" | "box";
export type ActuatorPivotMode = "capStart" | "center";
export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export type ActuatorPivot = {
  mode: ActuatorPivotMode;
  offset: Vec3;
};

export type ActuatorPrimitiveLike = {
  shape: ActuatorShape;
  pivot: ActuatorPivot;
  size: Vec3;
  transform: {
    position: Vec3;
    rotation: Quat;
  };
};

export const MIN_SCALE = 0.02;
export const MIN_PRIMITIVE_EXTENT = 0.02;
export const MIN_CAPSULE_HALF_AXIS = 0.01;

export function normalizePositiveScale(scale: Vec3): Vec3 {
  return {
    x: Math.max(Math.abs(scale.x), MIN_SCALE),
    y: Math.max(Math.abs(scale.y), MIN_SCALE),
    z: Math.max(Math.abs(scale.z), MIN_SCALE),
  };
}

export function clampPrimitiveExtent(value: number): number {
  return Math.max(Math.abs(value), MIN_PRIMITIVE_EXTENT);
}

export function normalizePrimitiveSize(size: Vec3): Vec3 {
  return {
    x: clampPrimitiveExtent(size.x),
    y: clampPrimitiveExtent(size.y),
    z: clampPrimitiveExtent(size.z),
  };
}

export function defaultPivotForShape(shape: ActuatorShape): ActuatorPivot {
  return {
    mode: shape === "capsule" ? "capStart" : "center",
    offset: { x: 0, y: 0, z: 0 },
  };
}

export function getCapsuleHalfAxis(size: Vec3): number {
  return Math.max(size.y * 0.5, MIN_CAPSULE_HALF_AXIS);
}

export function getActuatorRadius(actuator: Pick<ActuatorPrimitiveLike, "shape" | "size">): number {
  if (actuator.shape === "sphere") {
    return Math.max(Math.max(actuator.size.x, actuator.size.y, actuator.size.z) * 0.5, MIN_PRIMITIVE_EXTENT);
  }
  if (actuator.shape === "capsule") {
    return Math.max(Math.max(actuator.size.x, actuator.size.z) * 0.5, MIN_PRIMITIVE_EXTENT);
  }
  return 0;
}

export function getActuatorPivotWorldPosition(actuator: Pick<ActuatorPrimitiveLike, "pivot" | "transform">): Vector3 {
  const offset = new Vector3(actuator.pivot.offset.x, actuator.pivot.offset.y, actuator.pivot.offset.z).applyQuaternion(
    new Quaternion(
      actuator.transform.rotation.x,
      actuator.transform.rotation.y,
      actuator.transform.rotation.z,
      actuator.transform.rotation.w,
    ),
  );
  return new Vector3(
    actuator.transform.position.x + offset.x,
    actuator.transform.position.y + offset.y,
    actuator.transform.position.z + offset.z,
  );
}

export function getActuatorPrimitiveCenter(actuator: ActuatorPrimitiveLike): Vector3 {
  const pivotWorld = getActuatorPivotWorldPosition(actuator);
  if (actuator.shape !== "capsule" || actuator.pivot.mode === "center") return pivotWorld;

  const up = new Vector3(0, 1, 0).applyQuaternion(
    new Quaternion(
      actuator.transform.rotation.x,
      actuator.transform.rotation.y,
      actuator.transform.rotation.z,
      actuator.transform.rotation.w,
    ),
  );
  return pivotWorld.addScaledVector(up, getCapsuleHalfAxis(actuator.size));
}

export function scalePrimitiveSizeFromGizmoDelta(
  size: Vec3,
  deltaScale: Vec3,
  shape?: ActuatorShape,
): Vec3 {
  const scale = normalizePositiveScale(deltaScale);
  if (shape === "capsule") {
    const deltaFromOneX = Math.abs(scale.x - 1);
    const deltaFromOneZ = Math.abs(scale.z - 1);
    const radialScale = deltaFromOneX >= deltaFromOneZ ? scale.x : scale.z;
    return normalizePrimitiveSize({
      x: size.x * radialScale,
      y: size.y * scale.y,
      z: size.z * radialScale,
    });
  }
  return normalizePrimitiveSize({
    x: size.x * scale.x,
    y: size.y * scale.y,
    z: size.z * scale.z,
  });
}

export function worldPointToActuatorLocal(anchorWorld: Vector3, actuatorCenterWorld: Vector3, actuatorRotation: Quat): Vec3 {
  const inverseRotation = new Quaternion(
    actuatorRotation.x,
    actuatorRotation.y,
    actuatorRotation.z,
    actuatorRotation.w,
  ).invert();
  const local = anchorWorld.clone().sub(actuatorCenterWorld).applyQuaternion(inverseRotation);
  return { x: local.x, y: local.y, z: local.z };
}
