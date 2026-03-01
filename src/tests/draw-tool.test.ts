import { describe, expect, it } from "vitest";
import {
  DRAW_RADIUS_MAX,
  DRAW_RADIUS_MIN,
  adjustDrawRadiusFromWheel,
  buildDrawCapsuleActuator,
  clampDrawRadius,
  computeDrawCapsulePlacement,
  mirrorPlacementAcrossX,
  shouldSpawnMirrored,
  snapPointToMirrorCenterline,
  updateCapsuleFromEndpoints,
} from "../interaction/drawTool";

describe("draw tool determinism", () => {
  it("clamps draw radius bounds deterministically", () => {
    expect(clampDrawRadius(Number.NaN)).toBe(DRAW_RADIUS_MIN);
    expect(clampDrawRadius(0)).toBe(DRAW_RADIUS_MIN);
    expect(clampDrawRadius(999)).toBe(DRAW_RADIUS_MAX);
  });

  it("adjusts radius by ctrl+wheel in fixed step", () => {
    const r0 = 0.2;
    const increase = adjustDrawRadiusFromWheel(r0, -120);
    const decrease = adjustDrawRadiusFromWheel(r0, 120);
    expect(increase).toBeGreaterThan(r0);
    expect(decrease).toBeLessThan(r0);
    expect(adjustDrawRadiusFromWheel(r0, 0)).toBe(r0);
  });

  it("computes stable inside-mesh placement from identical hit inputs", () => {
    const hit = { point: { x: 0.3, y: 1.4, z: -0.2 }, normal: { x: 0.2, y: 0.9, z: 0.1 } };
    const first = computeDrawCapsulePlacement(hit, 0.12);
    const second = computeDrawCapsulePlacement(hit, 0.12);
    expect(first).toEqual(second);
    expect(first.center.x).not.toBe(hit.point.x);
  });

  it("snaps to centerline and disables mirrored spawn on centerline", () => {
    const snapped = snapPointToMirrorCenterline({ x: 0.01, y: 1, z: 0 }, 0.04);
    expect(snapped.x).toBe(0);
    expect(shouldSpawnMirrored(snapped, true, 0.04)).toBe(false);
    expect(shouldSpawnMirrored({ x: 0.08, y: 1, z: 0 }, true, 0.04)).toBe(true);
  });

  it("builds deterministic mirrored counterpart", () => {
    const placement = { center: { x: 0.25, y: 1, z: -0.3 }, axis: { x: 0.1, y: 0.99, z: 0 } };
    const mirrored = mirrorPlacementAcrossX(placement.center, placement.axis);
    expect(mirrored.center.x).toBeCloseTo(-placement.center.x);
    expect(mirrored.axis.x).toBeCloseTo(-placement.axis.x);

    const a = buildDrawCapsuleActuator({
      id: "rig_001_act_1000",
      rigId: "rig_001",
      parentId: "rig_001_act_root",
      center: placement.center,
      axis: placement.axis,
      radius: 0.08,
      halfAxis: 0.1,
    });
    const b = buildDrawCapsuleActuator({
      id: "rig_001_act_1000",
      rigId: "rig_001",
      parentId: "rig_001_act_root",
      center: placement.center,
      axis: placement.axis,
      radius: 0.08,
      halfAxis: 0.1,
    });
    expect(a).toEqual(b);
  });

  it("supports mouse-down zero-height and drag-based capsule growth", () => {
    const start = { x: 0.2, y: 1.1, z: -0.3 };
    const down = updateCapsuleFromEndpoints(start, start, 0.1);
    expect(down.size.y).toBe(0);
    expect(down.position).toEqual(start);

    const end = { x: 0.6, y: 1.3, z: -0.1 };
    const dragged = updateCapsuleFromEndpoints(start, end, 0.1, down.rotation);
    expect(dragged.size.y).toBeGreaterThan(0);
    expect(dragged.size.x).toBeCloseTo(0.2);
    expect(dragged.size.z).toBeCloseTo(0.2);
  });
});
