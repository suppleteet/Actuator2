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
    mass: 2.5,
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
    driveRotationSpring: 8000,
    driveRotationDamper: 50,
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
    drivePositionSpring: 3500,
    drivePositionDamper: 30,
    driveRotationSpring: 10000,
    driveRotationDamper: 50,
  },
  SpinePelvis: {
    mass: 2.5,
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
    driveRotationSpring: 8000,
    driveRotationDamper: 50,
  },
  NeckHead: {
    mass: 2.5,
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
    driveRotationSpring: 2000,
    driveRotationDamper: 10,
  },
  ArmLeg: {
    mass: 2.5,
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
    driveRotationSpring: 2000,
    driveRotationDamper: 10,
  },
  ElbowKnee: {
    mass: 2.5,
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
    driveRotationSpring: 2000,
    driveRotationDamper: 10,
  },
  Finger: {
    mass: 0.25,
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
    driveRotationSpring: 2000,
    driveRotationDamper: 10,
  },
  MuscleJiggle: {
    mass: 0.5,
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
    mass: 0.5,
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
    mass: 0.25,
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
    mass: 0.5,
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
  return UNITY_ACTUATOR_PRESET_SETTINGS[preset];
}

export function getActuatorMassFromPreset(actuator: MinimalActuatorLike): number {
  return getActuatorPresetSettings(actuator).mass;
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
