import { Quaternion, Vector3 } from "three";

export type SmoothDampVec3Velocity = { x: number; y: number; z: number };
export type SmoothDampQuatVelocity = { x: number; y: number; z: number; w: number };

export function smoothDampScalar(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Number.POSITIVE_INFINITY,
): { value: number; velocity: number } {
  const clampedSmoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / clampedSmoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * clampedSmoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  const adjustedTarget = current - change;

  const temp = (currentVelocity + omega * change) * deltaTime;
  let nextVelocity = (currentVelocity - omega * temp) * exp;
  let output = adjustedTarget + (change + temp) * exp;

  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    nextVelocity = deltaTime > 0 ? (output - originalTo) / deltaTime : 0;
  }

  return { value: output, velocity: nextVelocity };
}

export function smoothDampVec3(
  current: Vector3,
  target: Vector3,
  currentVelocity: SmoothDampVec3Velocity,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Number.POSITIVE_INFINITY,
): Vector3 {
  const x = smoothDampScalar(current.x, target.x, currentVelocity.x, smoothTime, deltaTime, maxSpeed);
  const y = smoothDampScalar(current.y, target.y, currentVelocity.y, smoothTime, deltaTime, maxSpeed);
  const z = smoothDampScalar(current.z, target.z, currentVelocity.z, smoothTime, deltaTime, maxSpeed);
  currentVelocity.x = x.velocity;
  currentVelocity.y = y.velocity;
  currentVelocity.z = z.velocity;
  return new Vector3(x.value, y.value, z.value);
}

export function smoothDampQuat(
  current: Quaternion,
  target: Quaternion,
  currentVelocity: SmoothDampQuatVelocity,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Number.POSITIVE_INFINITY,
): Quaternion {
  let targetX = target.x;
  let targetY = target.y;
  let targetZ = target.z;
  let targetW = target.w;
  if (current.dot(target) < 0) {
    targetX = -targetX;
    targetY = -targetY;
    targetZ = -targetZ;
    targetW = -targetW;
  }

  const x = smoothDampScalar(current.x, targetX, currentVelocity.x, smoothTime, deltaTime, maxSpeed);
  const y = smoothDampScalar(current.y, targetY, currentVelocity.y, smoothTime, deltaTime, maxSpeed);
  const z = smoothDampScalar(current.z, targetZ, currentVelocity.z, smoothTime, deltaTime, maxSpeed);
  const w = smoothDampScalar(current.w, targetW, currentVelocity.w, smoothTime, deltaTime, maxSpeed);
  currentVelocity.x = x.velocity;
  currentVelocity.y = y.velocity;
  currentVelocity.z = z.velocity;
  currentVelocity.w = w.velocity;
  return new Quaternion(x.value, y.value, z.value, w.value).normalize();
}
