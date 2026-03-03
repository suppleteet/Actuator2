import type { AppMode } from "../app/types";
import type { InputAction } from "./input/types";

export type XRHandedness = "left" | "right";
export type XRToolId = "drawActuator" | "grab" | "adjust" | "select";

export type XRHandInputState = {
  triggerValue: number;
  triggerPressed: boolean;
  squeezeValue: number;
  squeezePressed: boolean;
  thumbstick: {
    x: number;
    y: number;
  };
  thumbstickPressed: boolean;
};

export type XRHandInputStateByHand = Record<XRHandedness, XRHandInputState>;

export type XRResolvedToolState = {
  laneByHand: Record<XRHandedness, "primary" | "secondary">;
  toolsByHand: Record<XRHandedness, XRToolId>;
  altModeByHand: Record<XRHandedness, boolean>;
};

const XR_BUTTON_THRESHOLD = 0.5;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createInitialXrHandInputState(): XRHandInputStateByHand {
  return {
    left: {
      triggerValue: 0,
      triggerPressed: false,
      squeezeValue: 0,
      squeezePressed: false,
      thumbstick: { x: 0, y: 0 },
      thumbstickPressed: false,
    },
    right: {
      triggerValue: 0,
      triggerPressed: false,
      squeezeValue: 0,
      squeezePressed: false,
      thumbstick: { x: 0, y: 0 },
      thumbstickPressed: false,
    },
  };
}

export function isXRHandedness(value: string | undefined): value is XRHandedness {
  return value === "left" || value === "right";
}

function toButtonState(control: InputAction["control"]): { value: number; pressed: boolean } {
  if (control.kind === "button") {
    return {
      value: clamp01(control.value),
      pressed: control.pressed,
    };
  }
  if (control.kind === "axis1") {
    const value = clamp01(control.value);
    return {
      value,
      pressed: value >= XR_BUTTON_THRESHOLD,
    };
  }
  return {
    value: 0,
    pressed: false,
  };
}

export function updateXrHandInputStateFromAction(
  current: XRHandInputStateByHand,
  action: InputAction,
): XRHandInputStateByHand {
  if (action.source.provider !== "xr") return current;
  const handedness = action.xr?.handedness;
  if (!isXRHandedness(handedness)) return current;

  const previousHand = current[handedness];
  const nextHand: XRHandInputState = {
    triggerValue: previousHand.triggerValue,
    triggerPressed: previousHand.triggerPressed,
    squeezeValue: previousHand.squeezeValue,
    squeezePressed: previousHand.squeezePressed,
    thumbstick: { ...previousHand.thumbstick },
    thumbstickPressed: previousHand.thumbstickPressed,
  };

  let changed = false;
  const applyButton = (
    channel: "trigger" | "squeeze" | "thumbstick",
    value: number,
    pressed: boolean,
  ) => {
    if (channel === "trigger") {
      if (nextHand.triggerValue !== value) {
        nextHand.triggerValue = value;
        changed = true;
      }
      if (nextHand.triggerPressed !== pressed) {
        nextHand.triggerPressed = pressed;
        changed = true;
      }
      return;
    }
    if (channel === "squeeze") {
      if (nextHand.squeezeValue !== value) {
        nextHand.squeezeValue = value;
        changed = true;
      }
      if (nextHand.squeezePressed !== pressed) {
        nextHand.squeezePressed = pressed;
        changed = true;
      }
      return;
    }
    if (nextHand.thumbstickPressed !== pressed) {
      nextHand.thumbstickPressed = pressed;
      changed = true;
    }
  };

  switch (action.actionId) {
    case "xr.select":
    case "xr.trigger": {
      if (action.phase === "OnPress") {
        applyButton("trigger", 1, true);
      } else if (action.phase === "OnRelease") {
        applyButton("trigger", 0, false);
      } else {
        const button = toButtonState(action.control);
        applyButton("trigger", button.value, button.pressed);
      }
      break;
    }
    case "xr.trigger.axis": {
      if (action.control.kind !== "axis1") break;
      const button = toButtonState(action.control);
      applyButton("trigger", button.value, button.pressed);
      break;
    }
    case "xr.squeeze": {
      if (action.phase === "OnPress") {
        applyButton("squeeze", 1, true);
      } else if (action.phase === "OnRelease") {
        applyButton("squeeze", 0, false);
      } else {
        const button = toButtonState(action.control);
        applyButton("squeeze", button.value, button.pressed);
      }
      break;
    }
    case "xr.squeeze.axis": {
      if (action.control.kind !== "axis1") break;
      const button = toButtonState(action.control);
      applyButton("squeeze", button.value, button.pressed);
      break;
    }
    case "xr.thumbstick": {
      if (action.control.kind !== "axis2") break;
      const nextX = Number.isFinite(action.control.x) ? action.control.x : 0;
      const nextY = Number.isFinite(action.control.y) ? action.control.y : 0;
      if (nextHand.thumbstick.x !== nextX || nextHand.thumbstick.y !== nextY) {
        nextHand.thumbstick = {
          x: nextX,
          y: nextY,
        };
        changed = true;
      }
      break;
    }
    case "xr.thumbstick.click": {
      if (action.phase === "OnPress") {
        applyButton("thumbstick", 1, true);
      } else if (action.phase === "OnRelease") {
        applyButton("thumbstick", 0, false);
      } else {
        const button = toButtonState(action.control);
        applyButton("thumbstick", button.value, button.pressed);
      }
      break;
    }
    default:
      break;
  }

  if (!changed) return current;
  return {
    ...current,
    [handedness]: nextHand,
  };
}

export function resolveXrToolState(options: {
  appMode: AppMode;
  physicsEnabled: boolean;
  handInputs: XRHandInputStateByHand;
  primaryHand?: XRHandedness;
}): XRResolvedToolState {
  const { appMode, physicsEnabled, handInputs } = options;
  const primaryHand = options.primaryHand ?? "right";

  const basePrimaryTool: XRToolId = appMode === "Rig" && !physicsEnabled ? "drawActuator" : "grab";
  const baseSecondaryTool: XRToolId = "grab";

  const toolsByHand: Record<XRHandedness, XRToolId> = {
    left: primaryHand === "left" ? basePrimaryTool : baseSecondaryTool,
    right: primaryHand === "right" ? basePrimaryTool : baseSecondaryTool,
  };

  for (const hand of ["left", "right"] as const) {
    if (handInputs[hand].thumbstickPressed) {
      toolsByHand[hand] = "adjust";
    }
  }

  const leftSqueezed = handInputs.left.squeezePressed;
  const rightSqueezed = handInputs.right.squeezePressed;
  const altModeByHand: Record<XRHandedness, boolean> = {
    left: leftSqueezed && !rightSqueezed,
    right: rightSqueezed && !leftSqueezed,
  };

  return {
    laneByHand: {
      left: primaryHand === "left" ? "primary" : "secondary",
      right: primaryHand === "right" ? "primary" : "secondary",
    },
    toolsByHand,
    altModeByHand,
  };
}
