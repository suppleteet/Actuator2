import { describe, expect, it } from "vitest";
import { buildFocusRequestFromActuators } from "../interaction/focusFraming";

const ACTUATORS = [
  {
    id: "act_root",
    transform: { position: { x: 0, y: 1, z: 0 } },
    size: { x: 0.4, y: 0.8, z: 0.4 },
  },
  {
    id: "act_0001",
    transform: { position: { x: 1, y: 1, z: 0 } },
    size: { x: 0.3, y: 0.3, z: 0.3 },
  },
  {
    id: "act_0002",
    transform: { position: { x: 0, y: 2, z: 0 } },
    size: { x: 0.2, y: 0.2, z: 0.2 },
  },
];

describe("Focus framing", () => {
  it("returns null if no actuator IDs match", () => {
    const request = buildFocusRequestFromActuators(ACTUATORS, ["unknown"]);
    expect(request).toBeNull();
  });

  it("frames selected subset center deterministically", () => {
    const request = buildFocusRequestFromActuators(ACTUATORS, ["act_root", "act_0001"]);
    expect(request).not.toBeNull();
    expect(request!.center).toEqual({ x: 0.5, y: 1, z: 0 });
    expect(request!.fitRadius).toBeGreaterThan(0.6);
  });

  it("frames all actuators when all IDs are provided", () => {
    const request = buildFocusRequestFromActuators(
      ACTUATORS,
      ACTUATORS.map((actuator) => actuator.id),
    );
    expect(request).not.toBeNull();
    expect(request!.center.y).toBeCloseTo(4 / 3, 5);
    expect(request!.fitRadius).toBeGreaterThan(0.7);
  });
});
