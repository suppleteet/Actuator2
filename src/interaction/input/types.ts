export type InputProviderId = "desktop" | "touch" | "xr";

export type InputActionPhase = "OnPress" | "OnDrag" | "OnRelease" | "OnMove" | "OnWheel" | "OnValue";

export type InputControlValue =
  | {
      kind: "button";
      pressed: boolean;
      value: number; // normalized 0..1 (buttons/triggers)
    }
  | {
      kind: "axis1";
      value: number;
    }
  | {
      kind: "axis2";
      x: number;
      y: number;
    };

export type InputPointerSample = {
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  button: number;
  buttons: number;
  pointerId: number;
  pointerType: string;
};

export type InputModifiers = {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

export type InputAction = {
  source: {
    provider: InputProviderId;
    deviceId: string;
  };
  actionId: string;
  phase: InputActionPhase;
  control: InputControlValue;
  pointer: InputPointerSample | null;
  modifiers: InputModifiers;
  xr?: {
    handedness: "left" | "right" | "none";
    targetRayMode: "tracked-pointer" | "gaze" | "screen" | "transient-pointer" | "unknown";
    sourceKind: "controller" | "hand";
  } | null;
  timestampMs: number;
};
