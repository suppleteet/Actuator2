import { describe, expect, it } from "vitest";
import { bindVerticesToClosestCapsule, closestPointOnSegment, type Capsule } from "../skinning/closestCapsuleBinding";
import { applyDeltaMush, buildVertexNeighbors } from "../skinning/deltaMush";

describe("Skinning foundations", () => {
  it("computes closest point on segment deterministically", () => {
    const closest = closestPointOnSegment({ x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 });
    expect(closest).toEqual({ x: 2, y: 1, z: 0 });
  });

  it("binds vertices to the closest capsule", () => {
    const capsules: Capsule[] = [
      { id: "a", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 2, z: 0 }, radius: 0.5 },
      { id: "b", start: { x: 3, y: 0, z: 0 }, end: { x: 3, y: 2, z: 0 }, radius: 0.5 },
    ];
    const bindings = bindVerticesToClosestCapsule(
      [
        { x: 0.1, y: 1, z: 0 },
        { x: 2.9, y: 1, z: 0 },
      ],
      capsules,
    );

    expect(bindings[0].capsuleId).toBe("a");
    expect(bindings[1].capsuleId).toBe("b");
  });

  it("falls back to root influence when no capsule is within falloff", () => {
    const capsules: Capsule[] = [
      { id: "root", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 2, z: 0 }, radius: 0.5 },
      { id: "child", start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 2, z: 0 }, radius: 0.5 },
    ];
    const [binding] = bindVerticesToClosestCapsule(
      [{ x: 20, y: 1, z: 0 }],
      capsules,
      { rootCapsuleIds: ["root"], falloffMultiplier: 2 },
    );

    expect(binding.capsuleId).toBe("root");
    expect(binding.weight).toBe(1);
  });

  it("applies deterministic delta mush smoothing", () => {
    const positions = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];
    const neighbors = buildVertexNeighbors(3, [[0, 1, 2]]);
    const smoothedA = applyDeltaMush(positions, neighbors, 2, 0.5);
    const smoothedB = applyDeltaMush(positions, neighbors, 2, 0.5);
    expect(smoothedA).toEqual(smoothedB);
  });
});
