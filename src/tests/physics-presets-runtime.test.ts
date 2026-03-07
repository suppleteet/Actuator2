import { describe, expect, it } from "vitest";
import { getActuatorColliderVolume } from "../runtime/physicsAuthoring";
import { getActuatorMass, getActuatorMassFromPreset, getRuntimeDriveFromPreset } from "../runtime/physicsPresets";

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

  it("scales mass by collider volume so smaller segments weigh less", () => {
    const big = { type: "custom" as const, preset: "ArmLeg" as const, shape: "capsule" as const, size: { x: 0.35, y: 0.8, z: 0.35 } };
    const small = { type: "custom" as const, preset: "ArmLeg" as const, shape: "capsule" as const, size: { x: 0.15, y: 0.3, z: 0.15 } };

    const massBig = getActuatorMass(big, getActuatorColliderVolume);
    const massSmall = getActuatorMass(small, getActuatorColliderVolume);

    expect(massSmall).toBeLessThan(massBig);
    expect(massBig).toBeGreaterThan(0);
    expect(massSmall).toBeGreaterThanOrEqual(0.01);
  });

  it("getActuatorMass matches preset base when volume equals reference", () => {
    const actuator = { type: "custom" as const, preset: "Default" as const, shape: "capsule" as const, size: { x: 0.35, y: 0.8, z: 0.35 } };
    const baseMass = getActuatorMassFromPreset(actuator);
    const scaledMass = getActuatorMass(actuator, getActuatorColliderVolume);
    expect(scaledMass).toBeCloseTo(baseMass, 0);
  });
});
