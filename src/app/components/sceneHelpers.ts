/**
 * Small helpers used by SceneContent and related 3D scene logic.
 */

export function isFiniteVec3(value: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

export function isFiniteQuat(value: { x: number; y: number; z: number; w: number }): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}
