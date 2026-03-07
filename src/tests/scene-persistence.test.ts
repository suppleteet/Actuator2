import { describe, expect, it } from "vitest";
import type { EditorState } from "../app/types";
import {
  SCENE_ENVELOPE_FORMAT,
  SceneLoadError,
  createSceneEnvelope,
  parseSceneEnvelope,
  sceneSnapshotFromEnvelope,
  stableSerializeSceneEnvelope,
  type SceneSnapshot,
} from "../runtime/scenePersistence";

function makeEditorState(): EditorState {
  return {
    selectedRigId: "rig_001",
    selectedActuatorId: "rig_001_act_root",
    selectedActuatorIds: ["rig_001_act_root"],
    actuators: [
      {
        id: "rig_001_act_root",
        rigId: "rig_001",
        parentId: null,
        type: "root",
        shape: "capsule",
        pivot: {
          mode: "capStart",
          offset: { x: 0, y: 0, z: 0 },
        },
        transform: {
          position: { x: 0, y: 1, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        size: { x: 0.3, y: 0.8, z: 0.3 },
      },
      {
        id: "rig_001_act_0001",
        rigId: "rig_001",
        parentId: "rig_001_act_root",
        type: "custom",
        shape: "sphere",
        pivot: {
          mode: "center",
          offset: { x: 0, y: 0, z: 0 },
        },
        transform: {
          position: { x: 0.2, y: 1.4, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          scale: { x: 1, y: 1, z: 1 },
        },
        size: { x: 0.2, y: 0.2, z: 0.2 },
      },
    ],
  };
}

function makeSnapshot(): SceneSnapshot {
  return {
    sceneId: "scene_s07",
    createdAtUtc: "2026-03-02T00:00:00Z",
    workflowMode: "Animation",
    editorState: makeEditorState(),
    importedMeshes: [
      {
        id: "mesh_chad",
        format: "fbx",
        displayName: "Chad.fbx",
        sourceUri: "assets/chad/Chad.fbx",
        importedAtUtc: "2026-03-02T00:00:00Z",
      },
    ],
    playback: {
      fps: 60,
      durationSec: 2,
      activeClipId: null,
    },
    metadata: {
      sourceBaseline: "30c6ea7",
    },
  };
}

describe("Scene persistence envelope", () => {
  it("round-trips deterministically with stable serialization", () => {
    const snapshot = makeSnapshot();
    const envelopeA = createSceneEnvelope(snapshot, { savedAtUtc: "2026-03-02T12:00:00Z" });
    const serializedA = stableSerializeSceneEnvelope(envelopeA);

    const loaded = parseSceneEnvelope(serializedA);
    const snapshotB = sceneSnapshotFromEnvelope(loaded);
    const envelopeB = createSceneEnvelope(snapshotB, { savedAtUtc: "2026-03-02T12:00:00Z" });
    const serializedB = stableSerializeSceneEnvelope(envelopeB);

    expect(serializedA).toBe(serializedB);
    expect(snapshotB.editorState.actuators.map((actuator) => actuator.id)).toEqual(
      snapshot.editorState.actuators.map((actuator) => actuator.id).sort((lhs, rhs) => lhs.localeCompare(rhs)),
    );
  });

  it("returns explicit unsupported_version failures", () => {
    const payload = {
      format: SCENE_ENVELOPE_FORMAT,
      envelopeVersion: "9.9.9",
      scene: {},
    };

    try {
      parseSceneEnvelope(JSON.stringify(payload));
      throw new Error("Expected parseSceneEnvelope to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SceneLoadError);
      expect((error as SceneLoadError).code).toBe("unsupported_version");
    }
  });

  it("returns explicit invalid_payload failures for malformed json", () => {
    try {
      parseSceneEnvelope("{not json");
      throw new Error("Expected parseSceneEnvelope to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SceneLoadError);
      expect((error as SceneLoadError).code).toBe("invalid_payload");
    }
  });

  it("migrates legacy SceneDocument payloads into envelope format", () => {
    const legacySceneDocument = {
      version: "0.1.0",
      sceneId: "legacy_scene",
      createdAtUtc: "2026-03-01T00:00:00Z",
      updatedAtUtc: "2026-03-01T00:00:00Z",
      characters: [
        {
          id: "char_rig_001",
          name: "rig_001",
          mesh: {
            meshId: "mesh_legacy",
            uri: "assets/chad/Chad.fbx",
          },
          rig: {
            rootActuatorId: "act_root",
            actuators: [
              {
                id: "act_root",
                parentId: null,
                type: "root",
                shape: "capsule",
                pivot: {
                  mode: "capStart",
                  offsetLocal: { x: 0, y: 0, z: 0 },
                },
                transform: {
                  position: { x: 0, y: 1, z: 0 },
                  rotation: { x: 0, y: 0, z: 0, w: 1 },
                  scale: { x: 1, y: 1, z: 1 },
                },
                size: { x: 0.2, y: 0.5, z: 0.2 },
                joint: {},
                physics: {},
                influence: {},
              },
            ],
          },
          skinBinding: {
            version: "0.1",
            solver: "closestVolume",
            meshHash: "meshhash",
            bindingHash: "bindhash",
            generatedAtUtc: "2026-03-01T00:00:00Z",
            influenceCount: 1,
          },
          channels: {
            look: { yaw: 0, pitch: 0 },
            blink: { left: 0, right: 0 },
            custom: {},
          },
        },
      ],
      playback: {
        fps: 60,
        durationSec: 1,
        activeClipId: null,
      },
      metadata: {},
    };

    const envelope = parseSceneEnvelope(JSON.stringify(legacySceneDocument));
    const snapshot = sceneSnapshotFromEnvelope(envelope);
    expect(envelope.format).toBe(SCENE_ENVELOPE_FORMAT);
    expect(snapshot.workflowMode).toBe("Rigging");
    expect(snapshot.editorState.actuators[0]?.id).toBe("act_root");
  });
});
