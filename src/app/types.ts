export type DragMode = "orbit" | "pan" | "zoom" | null;
export type ActuatorShape = "capsule" | "sphere" | "box";
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
export type ActuatorPivotMode = "capStart" | "center";
export type GizmoMode = "select" | "translate" | "rotate" | "scale";
export type PivotMode = "object" | "world";
export type AppMode = "Rig" | "Pose";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type ActuatorPivot = { mode: ActuatorPivotMode; offset: Vec3 };

export type ActuatorEntity = {
  id: string;
  rigId: string;
  parentId: string | null;
  type: "root" | "custom";
  shape: ActuatorShape;
  preset?: ActuatorPreset;
  pivot: ActuatorPivot;
  transform: {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
  size: Vec3;
};

export type EditorState = {
  actuators: ActuatorEntity[];
  selectedRigId: string;
  selectedActuatorId: string | null;
  selectedActuatorIds: string[];
};

export type SkinningStats = {
  vertexCount: number;
  capsuleCount: number;
  averageWeight: number;
};

export type DeltaMushSettings = {
  iterations: number;
  strength: number;
};

export type PhysicsTuning = {
  solverIterations: number;
  internalPgsIterations: number;
  additionalSolverIterations: number;
  bodyLinearDamping: number;
  bodyAngularDamping: number;
  rotationStiffness: number;
  rotationVelocityBlend: number;
  maxAngularSpeed: number;
  pullStiffness: number;
  pullDamping: number;
  pullMaxForce: number;
};

export type SkinningComputationStatus = {
  busy: boolean;
  revision: number;
  completed: boolean;
  bindingHash: string | null;
  meshHash: string | null;
};

export type ActuatorTransformSnapshot = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
};

export type ActiveMeshSource = {
  id: string;
  meshUri: string;
  colorMapUri: string;
  normalMapUri: string;
  roughnessMapUri: string;
  worldScale: number;
  worldYOffset: number;
};
