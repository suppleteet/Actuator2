import { describe, expect, it } from "vitest";
import type { InputAction } from "../interaction/input/types";
import { resolveXrTriggerIntent } from "../interaction/xrTriggerBridge";
import { createInitialXrHandInputState, resolveXrToolState } from "../interaction/xrTools";

function makeXrPressAction(handedness: "left" | "right", actionId: string): InputAction {
  return {
    source: {
      provider: "xr",
      deviceId: `xr-${handedness}`,
    },
    actionId,
    phase: "OnPress",
    control: {
      kind: "button",
      pressed: true,
      value: 1,
    },
    pointer: null,
    modifiers: {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    },
    xr: {
      handedness,
      targetRayMode: "tracked-pointer",
      sourceKind: "controller",
    },
    timestampMs: 0,
  };
}

describe("XR trigger intent bridge", () => {
  it("maps primary draw lane trigger to draw intent", () => {
    const toolState = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: createInitialXrHandInputState(),
    });

    const intent = resolveXrTriggerIntent(makeXrPressAction("right", "xr.select"), toolState);
    expect(intent).toEqual({
      handedness: "right",
      intent: "draw",
      toggleSelection: false,
    });
  });

  it("maps secondary grab lane trigger to select intent", () => {
    const toolState = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: createInitialXrHandInputState(),
    });

    const intent = resolveXrTriggerIntent(makeXrPressAction("left", "xr.select"), toolState);
    expect(intent).toEqual({
      handedness: "left",
      intent: "select",
      toggleSelection: false,
    });
  });

  it("propagates single-hand alt mode into selection toggle intent", () => {
    const handInputs = createInitialXrHandInputState();
    handInputs.left.squeezePressed = true;
    const toolState = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs,
    });

    const intent = resolveXrTriggerIntent(makeXrPressAction("left", "xr.trigger"), toolState);
    expect(intent.toggleSelection).toBe(true);
    expect(intent.intent).toBe("select");
  });

  it("returns no-op for non-trigger XR events", () => {
    const toolState = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: createInitialXrHandInputState(),
    });

    const noop = resolveXrTriggerIntent(
      {
        ...makeXrPressAction("right", "xr.thumbstick"),
        control: { kind: "axis2", x: 0.4, y: 0.1 },
      },
      toolState,
    );

    expect(noop.intent).toBe("none");
    expect(noop.handedness).toBeNull();
  });
});
