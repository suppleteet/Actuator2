import type {
  ActuatorPreset,
  DeltaMushSettings,
  GizmoMode,
  PhysicsTuning,
} from "./types";
import type { WorkflowMode } from "../runtime/workflow";

export const DEFAULT_PHYSICS_TUNING: PhysicsTuning = {
  solverIterations: 10,
  internalPgsIterations: 3,
  additionalSolverIterations: 6,
  bodyLinearDamping: 1.1,
  bodyAngularDamping: 1.2,
  rotationStiffness: 1.25,
  rotationVelocityBlend: 0.92,
  maxAngularSpeed: 1.0,
  pullStiffness: 240,
  pullDamping: 42,
  pullMaxForce: 4200,
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
