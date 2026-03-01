import { useEffect } from "react";
import type { InputAction } from "../types";

type XRInputSourceLike = {
  handedness?: string;
  targetRayMode?: string;
  hand?: unknown;
  gamepad?: {
    buttons?: Array<{ pressed?: boolean; value?: number }>;
    axes?: number[];
  };
};

type XRFrameLike = {
  session: XRSessionLike;
};

type XRSessionLike = {
  inputSources?: Iterable<XRInputSourceLike>;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  requestAnimationFrame: (callback: (time: number, frame: XRFrameLike) => void) => number;
  cancelAnimationFrame: (handle: number) => void;
};

type XRInputEventLike = Event & {
  inputSource?: XRInputSourceLike;
};

type XRProviderOptions = {
  enabled: boolean;
  onAction: (action: InputAction) => void;
  getSession?: () => XRSessionLike | null;
};

function normalizeHandedness(value: string | undefined): "left" | "right" | "none" {
  if (value === "left" || value === "right") return value;
  return "none";
}

function normalizeTargetRayMode(value: string | undefined): "tracked-pointer" | "gaze" | "screen" | "transient-pointer" | "unknown" {
  if (value === "tracked-pointer" || value === "gaze" || value === "screen" || value === "transient-pointer") {
    return value;
  }
  return "unknown";
}

function xrSourceKind(inputSource: XRInputSourceLike): "controller" | "hand" {
  return inputSource.hand === undefined ? "controller" : "hand";
}

export function useXRInputProvider({ enabled, onAction, getSession }: XRProviderOptions) {
  useEffect(() => {
    if (!enabled || getSession === undefined) return;
    const sessionGetter = getSession;

    let rafHandle = 0;
    let currentSession: XRSessionLike | null = null;

    const sourceIdMap = new WeakMap<object, number>();
    let nextSourceId = 1;
    const lastButtonValues = new Map<string, number>();
    const lastAxisValues = new Map<string, { x: number; y: number }>();

    function sourceId(inputSource: XRInputSourceLike): string {
      const key = inputSource as unknown as object;
      const existing = sourceIdMap.get(key);
      if (existing !== undefined) return `xr-${existing}`;
      const assigned = nextSourceId;
      nextSourceId += 1;
      sourceIdMap.set(key, assigned);
      return `xr-${assigned}`;
    }

    function emitFromSource(
      inputSource: XRInputSourceLike,
      actionId: string,
      phase: InputAction["phase"],
      control: InputAction["control"],
    ) {
      onAction({
        source: { provider: "xr", deviceId: sourceId(inputSource) },
        actionId,
        phase,
        control,
        pointer: null,
        modifiers: {
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
        },
        xr: {
          handedness: normalizeHandedness(inputSource.handedness),
          targetRayMode: normalizeTargetRayMode(inputSource.targetRayMode),
          sourceKind: xrSourceKind(inputSource),
        },
        timestampMs: performance.now(),
      });
    }

    const onSelectStart = (event: Event) => {
      const xrEvent = event as XRInputEventLike;
      const inputSource = xrEvent.inputSource;
      if (inputSource === undefined) return;
      emitFromSource(inputSource, "xr.select", "OnPress", {
        kind: "button",
        pressed: true,
        value: 1,
      });
    };

    const onSelectEnd = (event: Event) => {
      const xrEvent = event as XRInputEventLike;
      const inputSource = xrEvent.inputSource;
      if (inputSource === undefined) return;
      emitFromSource(inputSource, "xr.select", "OnRelease", {
        kind: "button",
        pressed: false,
        value: 0,
      });
    };

    const onSqueezeStart = (event: Event) => {
      const xrEvent = event as XRInputEventLike;
      const inputSource = xrEvent.inputSource;
      if (inputSource === undefined) return;
      emitFromSource(inputSource, "xr.squeeze", "OnPress", {
        kind: "button",
        pressed: true,
        value: 1,
      });
    };

    const onSqueezeEnd = (event: Event) => {
      const xrEvent = event as XRInputEventLike;
      const inputSource = xrEvent.inputSource;
      if (inputSource === undefined) return;
      emitFromSource(inputSource, "xr.squeeze", "OnRelease", {
        kind: "button",
        pressed: false,
        value: 0,
      });
    };

    function attachSession(session: XRSessionLike) {
      session.addEventListener("selectstart", onSelectStart);
      session.addEventListener("selectend", onSelectEnd);
      session.addEventListener("squeezestart", onSqueezeStart);
      session.addEventListener("squeezeend", onSqueezeEnd);
    }

    function detachSession(session: XRSessionLike) {
      session.removeEventListener("selectstart", onSelectStart);
      session.removeEventListener("selectend", onSelectEnd);
      session.removeEventListener("squeezestart", onSqueezeStart);
      session.removeEventListener("squeezeend", onSqueezeEnd);
    }

    function pollFrame(_time: number, frame: XRFrameLike) {
      const session = frame.session;
      const inputSources = session.inputSources ?? [];
      for (const inputSource of inputSources) {
        const gamepad = inputSource.gamepad;
        if (gamepad === undefined) continue;
        const id = sourceId(inputSource);

        const trigger = gamepad.buttons?.[0];
        const triggerValue = trigger?.value ?? 0;
        const triggerPressed = trigger?.pressed ?? triggerValue > 0.5;
        const lastTrigger = lastButtonValues.get(`${id}:trigger`) ?? -1;
        if (Math.abs(triggerValue - lastTrigger) > 0.01) {
          lastButtonValues.set(`${id}:trigger`, triggerValue);
          emitFromSource(inputSource, "xr.trigger", "OnValue", {
            kind: "button",
            pressed: triggerPressed,
            value: triggerValue,
          });
          emitFromSource(inputSource, "xr.trigger.axis", "OnValue", {
            kind: "axis1",
            value: triggerValue,
          });
        }

        const squeeze = gamepad.buttons?.[1];
        const squeezeValue = squeeze?.value ?? 0;
        const squeezePressed = squeeze?.pressed ?? squeezeValue > 0.5;
        const lastSqueeze = lastButtonValues.get(`${id}:squeeze`) ?? -1;
        if (Math.abs(squeezeValue - lastSqueeze) > 0.01) {
          lastButtonValues.set(`${id}:squeeze`, squeezeValue);
          emitFromSource(inputSource, "xr.squeeze", "OnValue", {
            kind: "button",
            pressed: squeezePressed,
            value: squeezeValue,
          });
          emitFromSource(inputSource, "xr.squeeze.axis", "OnValue", {
            kind: "axis1",
            value: squeezeValue,
          });
        }

        const axisX = gamepad.axes?.[2] ?? gamepad.axes?.[0] ?? 0;
        const axisY = gamepad.axes?.[3] ?? gamepad.axes?.[1] ?? 0;
        const lastAxis = lastAxisValues.get(`${id}:thumbstick`) ?? { x: Number.NaN, y: Number.NaN };
        if (Math.abs(axisX - lastAxis.x) > 0.01 || Math.abs(axisY - lastAxis.y) > 0.01) {
          lastAxisValues.set(`${id}:thumbstick`, { x: axisX, y: axisY });
          emitFromSource(inputSource, "xr.thumbstick", "OnValue", {
            kind: "axis2",
            x: axisX,
            y: axisY,
          });
        }
      }
      rafHandle = session.requestAnimationFrame(pollFrame);
    }

    function tick() {
      const nextSession = sessionGetter();
      if (nextSession !== currentSession) {
        if (currentSession !== null) {
          currentSession.cancelAnimationFrame(rafHandle);
          detachSession(currentSession);
        }
        currentSession = nextSession;
        if (currentSession !== null) {
          attachSession(currentSession);
          rafHandle = currentSession.requestAnimationFrame(pollFrame);
        }
      }
      window.requestAnimationFrame(tick);
    }

    const watchHandle = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(watchHandle);
      if (currentSession !== null) {
        currentSession.cancelAnimationFrame(rafHandle);
        detachSession(currentSession);
      }
    };
  }, [enabled, getSession, onAction]);
}
