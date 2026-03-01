import type { RefObject } from "react";
import { useDesktopInputProvider } from "./providers/desktopProvider";
import { useTouchInputProvider } from "./providers/touchProvider";
import { useXRInputProvider } from "./providers/xrProvider";
import type { InputAction } from "./types";

type InputRouterOptions = {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onAction: (action: InputAction) => void;
  getXRSession?: () => object | null;
  providers?: {
    desktop?: boolean;
    touch?: boolean;
    xr?: boolean;
  };
};

export function useInputRouter(options: InputRouterOptions) {
  const { targetRef, enabled, onAction, providers, getXRSession } = options;
  const useDesktop = providers?.desktop ?? true;
  const useTouch = providers?.touch ?? true;
  const useXR = providers?.xr ?? true;

  useDesktopInputProvider({
    targetRef,
    enabled: enabled && useDesktop,
    onAction,
  });
  useTouchInputProvider({
    targetRef,
    enabled: enabled && useTouch,
    onAction,
  });
  useXRInputProvider({
    enabled: enabled && useXR,
    onAction,
    getSession: getXRSession as (() => any) | undefined,
  });
}
