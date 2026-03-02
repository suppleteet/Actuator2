import type { InputAction } from "./input/types";
import type { XRHandedness, XRResolvedToolState } from "./xrTools";

export type XRTriggerIntent = {
  handedness: XRHandedness | null;
  intent: "none" | "draw" | "select";
  toggleSelection: boolean;
};

const NO_INTENT: XRTriggerIntent = {
  handedness: null,
  intent: "none",
  toggleSelection: false,
};

export function resolveXrTriggerIntent(action: InputAction, toolState: XRResolvedToolState): XRTriggerIntent {
  if (action.source.provider !== "xr") return NO_INTENT;
  if (action.phase !== "OnPress") return NO_INTENT;
  if (action.actionId !== "xr.select" && action.actionId !== "xr.trigger") return NO_INTENT;
  if (action.control.kind !== "button" || !action.control.pressed) return NO_INTENT;

  const handedness = action.xr?.handedness;
  if (handedness !== "left" && handedness !== "right") return NO_INTENT;

  const tool = toolState.toolsByHand[handedness];
  if (tool === "drawActuator") {
    return {
      handedness,
      intent: "draw",
      toggleSelection: false,
    };
  }
  if (tool === "grab" || tool === "select") {
    return {
      handedness,
      intent: "select",
      toggleSelection: toolState.altModeByHand[handedness],
    };
  }

  return {
    handedness,
    intent: "none",
    toggleSelection: false,
  };
}
