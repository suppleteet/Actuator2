export type Vec3 = { x: number; y: number; z: number };

export type ActuatorForFocus = {
  id: string;
  transform: {
    position: Vec3;
  };
  size: Vec3;
};

export type FocusRequest = {
  center: Vec3;
  fitRadius: number;
};

export function buildFocusRequestFromActuators(actuators: ActuatorForFocus[], ids: string[]): FocusRequest | null {
  const focusActuators = actuators.filter((actuator) => ids.includes(actuator.id));
  if (focusActuators.length === 0) return null;

  const center = { x: 0, y: 0, z: 0 };
  for (const actuator of focusActuators) {
    center.x += actuator.transform.position.x;
    center.y += actuator.transform.position.y;
    center.z += actuator.transform.position.z;
  }
  center.x /= focusActuators.length;
  center.y /= focusActuators.length;
  center.z /= focusActuators.length;

  let fitRadius = 0.25;
  for (const actuator of focusActuators) {
    const dx = actuator.transform.position.x - center.x;
    const dy = actuator.transform.position.y - center.y;
    const dz = actuator.transform.position.z - center.z;
    const baseDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const localExtent = Math.max(actuator.size.x, actuator.size.y, actuator.size.z) * 0.5;
    fitRadius = Math.max(fitRadius, baseDistance + localExtent);
  }

  return {
    center,
    fitRadius,
  };
}
