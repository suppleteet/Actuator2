import { describe, expect, it } from "vitest";
import { getRuntimeDriveFromPreset } from "../runtime/physicsPresets";

describe("Runtime drive tuning", () => {
  it("returns deterministic runtime drive values for identical preset inputs", () => {
    const actuator = { type: "root" as const, preset: "Root" as const };
    const a = getRuntimeDriveFromPreset(actuator);
    const b = getRuntimeDriveFromPreset(actuator);
    expect(a).toEqual(b);
  });

  it("keeps rotation blend and max speed within stable bounds", () => {
    const drive = getRuntimeDriveFromPreset({ type: "custom", preset: "Default" });

    expect(drive.rotationVelocityBlend).toBeGreaterThan(0);
    expect(drive.rotationVelocityBlend).toBeLessThanOrEqual(1);
    expect(drive.maxAngularSpeed).toBeGreaterThanOrEqual(1.8);
  });

  it("preserves stronger root positional return than default custom preset", () => {
    const root = getRuntimeDriveFromPreset({ type: "root", preset: "Root" });
    const custom = getRuntimeDriveFromPreset({ type: "custom", preset: "Default" });

    expect(root.positionStiffness).toBeGreaterThan(custom.positionStiffness);
    expect(root.positionDamping).toBeGreaterThan(custom.positionDamping);
  });
});
