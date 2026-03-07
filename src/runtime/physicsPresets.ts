export type ActuatorPreset =
  | "Default"
  | "Root"
  | "SpinePelvis"
  | "NeckHead"
  | "ArmLeg"
  | "ElbowKnee"
  | "Finger"
  | "MuscleJiggle"
  | "FatJiggle"
  | "Dangly"
  | "Floppy";

export type JointLocking = "Locked" | "Limited" | "Free";

export type ActuatorPresetSettings = {
  mass: number;
  drag: number;
  angularDrag: number;
  xMotion: JointLocking;
  yMotion: JointLocking;
  zMotion: JointLocking;
  angularXMotion: JointLocking;
  angularYMotion: JointLocking;
  angularZMotion: JointLocking;
  linearLimit: number;
  linearLimitSpring: number;
  linearLimitDamper: number;
  angularXLowLimit: number;
  angularXHighLimit: number;
  angularXLimitSpring: number;
  angularXLimitDamper: number;
  angularYLimit: number;
  angularZLimit: number;
  angularYZLimitSpring: number;
  angularYZLimitDamper: number;
  drivePositionSpring: number;
  drivePositionDamper: number;
  driveRotationSpring: number;
  driveRotationDamper: number;
};

type MinimalActuatorLike = {
  type: "root" | "custom";
  preset?: ActuatorPreset;
  physicsOverrides?: Partial<ActuatorPresetSettings>;
};

export type RuntimeDriveSettings = {
  positionStiffness: number;
  positionDamping: number;
  rotationStiffness: number;
  rotationVelocityBlend: number;
  maxAngularSpeed: number;
};

const FIXED_TIMESTEP_SEC = 1 / 60;
const ROTATION_SPRING_TO_VELOCITY = 14 / 8000;
const ROTATION_DAMPER_TO_BLEND_RATE = 0.32;
const POSITION_SPRING_TO_FORCE = 180 / 3500;
const POSITION_DAMPER_TO_FORCE = 46 / 30;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export const UNITY_ACTUATOR_PRESET_SETTINGS: Record<ActuatorPreset, ActuatorPresetSettings> = {
  Default: {
    mass: 1.9,
    drag: 0.25,
    angularDrag: 0.05,
    xMotion: "Locked",
    yMotion: "Locked",
    zMotion: "Locked",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -30,
    angularXHighLimit: 30,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 60,
    angularZLimit: 60,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 14000,
    driveRotationDamper: 62,
  },
  Root: {
    mass: 2.5,
    drag: 5,
    angularDrag: 0.05,
    xMotion: "Limited",
    yMotion: "Limited",
    zMotion: "Limited",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 1000,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -30,
    angularXHighLimit: 30,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 60,
    angularZLimit: 60,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 350,
    drivePositionDamper: 62,
    driveRotationSpring: 16000,
    driveRotationDamper: 65,
  },
  SpinePelvis: {
    mass: 1.9,
    drag: 0.25,
    angularDrag: 0.05,
    xMotion: "Locked",
    yMotion: "Locked",
    zMotion: "Locked",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -30,
    angularXHighLimit: 30,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 60,
    angularZLimit: 60,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 14000,
    driveRotationDamper: 62,
  },
  NeckHead: {
    mass: 1.9,
    drag: 0.25,
    angularDrag: 0.05,
    xMotion: "Locked",
    yMotion: "Locked",
    zMotion: "Locked",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -30,
    angularXHighLimit: 30,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 60,
    angularZLimit: 60,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 6200,
    driveRotationDamper: 30,
  },
  ArmLeg: {
    mass: 1.2,
    drag: 0.25,
    angularDrag: 0.05,
    xMotion: "Locked",
    yMotion: "Locked",
    zMotion: "Locked",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -30,
    angularXHighLimit: 30,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 60,
    angularZLimit: 60,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 6200,
    driveRotationDamper: 30,
  },
  ElbowKnee: {
    mass: 1.2,
    drag: 0.25,
    angularDrag: 0.05,
    xMotion: "Locked",
    yMotion: "Locked",
    zMotion: "Locked",
    angularXMotion: "Limited",
    angularYMotion: "Locked",
    angularZMotion: "Locked",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -10,
    angularXHighLimit: 90,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 0,
    angularZLimit: 0,
    angularYZLimitSpring: 0,
    angularYZLimitDamper: 0,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 6200,
    driveRotationDamper: 30,
  },
  Finger: {
    mass: 0.18,
    drag: 0.1,
    angularDrag: 0.05,
    xMotion: "Locked",
    yMotion: "Locked",
    zMotion: "Locked",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -30,
    angularXHighLimit: 30,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 60,
    angularZLimit: 60,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 4000,
    driveRotationDamper: 20,
  },
  MuscleJiggle: {
    mass: 0.38,
    drag: 0.025,
    angularDrag: 0.025,
    xMotion: "Limited",
    yMotion: "Limited",
    zMotion: "Limited",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0.25,
    linearLimitSpring: 1000,
    linearLimitDamper: 50,
    angularXLowLimit: -15,
    angularXHighLimit: 15,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 30,
    angularZLimit: 30,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 1000,
    drivePositionDamper: 1,
    driveRotationSpring: 2000,
    driveRotationDamper: 5,
  },
  FatJiggle: {
    mass: 0.38,
    drag: 0.025,
    angularDrag: 0.025,
    xMotion: "Limited",
    yMotion: "Limited",
    zMotion: "Limited",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0.25,
    linearLimitSpring: 1000,
    linearLimitDamper: 50,
    angularXLowLimit: -15,
    angularXHighLimit: 15,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 30,
    angularZLimit: 30,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 500,
    drivePositionDamper: 2,
    driveRotationSpring: 1000,
    driveRotationDamper: 3,
  },
  Dangly: {
    mass: 0.18,
    drag: 0,
    angularDrag: 0.001,
    xMotion: "Limited",
    yMotion: "Limited",
    zMotion: "Limited",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -60,
    angularXHighLimit: 60,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 120,
    angularZLimit: 120,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 0.5,
    driveRotationDamper: 0.1,
  },
  Floppy: {
    mass: 0.38,
    drag: 0,
    angularDrag: 0.025,
    xMotion: "Limited",
    yMotion: "Limited",
    zMotion: "Limited",
    angularXMotion: "Limited",
    angularYMotion: "Limited",
    angularZMotion: "Limited",
    linearLimit: 0,
    linearLimitSpring: 0,
    linearLimitDamper: 0,
    angularXLowLimit: -20,
    angularXHighLimit: 20,
    angularXLimitSpring: 500,
    angularXLimitDamper: 50,
    angularYLimit: 40,
    angularZLimit: 40,
    angularYZLimitSpring: 500,
    angularYZLimitDamper: 50,
    drivePositionSpring: 0,
    drivePositionDamper: 0,
    driveRotationSpring: 5,
    driveRotationDamper: 0.1,
  },
};

export function defaultPresetForActuatorType(type: "root" | "custom"): ActuatorPreset {
  return type === "root" ? "Root" : "Default";
}

export function getActuatorPresetSettings(actuator: MinimalActuatorLike): ActuatorPresetSettings {
  const preset = actuator.preset ?? defaultPresetForActuatorType(actuator.type);
  const base = UNITY_ACTUATOR_PRESET_SETTINGS[preset];
  const overrides = actuator.physicsOverrides;
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return { ...base, ...overrides };
}

export function getActuatorMassFromPreset(actuator: MinimalActuatorLike): number {
  return getActuatorPresetSettings(actuator).mass;
}

/** Reference collider volume (capsule r≈0.175, h=0.8) so preset mass applies at that size. */
const REFERENCE_VOLUME = 0.099;
const MIN_MASS = 0.01;
const MAX_MASS = 500;

type ActuatorWithShape = MinimalActuatorLike & { shape: "capsule" | "sphere" | "box"; size: { x: number; y: number; z: number } };

/**
 * Mass scaled by collider volume so that smaller segments weigh less and the root
 * isn't overpowered by many small limbs. Uses preset mass as the base for a
 * "reference"-sized collider. If physicsOverrides.mass is set, that value is
 * used directly (clamped) as the body mass.
 */
export function getActuatorMass(
  actuator: ActuatorWithShape,
  getVolume: (a: Pick<ActuatorWithShape, "shape" | "size">) => number,
): number {
  const overrides = (actuator as MinimalActuatorLike).physicsOverrides;
  if (overrides?.mass != null && Number.isFinite(overrides.mass)) {
    return Math.max(MIN_MASS, Math.min(MAX_MASS, overrides.mass));
  }
  const baseMass = getActuatorPresetSettings(actuator).mass;
  const volume = getVolume(actuator);
  const scale = volume / REFERENCE_VOLUME;
  return Math.max(MIN_MASS, Math.min(MAX_MASS, baseMass * scale));
}

export function getRuntimeDriveFromPreset(actuator: MinimalActuatorLike): RuntimeDriveSettings {
  const preset = getActuatorPresetSettings(actuator);
  const positionStiffness = Math.max(0, preset.drivePositionSpring * POSITION_SPRING_TO_FORCE);
  const positionDamping = Math.max(0, preset.drivePositionDamper * POSITION_DAMPER_TO_FORCE);
  const rotationStiffness = Math.max(0, preset.driveRotationSpring * ROTATION_SPRING_TO_VELOCITY);
  const rotationVelocityBlend = clamp01(
    1 - Math.exp(-(Math.max(0, preset.driveRotationDamper) * ROTATION_DAMPER_TO_BLEND_RATE) * FIXED_TIMESTEP_SEC),
  );
  const maxAngularSpeed = Math.max(1.8, rotationStiffness * 1.15);
  return {
    positionStiffness,
    positionDamping,
    rotationStiffness,
    rotationVelocityBlend,
    maxAngularSpeed,
  };
}
