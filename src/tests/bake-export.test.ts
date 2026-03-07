import { describe, expect, it } from "vitest";
import { captureBakeCache, stableSerializeBakeCache } from "../animation/bakeCache";
import { createDefaultBakeExportRegistry } from "../animation/exportPipeline";

const BASE_ACTUATORS = [
  {
    id: "act_root",
    parentId: null,
    transform: {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  },
  {
    id: "act_child",
    parentId: "act_root",
    transform: {
      position: { x: 0, y: 1.4, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  },
];

describe("Bake capture + export pipeline", () => {
  it("captures deterministic bake cache output for equal input", () => {
    const makeCache = () =>
      captureBakeCache({
        fps: 30,
        startFrame: 0,
        endFrame: 3,
        actuators: BASE_ACTUATORS,
        sampleAtFrame: (frame) =>
          BASE_ACTUATORS.map((actuator) => ({
            ...actuator,
            transform: {
              ...actuator.transform,
              position: {
                x: actuator.transform.position.x + frame * 0.01,
                y: actuator.transform.position.y,
                z: actuator.transform.position.z,
              },
            },
          })),
      });

    const a = makeCache();
    const b = makeCache();
    expect(stableSerializeBakeCache(a)).toBe(stableSerializeBakeCache(b));
  });

  it("does not mutate source actuator data while capturing", () => {
    const original = JSON.parse(JSON.stringify(BASE_ACTUATORS));
    captureBakeCache({
      fps: 60,
      startFrame: 0,
      endFrame: 2,
      actuators: BASE_ACTUATORS,
    });
    expect(BASE_ACTUATORS).toEqual(original);
  });

  it("reports implemented and unsupported export capabilities", () => {
    const registry = createDefaultBakeExportRegistry();
    const capabilities = registry.getCapabilities();
    expect(capabilities.find((entry) => entry.format === "bvh")?.status).toBe("implemented");
    expect(capabilities.find((entry) => entry.format === "fbx")?.status).toBe("unsupported");
  });

  it("exports BVH artifacts from captured bake cache", () => {
    const cache = captureBakeCache({
      fps: 24,
      startFrame: 0,
      endFrame: 2,
      actuators: BASE_ACTUATORS,
    });
    const registry = createDefaultBakeExportRegistry();
    const result = registry.runExportJob({
      format: "bvh",
      cache,
      sceneId: "scene_main",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.fileName.endsWith(".bvh")).toBe(true);
    expect(result.content).toContain("HIERARCHY");
    expect(result.content).toContain("MOTION");
  });

  it("returns explicit unsupported status for non-implemented formats", () => {
    const cache = captureBakeCache({
      fps: 24,
      startFrame: 0,
      endFrame: 2,
      actuators: BASE_ACTUATORS,
    });
    const registry = createDefaultBakeExportRegistry();
    const result = registry.runExportJob({
      format: "glb",
      cache,
      sceneId: "scene_main",
    });
    expect(result.status).toBe("unsupported");
  });
});
