import type {
  ActuatorPreset,
  DeltaMushSettings,
  GizmoMode,
  PhysicsTuning,
} from "./types";
import type { WorkflowMode } from "../runtime/workflow";

/** Physics constants for collision and contact (used by SceneContent). */
export const PHYSICS_COLLISION = {
  /** Actuator/floor restitution: 0 = no bounce, soft contact. */
  restitution: 0,
  /** Actuator friction (tangential resistance). */
  friction: 0.5,
  /** Floor friction for grip so feet don't slide. */
  floorFriction: 1.6,
} as const;

export const DEFAULT_PHYSICS_TUNING: PhysicsTuning = {
  solverIterations: 10,
  internalPgsIterations: 3,
  additionalSolverIterations: 6,
  bodyLinearDamping: 0.75,
  bodyAngularDamping: 0.55,
  rotationStiffness: 1.9,
  rotationVelocityBlend: 0.96,
  maxAngularSpeed: 1.2,
  pullStiffness: 240,
  pullDamping: 42,
  pullMaxForce: 4200,
  rootMoverStiffnessScale: 0.5,
  rootMoverDampingScale: 1,
  massScale: 0.45,
  driveStiffnessScale: 1.6,
  driveDefaultMultiplier: 2.2,
  contactNaturalFrequency: 14,
  allowedLinearError: 0.002,
};

export const DEFAULT_DELTA_MUSH_SETTINGS: DeltaMushSettings = {
  iterations: 8,
  strength: 0.75,
};

export const ACTUATOR_PRESET_OPTIONS: ActuatorPreset[] = [
  "Default",
  "Root",
  "SpinePelvis",
  "NeckHead",
  "ArmLeg",
  "ElbowKnee",
  "Finger",
  "MuscleJiggle",
  "FatJiggle",
  "Dangly",
  "Floppy",
];

export const MIXED_PRESET_VALUE = "__mixed__";

/** Gizmo mode used when in Pose (grab tool). */
export const POSE_TOOL_MODE: GizmoMode = "translate";

export const SCENE_PLAYBACK_FPS = 60;

/** Debug: localStorage key for auto-restore of drawn actuators on reload. */
export const SCENE_AUTOSAVE_STORAGE_KEY = "actuator2.scene.autosave";

/** localStorage key for dock layout (panel positions/sizes) so reload restores UI. */
export const UI_LAYOUT_STORAGE_KEY = "actuator2.ui.layout";

export const DEFAULT_WORKFLOW_MODE: WorkflowMode = "Rigging";
