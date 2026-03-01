import { useEffect, type RefObject } from "react";
import type { InputAction, InputModifiers } from "../types";

type TouchProviderOptions = {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onAction: (action: InputAction) => void;
};

const NO_MODIFIERS: InputModifiers = {
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
};

export function useTouchInputProvider({ targetRef, enabled, onAction }: TouchProviderOptions) {
  useEffect(() => {
    if (!enabled) return;
    const targetElement = targetRef.current;
    if (targetElement === null) return;
    const target = targetElement;
    const activeTouches = new Set<number>();

    function toLocal(clientX: number, clientY: number) {
      const rect = target.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function emit(phase: InputAction["phase"], event: PointerEvent, actionId: string) {
      if (event.pointerType !== "touch") return;
      const local = toLocal(event.clientX, event.clientY);
      const pressed = phase === "OnPress" || phase === "OnDrag";
      onAction({
        source: { provider: "touch", deviceId: `touch-${event.pointerId}` },
        actionId,
        phase,
        control: {
          kind: "button",
          pressed,
          value: pressed ? 1 : 0,
        },
        pointer: {
          clientX: event.clientX,
          clientY: event.clientY,
          localX: local.x,
          localY: local.y,
          button: event.button,
          buttons: event.buttons,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
        },
        modifiers: NO_MODIFIERS,
        xr: null,
        timestampMs: performance.now(),
      });
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activeTouches.add(event.pointerId);
      emit("OnPress", event, "touch.primary");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      emit("OnMove", event, "touch.move");
      if (activeTouches.has(event.pointerId)) {
        emit("OnDrag", event, "touch.primary");
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activeTouches.delete(event.pointerId);
      emit("OnRelease", event, "touch.primary");
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activeTouches.delete(event.pointerId);
      emit("OnRelease", event, "touch.primary");
    };

    target.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [enabled, onAction, targetRef]);
}
