import { describe, expect, it } from "vitest";
import { stableSerializeScene, validateSceneDocument, type SceneDocument } from "../domain/sceneDocument";

function makeScene(overrides?: Partial<SceneDocument>): SceneDocument {
  return {
    version: "0.1.0",
    sceneId: "scene_main",
    createdAtUtc: "2026-02-26T00:00:00Z",
    updatedAtUtc: "2026-02-26T00:00:00Z",
    characters: [
      {
        id: "char_001",
        name: "Character",
        mesh: { meshId: "mesh_001", uri: "assets/example.glb" },
        rig: {
          rootActuatorId: "act_root",
          actuators: [
            {
              id: "act_root",
              parentId: null,
              type: "root",
              shape: "capsule",
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
            {
              id: "act_0001",
              parentId: "act_root",
              type: "custom",
              shape: "box",
              transform: {
                position: { x: 0.2, y: 1.4, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 },
              },
              size: { x: 0.2, y: 0.2, z: 0.2 },
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
          generatedAtUtc: "2026-02-26T00:00:00Z",
          influenceCount: 2,
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
      durationSec: 10,
      activeClipId: null,
    },
    ...overrides,
  };
}

describe("Scene schema contract baseline", () => {
  it("accepts valid baseline scene document", () => {
    const errors = validateSceneDocument(makeScene());
    expect(errors).toEqual([]);
  });

  it("rejects cyclic actuator graph", () => {
    const scene = makeScene();
    scene.characters[0].rig.actuators[0].parentId = "act_0001";
    const errors = validateSceneDocument(scene);
    expect(errors.some((error) => error.includes("acyclic"))).toBe(true);
  });

  it("stable serialization is deterministic regardless source order", () => {
    const a = makeScene();
    const b = makeScene();
    b.characters[0].rig.actuators.reverse();

    const s1 = stableSerializeScene(a);
    const s2 = stableSerializeScene(b);
    expect(s1).toBe(s2);
  });
});
