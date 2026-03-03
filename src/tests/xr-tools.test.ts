import { describe, expect, it } from "vitest";
import type { InputAction } from "../interaction/input/types";
import {
  createInitialXrHandInputState,
  resolveXrToolState,
  updateXrHandInputStateFromAction,
  type XRHandedness,
} from "../interaction/xrTools";

function makeXrAction(options: {
  handedness: XRHandedness;
  actionId: string;
  phase?: InputAction["phase"];
  control: InputAction["control"];
}): InputAction {
  return {
    source: {
      provider: "xr",
      deviceId: `xr-${options.handedness}`,
    },
    actionId: options.actionId,
    phase: options.phase ?? "OnValue",
    control: options.control,
    pointer: null,
    modifiers: {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    },
    xr: {
      handedness: options.handedness,
      targetRayMode: "tracked-pointer",
      sourceKind: "controller",
    },
    timestampMs: 0,
  };
}

describe("XR tool lane mapping", () => {
  it("uses Unity baseline tools in Rig mode with simulation disabled", () => {
    const resolved = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: createInitialXrHandInputState(),
    });

    expect(resolved.toolsByHand.right).toBe("drawActuator");
    expect(resolved.toolsByHand.left).toBe("grab");
  });

  it("uses grab on both hands in Pose mode", () => {
    const resolved = resolveXrToolState({
      appMode: "Pose",
      physicsEnabled: true,
      handInputs: createInitialXrHandInputState(),
    });

    expect(resolved.toolsByHand.right).toBe("grab");
    expect(resolved.toolsByHand.left).toBe("grab");
  });

  it("applies thumbstick click override to adjust lane deterministically", () => {
    const start = createInitialXrHandInputState();
    const pressed = updateXrHandInputStateFromAction(
      start,
      makeXrAction({
        handedness: "left",
        actionId: "xr.thumbstick.click",
        phase: "OnPress",
        control: { kind: "button", pressed: true, value: 1 },
      }),
    );

    const resolved = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: pressed,
    });

    expect(resolved.toolsByHand.left).toBe("adjust");
    expect(resolved.toolsByHand.right).toBe("drawActuator");
  });

  it("sets alt mode only for single-hand squeeze", () => {
    const squeezedRight = updateXrHandInputStateFromAction(
      createInitialXrHandInputState(),
      makeXrAction({
        handedness: "right",
        actionId: "xr.squeeze",
        phase: "OnPress",
        control: { kind: "button", pressed: true, value: 1 },
      }),
    );

    const resolvedSingle = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: squeezedRight,
    });

    expect(resolvedSingle.altModeByHand.right).toBe(true);
    expect(resolvedSingle.altModeByHand.left).toBe(false);

    const squeezedBoth = updateXrHandInputStateFromAction(
      squeezedRight,
      makeXrAction({
        handedness: "left",
        actionId: "xr.squeeze",
        phase: "OnPress",
        control: { kind: "button", pressed: true, value: 1 },
      }),
    );

    const resolvedBoth = resolveXrToolState({
      appMode: "Rig",
      physicsEnabled: false,
      handInputs: squeezedBoth,
    });

    expect(resolvedBoth.altModeByHand.right).toBe(false);
    expect(resolvedBoth.altModeByHand.left).toBe(false);
  });

  it("produces identical tool state for identical XR event sequences", () => {
    const sequence: InputAction[] = [
      makeXrAction({
        handedness: "right",
        actionId: "xr.squeeze",
        phase: "OnPress",
        control: { kind: "button", pressed: true, value: 1 },
      }),
      makeXrAction({
        handedness: "right",
        actionId: "xr.thumbstick.click",
        phase: "OnPress",
        control: { kind: "button", pressed: true, value: 1 },
      }),
      makeXrAction({
        handedness: "right",
        actionId: "xr.thumbstick",
        control: { kind: "axis2", x: 0.45, y: -0.2 },
      }),
      makeXrAction({
        handedness: "right",
        actionId: "xr.thumbstick.click",
        phase: "OnRelease",
        control: { kind: "button", pressed: false, value: 0 },
      }),
      makeXrAction({
        handedness: "right",
        actionId: "xr.squeeze",
        phase: "OnRelease",
        control: { kind: "button", pressed: false, value: 0 },
      }),
    ];

    const run = () => {
      let state = createInitialXrHandInputState();
      for (const action of sequence) {
        state = updateXrHandInputStateFromAction(state, action);
      }
      return resolveXrToolState({
        appMode: "Rig",
        physicsEnabled: false,
        handInputs: state,
      });
    };

    expect(run()).toEqual(run());
  });
});
