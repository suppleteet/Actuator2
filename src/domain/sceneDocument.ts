export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };
export type ActuatorPivotDocument = {
  mode: "capStart" | "center";
  offsetLocal: Vec3;
};

export type ActuatorNodeDocument = {
  id: string;
  parentId: string | null;
  type: string;
  shape: "capsule" | "sphere" | "box";
  preset?: string;
  pivot: ActuatorPivotDocument;
  transform: {
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
  };
  size: Vec3;
  joint: object;
  physics: object;
  influence: object;
};

export type CharacterDocument = {
  id: string;
  name: string;
  mesh: {
    meshId: string;
    uri: string;
    nodePath?: string;
  };
  rig: {
    rootActuatorId: string;
    actuators: ActuatorNodeDocument[];
  };
  skinBinding: {
    version: string;
    solver: string;
    meshHash: string;
    bindingHash: string;
    generatedAtUtc: string;
    influenceCount: number;
  };
  channels: {
    look: { yaw: number; pitch: number };
    blink: { left: number; right: number };
    custom: Record<string, number>;
  };
};

export type SceneDocument = {
  version: string;
  sceneId: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  characters: CharacterDocument[];
  playback: {
    fps: number;
    durationSec: number;
    activeClipId: string | null;
  };
  metadata?: Record<string, string>;
};

function isFiniteVec3(value: Vec3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isFiniteQuat(value: Quat): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z) && Number.isFinite(value.w);
}

function hasCycle(actuators: ActuatorNodeDocument[]): boolean {
  const byId = new Map(actuators.map((actuator) => [actuator.id, actuator]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(id: string): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;

    visiting.add(id);
    const node = byId.get(id);
    const parentId = node?.parentId ?? null;
    if (parentId !== null && byId.has(parentId) && visit(parentId)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  for (const actuator of actuators) {
    if (visit(actuator.id)) return true;
  }
  return false;
}

export function validateSceneDocument(scene: SceneDocument): string[] {
  const errors: string[] = [];

  if (scene.version !== "0.1.0") errors.push("version must be 0.1.0");
  if (!scene.sceneId) errors.push("sceneId is required");
  if (!Array.isArray(scene.characters) || scene.characters.length === 0) errors.push("characters must be non-empty");

  for (const character of scene.characters) {
    const actuators = character.rig.actuators;
    if (!actuators.find((actuator) => actuator.id === character.rig.rootActuatorId)) {
      errors.push(`character ${character.id}: rootActuatorId missing in actuators`);
    }

    const roots = actuators.filter((actuator) => actuator.parentId === null);
    if (roots.length !== 1) {
      errors.push(`character ${character.id}: exactly one parentId=null root required`);
    }

    if (hasCycle(actuators)) {
      errors.push(`character ${character.id}: actuator graph must be acyclic`);
    }

    for (const actuator of actuators) {
      if (actuator.pivot === undefined || actuator.pivot === null) {
        errors.push(`actuator ${actuator.id}: pivot is required`);
      } else {
        if (actuator.pivot.mode !== "capStart" && actuator.pivot.mode !== "center") {
          errors.push(`actuator ${actuator.id}: invalid pivot mode`);
        }
        if (!isFiniteVec3(actuator.pivot.offsetLocal)) {
          errors.push(`actuator ${actuator.id}: invalid pivot offsetLocal`);
        }
      }
      if (!isFiniteVec3(actuator.transform.position)) errors.push(`actuator ${actuator.id}: invalid position`);
      if (!isFiniteQuat(actuator.transform.rotation)) errors.push(`actuator ${actuator.id}: invalid rotation`);
      if (!isFiniteVec3(actuator.transform.scale)) errors.push(`actuator ${actuator.id}: invalid scale`);
      if (!isFiniteVec3(actuator.size)) errors.push(`actuator ${actuator.id}: invalid size`);
    }
  }

  return errors;
}

export function stableSerializeScene(scene: SceneDocument): string {
  const normalized: SceneDocument = {
    ...scene,
    characters: scene.characters
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((character) => ({
        ...character,
        rig: {
          ...character.rig,
          actuators: character.rig.actuators.slice().sort((a, b) => a.id.localeCompare(b.id)),
        },
      })),
  };
  return JSON.stringify(normalized, null, 2);
}
