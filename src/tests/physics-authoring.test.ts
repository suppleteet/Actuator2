import { describe, expect, it } from "vitest";
import {
  defaultPivotForShape,
  getActuatorPrimitiveCenter,
  getCapsuleHalfAxis,
  normalizePrimitiveSize,
  scalePrimitiveSizeFromGizmoDelta,
  type ActuatorPrimitiveLike,
} from "../runtime/physicsAuthoring";

function makeCapsule(mode: "capStart" | "center" = "capStart"): ActuatorPrimitiveLike {
  return {
    shape: "capsule",
    size: { x: 0.35, y: 0.8, z: 0.35 },
    pivot: {
      mode,
      offset: { x: 0, y: 0, z: 0 },
    },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };
}

describe("Physics primitive authoring semantics", () => {
  it("uses capStart as the default pivot mode for capsules", () => {
    expect(defaultPivotForShape("capsule").mode).toBe("capStart");
    expect(defaultPivotForShape("sphere").mode).toBe("center");
    expect(defaultPivotForShape("box").mode).toBe("center");
  });

  it("derives capsule center from capStart pivot mode", () => {
    const capStartCenter = getActuatorPrimitiveCenter(makeCapsule("capStart"));
    const centerModeCenter = getActuatorPrimitiveCenter(makeCapsule("center"));

    expect(getCapsuleHalfAxis({ x: 0.35, y: 0.8, z: 0.35 })).toBeCloseTo(0.4, 6);
    expect(capStartCenter.y).toBeCloseTo(0.4, 6);
    expect(centerModeCenter.y).toBeCloseTo(0, 6);
  });

  it("scales primitive size deterministically from gizmo deltas", () => {
    const size = normalizePrimitiveSize({ x: 0.35, y: 0.8, z: 0.35 });
    const delta = { x: -2, y: 0.5, z: 1.25 };
    const once = scalePrimitiveSizeFromGizmoDelta(size, delta);
    const again = scalePrimitiveSizeFromGizmoDelta(size, delta);

    expect(once).toEqual(again);
    expect(once.x).toBeCloseTo(0.7, 6);
    expect(once.y).toBeCloseTo(0.4, 6);
    expect(once.z).toBeCloseTo(0.4375, 6);
  });
});
