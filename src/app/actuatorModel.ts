import { Matrix4, Quaternion, Vector3 } from "three";
import { defaultPivotForShape } from "../runtime/physicsAuthoring";
import { defaultPresetForActuatorType } from "../runtime/physicsPresets";
import type { ActuatorEntity, Quat, Vec3 } from "./types";

export function composeMatrix(position: Vec3, rotation: Quat, scale: Vec3): Matrix4 {
  return new Matrix4().compose(
    new Vector3(position.x, position.y, position.z),
    new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    new Vector3(scale.x, scale.y, scale.z),
  );
}

export function rootIdForRig(rigId: string): string {
  return `${rigId}_act_root`;
}

export function createRootActuator(rigId: string, xOffset = 0): ActuatorEntity {
  const rootSize = { x: 0.6, y: 0, z: 0.6 };
  const rootHalfAxis = rootSize.y * 0.5;
  return {
    id: rootIdForRig(rigId),
    rigId,
    parentId: null,
    type: "root",
    shape: "capsule",
    preset: defaultPresetForActuatorType("root"),
    pivot: defaultPivotForShape("capsule"),
    transform: {
      // Capsule default pivot is start-cap center, not primitive center.
      position: { x: xOffset, y: 1 - rootHalfAxis, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
    size: rootSize,
  };
}
