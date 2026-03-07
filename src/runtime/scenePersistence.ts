import type { ActuatorEntity, ActuatorPhysicsOverrides, ActuatorPreset, EditorState } from "../app/types";
import {
  stableSerializeScene,
  validateSceneDocument,
  type CharacterDocument,
  type SceneDocument,
} from "../domain/sceneDocument";
import type { WorkflowMode } from "./workflow";

export const SCENE_ENVELOPE_FORMAT = "actuator2.scene" as const;
export const SCENE_ENVELOPE_VERSION = "1.0.0" as const;
export const SCENE_ENVELOPE_MIN_READER_VERSION = "1.0.0" as const;

export type ImportedMeshFormat = "fbx" | "glb" | "obj" | "unknown";

/** Source asset up axis; default Y. When Z, mesh is rotated so Z-up becomes Y-up. */
export type ImportedMeshUpAxis = "Y" | "Z";

export type ImportedMeshDocument = {
  id: string;
  format: ImportedMeshFormat;
  displayName: string;
  sourceUri: string;
  importedAtUtc: string;
  /** Source asset up axis (default Y). */
  upAxis?: ImportedMeshUpAxis;
  /** Scale applied at import (default 1). */
  importScale?: number;
  /** Position offset applied at import (default 0,0,0). */
  positionOffset?: { x: number; y: number; z: number };
  /** Rotation offset at import, euler degrees (default 0,0,0). */
  rotationOffset?: { x: number; y: number; z: number };
  /** Optional texture URIs (e.g. from same folder at import). When set, used for FBX; otherwise fallback. */
  colorMapUri?: string;
  normalMapUri?: string;
  roughnessMapUri?: string;
  /** When true, flip normals (fixes inside-out meshes). */
  flipNormals?: boolean;
};

export type SceneEnvelope = {
  format: typeof SCENE_ENVELOPE_FORMAT;
  envelopeVersion: typeof SCENE_ENVELOPE_VERSION;
  compatibility: {
    minReaderVersion: typeof SCENE_ENVELOPE_MIN_READER_VERSION;
    policy: "reject-unsupported";
  };
  savedAtUtc: string;
  workflowMode: WorkflowMode;
  importedMeshes: ImportedMeshDocument[];
  scene: SceneDocument;
};

export type SceneSnapshot = {
  sceneId: string;
  createdAtUtc: string;
  workflowMode: WorkflowMode;
  editorState: EditorState;
  importedMeshes: ImportedMeshDocument[];
  playback: {
    fps: number;
    durationSec: number;
    activeClipId: string | null;
  };
  metadata?: Record<string, string>;
};

export type SceneLoadErrorCode = "unsupported_version" | "invalid_payload" | "invalid_scene";

export class SceneLoadError extends Error {
  readonly code: SceneLoadErrorCode;

  constructor(code: SceneLoadErrorCode, message: string) {
    super(message);
    this.name = "SceneLoadError";
    this.code = code;
  }
}

export type SceneEnvelopeMigrator = (raw: unknown) => SceneEnvelope | null;

const KNOWN_PRESETS: readonly ActuatorPreset[] = [
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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nowUtcIso(): string {
  return new Date().toISOString();
}

function inferMeshFormatFromPath(path: string): ImportedMeshFormat {
  const normalized = path.trim().toLowerCase();
  if (normalized.endsWith(".fbx")) return "fbx";
  if (normalized.endsWith(".glb") || normalized.endsWith(".gltf")) return "glb";
  if (normalized.endsWith(".obj")) return "obj";
  return "unknown";
}

const DEFAULT_POSITION_OFFSET = { x: 0, y: 0, z: 0 };
const DEFAULT_ROTATION_OFFSET = { x: 0, y: 0, z: 0 };

function normalizeImportedMeshes(meshes: ImportedMeshDocument[]): ImportedMeshDocument[] {
  return meshes
    .map((mesh): ImportedMeshDocument => {
      const upAxis: ImportedMeshUpAxis = mesh.upAxis === "Z" ? "Z" : "Y";
      const out: ImportedMeshDocument = {
        id: mesh.id,
        format: mesh.format,
        displayName: mesh.displayName,
        sourceUri: mesh.sourceUri,
        importedAtUtc: mesh.importedAtUtc,
        upAxis,
        importScale: Number.isFinite(mesh.importScale) ? mesh.importScale! : 1,
        positionOffset:
          mesh.positionOffset &&
          Number.isFinite(mesh.positionOffset.x) &&
          Number.isFinite(mesh.positionOffset.y) &&
          Number.isFinite(mesh.positionOffset.z)
            ? mesh.positionOffset
            : DEFAULT_POSITION_OFFSET,
        rotationOffset:
          mesh.rotationOffset &&
          Number.isFinite(mesh.rotationOffset.x) &&
          Number.isFinite(mesh.rotationOffset.y) &&
          Number.isFinite(mesh.rotationOffset.z)
            ? mesh.rotationOffset
            : DEFAULT_ROTATION_OFFSET,
      };
      if (typeof mesh.colorMapUri === "string" && mesh.colorMapUri.length > 0) out.colorMapUri = mesh.colorMapUri;
      if (typeof mesh.normalMapUri === "string" && mesh.normalMapUri.length > 0) out.normalMapUri = mesh.normalMapUri;
      if (typeof mesh.roughnessMapUri === "string" && mesh.roughnessMapUri.length > 0) out.roughnessMapUri = mesh.roughnessMapUri;
      if (mesh.flipNormals === true) out.flipNormals = true;
      return out;
    })
    .sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));
}

function buildFallbackImportedMeshesFromScene(scene: SceneDocument): ImportedMeshDocument[] {
  const seen = new Set<string>();
  const meshes: ImportedMeshDocument[] = [];
  for (const character of scene.characters) {
    const meshId = character.mesh.meshId || `mesh_${character.id}`;
    if (seen.has(meshId)) continue;
    seen.add(meshId);
    meshes.push({
      id: meshId,
      format: inferMeshFormatFromPath(character.mesh.uri),
      displayName: meshId,
      sourceUri: character.mesh.uri,
      importedAtUtc: scene.updatedAtUtc,
    });
  }
  return normalizeImportedMeshes(meshes);
}

function encodeCharacterId(rigId: string): string {
  return `char_${rigId}`;
}

function decodeRigId(characterId: string, index: number): string {
  if (characterId.startsWith("char_") && characterId.length > 5) {
    return characterId.slice(5);
  }
  return `rig_${(index + 1).toString().padStart(3, "0")}`;
}

function buildSceneDocumentFromSnapshot(snapshot: SceneSnapshot, updatedAtUtc: string): SceneDocument {
  const rigIds = [...new Set(snapshot.editorState.actuators.map((actuator) => actuator.rigId))].sort();
  if (rigIds.length === 0) {
    throw new SceneLoadError("invalid_scene", "Cannot serialize scene: no rigs were found.");
  }

  const primaryMesh = snapshot.importedMeshes[0] ?? {
    id: "mesh_chad",
    format: "fbx" as ImportedMeshFormat,
    displayName: "mesh_chad",
    sourceUri: "assets/chad/Chad.fbx",
    importedAtUtc: updatedAtUtc,
  };

  const characters: CharacterDocument[] = rigIds.map((rigId) => {
    const actuators = snapshot.editorState.actuators
      .filter((actuator) => actuator.rigId === rigId)
      .sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));

    if (actuators.length === 0) {
      throw new SceneLoadError("invalid_scene", `Cannot serialize rig ${rigId}: no actuators found.`);
    }

    const root = actuators.find((actuator) => actuator.parentId === null) ?? actuators[0];

    return {
      id: encodeCharacterId(rigId),
      name: rigId,
      mesh: {
        meshId: primaryMesh.id,
        uri: primaryMesh.sourceUri,
      },
      rig: {
        rootActuatorId: root.id,
        actuators: actuators.map((actuator) => actuatorToDocumentNode(actuator)),
      },
      skinBinding: {
        version: "0.1",
        solver: "closestVolume",
        meshHash: `mesh:${primaryMesh.id}`,
        bindingHash: `bind:${rigId}:${actuators.length}`,
        generatedAtUtc: updatedAtUtc,
        influenceCount: actuators.length,
      },
      channels: {
        look: { yaw: 0, pitch: 0 },
        blink: { left: 0, right: 0 },
        custom: {},
      },
    };
  });

  return {
    version: "0.1.0",
    sceneId: snapshot.sceneId,
    createdAtUtc: snapshot.createdAtUtc,
    updatedAtUtc,
    characters,
    playback: {
      fps: snapshot.playback.fps,
      durationSec: snapshot.playback.durationSec,
      activeClipId: snapshot.playback.activeClipId,
    },
    metadata: snapshot.metadata ?? {},
  };
}

function actuatorToDocumentNode(actuator: ActuatorEntity) {
  return {
    id: actuator.id,
    parentId: actuator.parentId,
    type: actuator.type,
    shape: actuator.shape,
    preset: actuator.preset,
    pivot: {
      mode: actuator.pivot.mode,
      offsetLocal: {
        x: actuator.pivot.offset.x,
        y: actuator.pivot.offset.y,
        z: actuator.pivot.offset.z,
      },
    },
    transform: {
      position: { ...actuator.transform.position },
      rotation: { ...actuator.transform.rotation },
      scale: { ...actuator.transform.scale },
    },
    size: { ...actuator.size },
    joint: {},
    physics: actuator.physicsOverrides ? { ...actuator.physicsOverrides } : {},
    influence: {},
  };
}

function sceneDocumentToEditorState(scene: SceneDocument): EditorState {
  const characters = scene.characters.slice().sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));
  const actuators: ActuatorEntity[] = [];

  characters.forEach((character, index) => {
    const rigId = decodeRigId(character.id, index);
    const sorted = character.rig.actuators.slice().sort((lhs, rhs) => lhs.id.localeCompare(rhs.id));
    for (const actuator of sorted) {
      const physicsOverrides = actuator.physics && typeof actuator.physics === "object" && !Array.isArray(actuator.physics)
        ? coercePhysicsOverrides(actuator.physics as Record<string, unknown>)
        : undefined;
      actuators.push({
        id: actuator.id,
        rigId,
        parentId: actuator.parentId,
        type: actuator.parentId === null ? "root" : "custom",
        shape: actuator.shape,
        preset: coerceActuatorPreset(actuator.preset),
        pivot: {
          mode: actuator.pivot.mode,
          offset: {
            x: actuator.pivot.offsetLocal.x,
            y: actuator.pivot.offsetLocal.y,
            z: actuator.pivot.offsetLocal.z,
          },
        },
        transform: {
          position: { ...actuator.transform.position },
          rotation: { ...actuator.transform.rotation },
          scale: { ...actuator.transform.scale },
        },
        size: { ...actuator.size },
        physicsOverrides: physicsOverrides && Object.keys(physicsOverrides).length > 0 ? physicsOverrides : undefined,
      });
    }
  });

  if (actuators.length === 0) {
    throw new SceneLoadError("invalid_scene", "Loaded scene has no actuators.");
  }

  const rigIds = [...new Set(actuators.map((actuator) => actuator.rigId))].sort();
  const selectedRigId = rigIds[0];
  const selectedRoot = actuators.find((actuator) => actuator.rigId === selectedRigId && actuator.parentId === null) ?? actuators[0];

  return {
    actuators,
    selectedRigId,
    selectedActuatorId: selectedRoot.id,
    selectedActuatorIds: [selectedRoot.id],
  };
}

function coerceWorkflowMode(value: unknown): WorkflowMode {
  if (value === "Rigging" || value === "Animation" || value === "Puppeteering") return value;
  return "Rigging";
}

function coerceActuatorPreset(value: unknown): ActuatorPreset | undefined {
  if (typeof value !== "string") return undefined;
  return KNOWN_PRESETS.includes(value as ActuatorPreset) ? (value as ActuatorPreset) : undefined;
}

const PHYSICS_OVERRIDE_KEYS: (keyof ActuatorPhysicsOverrides)[] = [
  "mass", "drag", "angularDrag", "driveRotationSpring", "driveRotationDamper",
  "angularXLowLimit", "angularXHighLimit", "angularYLimit", "angularZLimit",
  "linearLimit", "linearLimitSpring", "linearLimitDamper",
  "drivePositionSpring", "drivePositionDamper",
];

function coercePhysicsOverrides(physics: Record<string, unknown>): ActuatorPhysicsOverrides {
  const out: ActuatorPhysicsOverrides = {};
  for (const key of PHYSICS_OVERRIDE_KEYS) {
    const v = physics[key];
    if (typeof v === "number" && Number.isFinite(v)) (out as Record<string, number>)[key] = v;
  }
  return out;
}

export function createSceneEnvelope(snapshot: SceneSnapshot, options?: { savedAtUtc?: string }): SceneEnvelope {
  const savedAtUtc = options?.savedAtUtc ?? nowUtcIso();
  const scene = buildSceneDocumentFromSnapshot(snapshot, savedAtUtc);
  const normalizedScene = JSON.parse(stableSerializeScene(scene)) as SceneDocument;
  const validationErrors = validateSceneDocument(normalizedScene);
  if (validationErrors.length > 0) {
    throw new SceneLoadError("invalid_scene", validationErrors.join("; "));
  }

  return {
    format: SCENE_ENVELOPE_FORMAT,
    envelopeVersion: SCENE_ENVELOPE_VERSION,
    compatibility: {
      minReaderVersion: SCENE_ENVELOPE_MIN_READER_VERSION,
      policy: "reject-unsupported",
    },
    savedAtUtc,
    workflowMode: snapshot.workflowMode,
    importedMeshes: normalizeImportedMeshes(snapshot.importedMeshes),
    scene: normalizedScene,
  };
}

export function stableSerializeSceneEnvelope(envelope: SceneEnvelope): string {
  const normalizedScene = JSON.parse(stableSerializeScene(envelope.scene)) as SceneDocument;
  const normalizedEnvelope: SceneEnvelope = {
    format: SCENE_ENVELOPE_FORMAT,
    envelopeVersion: SCENE_ENVELOPE_VERSION,
    compatibility: {
      minReaderVersion: SCENE_ENVELOPE_MIN_READER_VERSION,
      policy: "reject-unsupported",
    },
    savedAtUtc: envelope.savedAtUtc,
    workflowMode: envelope.workflowMode,
    importedMeshes: normalizeImportedMeshes(envelope.importedMeshes),
    scene: normalizedScene,
  };
  return JSON.stringify(normalizedEnvelope, null, 2);
}

function migrateLegacySceneDocument(raw: unknown): SceneEnvelope | null {
  const legacy = asRecord(raw);
  if (legacy === null) return null;
  if (legacy.version !== "0.1.0") return null;
  if (legacy.sceneId === undefined || legacy.characters === undefined || legacy.playback === undefined) return null;
  const scene = cloneJson(legacy) as SceneDocument;
  const errors = validateSceneDocument(scene);
  if (errors.length > 0) {
    throw new SceneLoadError("invalid_scene", `Legacy scene migration failed: ${errors.join("; ")}`);
  }
  return {
    format: SCENE_ENVELOPE_FORMAT,
    envelopeVersion: SCENE_ENVELOPE_VERSION,
    compatibility: {
      minReaderVersion: SCENE_ENVELOPE_MIN_READER_VERSION,
      policy: "reject-unsupported",
    },
    savedAtUtc: scene.updatedAtUtc,
    workflowMode: "Rigging",
    importedMeshes: buildFallbackImportedMeshesFromScene(scene),
    scene: JSON.parse(stableSerializeScene(scene)) as SceneDocument,
  };
}

export function migrateSceneEnvelope(raw: unknown, migrators: SceneEnvelopeMigrator[] = []): SceneEnvelope {
  const legacyMigrated = migrateLegacySceneDocument(raw);
  if (legacyMigrated !== null) return legacyMigrated;

  for (const migrator of migrators) {
    const migrated = migrator(cloneJson(raw));
    if (migrated !== null) return migrated;
  }

  const record = asRecord(raw);
  if (record === null) {
    throw new SceneLoadError("invalid_payload", "Scene payload root must be an object.");
  }
  if (typeof record.envelopeVersion !== "string") {
    throw new SceneLoadError("invalid_payload", "Scene payload is missing envelopeVersion.");
  }
  throw new SceneLoadError("unsupported_version", `Unsupported scene envelope version: ${record.envelopeVersion}`);
}

function validateEnvelopeShape(envelope: SceneEnvelope): void {
  if (envelope.format !== SCENE_ENVELOPE_FORMAT) {
    throw new SceneLoadError("invalid_payload", `Unsupported scene format: ${String(envelope.format)}`);
  }
  if (envelope.envelopeVersion !== SCENE_ENVELOPE_VERSION) {
    throw new SceneLoadError("unsupported_version", `Unsupported scene envelope version: ${envelope.envelopeVersion}`);
  }
  const sceneErrors = validateSceneDocument(envelope.scene);
  if (sceneErrors.length > 0) {
    throw new SceneLoadError("invalid_scene", sceneErrors.join("; "));
  }
}

export function parseSceneEnvelope(payload: string | unknown, migrators: SceneEnvelopeMigrator[] = []): SceneEnvelope {
  let raw: unknown;
  if (typeof payload === "string") {
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new SceneLoadError("invalid_payload", "Scene payload is not valid JSON.");
    }
  } else {
    raw = payload;
  }

  const record = asRecord(raw);
  if (record !== null && record.format === SCENE_ENVELOPE_FORMAT && record.envelopeVersion === SCENE_ENVELOPE_VERSION) {
    const scene = cloneJson(record.scene) as SceneDocument;
    const envelope: SceneEnvelope = {
      format: SCENE_ENVELOPE_FORMAT,
      envelopeVersion: SCENE_ENVELOPE_VERSION,
      compatibility: {
        minReaderVersion: SCENE_ENVELOPE_MIN_READER_VERSION,
        policy: "reject-unsupported",
      },
      savedAtUtc: String(record.savedAtUtc ?? nowUtcIso()),
      workflowMode: coerceWorkflowMode(record.workflowMode),
      importedMeshes: normalizeImportedMeshes(
        Array.isArray(record.importedMeshes)
          ? (record.importedMeshes
              .map((mesh) => {
                const meshRecord = asRecord(mesh);
                if (meshRecord === null) return null;
                const upAxis: ImportedMeshUpAxis = meshRecord.upAxis === "Z" ? "Z" : "Y";
                const importScale = Number.isFinite(Number(meshRecord.importScale)) ? Number(meshRecord.importScale) : 1;
                const po = asRecord(meshRecord.positionOffset);
                const positionOffset =
                  po && Number.isFinite(Number(po.x)) && Number.isFinite(Number(po.y)) && Number.isFinite(Number(po.z))
                    ? { x: Number(po.x), y: Number(po.y), z: Number(po.z) }
                    : DEFAULT_POSITION_OFFSET;
                const ro = asRecord(meshRecord.rotationOffset);
                const rotationOffset =
                  ro && Number.isFinite(Number(ro.x)) && Number.isFinite(Number(ro.y)) && Number.isFinite(Number(ro.z))
                    ? { x: Number(ro.x), y: Number(ro.y), z: Number(ro.z) }
                    : DEFAULT_ROTATION_OFFSET;
                return {
                  id: String(meshRecord.id ?? ""),
                  format: inferMeshFormatFromPath(String(meshRecord.sourceUri ?? "")),
                  displayName: String(meshRecord.displayName ?? meshRecord.id ?? "mesh"),
                  sourceUri: String(meshRecord.sourceUri ?? ""),
                  importedAtUtc: String(meshRecord.importedAtUtc ?? nowUtcIso()),
                  upAxis,
                  importScale,
                  positionOffset,
                  rotationOffset,
                } as ImportedMeshDocument;
              })
              .filter((mesh): mesh is ImportedMeshDocument => mesh !== null))
          : [],
      ),
      scene: JSON.parse(stableSerializeScene(scene)) as SceneDocument,
    };
    if (envelope.importedMeshes.length === 0) {
      envelope.importedMeshes = buildFallbackImportedMeshesFromScene(envelope.scene);
    }
    validateEnvelopeShape(envelope);
    return envelope;
  }

  const migrated = migrateSceneEnvelope(raw, migrators);
  validateEnvelopeShape(migrated);
  return {
    ...migrated,
    importedMeshes:
      migrated.importedMeshes.length > 0 ? normalizeImportedMeshes(migrated.importedMeshes) : buildFallbackImportedMeshesFromScene(migrated.scene),
    scene: JSON.parse(stableSerializeScene(migrated.scene)) as SceneDocument,
  };
}

export function sceneSnapshotFromEnvelope(envelope: SceneEnvelope): SceneSnapshot {
  validateEnvelopeShape(envelope);
  const editorState = sceneDocumentToEditorState(envelope.scene);
  return {
    sceneId: envelope.scene.sceneId,
    createdAtUtc: envelope.scene.createdAtUtc,
    workflowMode: envelope.workflowMode,
    editorState,
    importedMeshes:
      envelope.importedMeshes.length > 0 ? normalizeImportedMeshes(envelope.importedMeshes) : buildFallbackImportedMeshesFromScene(envelope.scene),
    playback: {
      fps: envelope.scene.playback.fps,
      durationSec: envelope.scene.playback.durationSec,
      activeClipId: envelope.scene.playback.activeClipId,
    },
    metadata: envelope.scene.metadata,
  };
}
