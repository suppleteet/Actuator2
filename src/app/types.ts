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
export type GizmoMode = "select" | "translate" | "rotate" | "scale" | "draw";
export type PivotMode = "object" | "world";
export type AppMode = "Rig" | "Pose";

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type ActuatorPivot = { mode: ActuatorPivotMode; offset: Vec3 };

/** Optional per-actuator overrides for physics (merged with preset). Persisted in scene. */
export type ActuatorPhysicsOverrides = Partial<{
  mass: number;
  drag: number;
  angularDrag: number;
  driveRotationSpring: number;
  driveRotationDamper: number;
  angularXLowLimit: number;
  angularXHighLimit: number;
  angularYLimit: number;
  angularZLimit: number;
  linearLimit: number;
  linearLimitSpring: number;
  linearLimitDamper: number;
  drivePositionSpring: number;
  drivePositionDamper: number;
}>;

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
  /** Optional physics overrides (merged with preset). */
  physicsOverrides?: ActuatorPhysicsOverrides;
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

/** Supported mesh formats for rendering (matches ImportedMeshDocument.format for fbx/glb). */
export type ActiveMeshSourceFormat = "fbx" | "glb";

/** Source asset up axis; when Z, mesh is rotated so Z-up becomes Y-up. */
export type ActiveMeshUpAxis = "Y" | "Z";

export type ActiveMeshSource = {
  id: string;
  format: ActiveMeshSourceFormat;
  meshUri: string;
  /** Used when format === "fbx". Empty when format === "glb" (uses embedded materials). */
  colorMapUri: string;
  normalMapUri: string;
  roughnessMapUri: string;
  /** Scale applied at import (default 1). Replaces legacy worldScale. */
  importScale: number;
  /** Position offset at import (default 0,0,0). Replaces legacy worldYOffset. */
  positionOffset: Vec3;
  /** Rotation offset at import, euler degrees (default 0,0,0). */
  rotationOffset: Vec3;
  /** Source asset up axis (default Y). */
  upAxis: ActiveMeshUpAxis;
  /** When true, flip normals (fixes inside-out meshes). */
  flipNormals: boolean;
};
