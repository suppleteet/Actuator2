import { useEffect, type RefObject } from "react";
import type { InputAction, InputModifiers } from "../types";

type DesktopProviderOptions = {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onAction: (action: InputAction) => void;
};

function modifiersFromEvent(event: Pick<MouseEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): InputModifiers {
  return {
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  };
}

export function useDesktopInputProvider({ targetRef, enabled, onAction }: DesktopProviderOptions) {
  useEffect(() => {
    if (!enabled) return;
    const targetElement = targetRef.current;
    if (targetElement === null) return;
    const target = targetElement;
    const activePointers = new Set<number>();
    const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

    function toLocal(clientX: number, clientY: number) {
      const rect = target.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function emitPointer(
      phase: InputAction["phase"],
      event: PointerEvent | MouseEvent | WheelEvent,
      actionId: string,
      control: InputAction["control"],
    ) {
      const pointerType = "pointerType" in event ? event.pointerType : "mouse";
      if (pointerType !== "mouse" && pointerType !== "pen") return;
      const pointerId = "pointerId" in event ? event.pointerId : 1;
      const button = "button" in event ? event.button : 0;
      const buttons = "buttons" in event ? event.buttons : 0;
      const local = toLocal(event.clientX, event.clientY);
      onAction({
        source: { provider: "desktop", deviceId: "desktop-primary" },
        actionId,
        phase,
        control,
        pointer: {
          clientX: event.clientX,
          clientY: event.clientY,
          localX: local.x,
          localY: local.y,
          button,
          buttons,
          pointerId,
          pointerType,
        },
        modifiers: modifiersFromEvent(event),
        xr: null,
        timestampMs: performance.now(),
      });
    }

    function emitKeyboard(phase: InputAction["phase"], event: KeyboardEvent, pressed: boolean) {
      onAction({
        source: { provider: "desktop", deviceId: "desktop-keyboard" },
        actionId: `key.${event.code}`,
        phase,
        control: {
          kind: "button",
          pressed,
          value: pressed ? 1 : 0,
        },
        pointer: null,
        modifiers: modifiersFromEvent(event),
        xr: null,
        timestampMs: performance.now(),
      });
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      activePointers.add(event.pointerId);
      emitPointer("OnPress", event, "pointer.primary", {
        kind: "button",
        pressed: true,
        value: 1,
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      emitPointer("OnMove", event, "pointer.move", {
        kind: "axis2",
        x: event.movementX ?? 0,
        y: event.movementY ?? 0,
      });
      if (activePointers.has(event.pointerId) || (event.pointerType === "mouse" && (event.buttons & 1) === 1)) {
        emitPointer("OnDrag", event, "pointer.primary", {
          kind: "button",
          pressed: true,
          value: 1,
        });
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      activePointers.delete(event.pointerId);
      emitPointer("OnRelease", event, "pointer.primary", {
        kind: "button",
        pressed: false,
        value: 0,
      });
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      activePointers.delete(event.pointerId);
      emitPointer("OnRelease", event, "pointer.primary", {
        kind: "button",
        pressed: false,
        value: 0,
      });
    };

    const onWheel = (event: WheelEvent) => {
      emitPointer("OnWheel", event, "scroll.vertical", {
        kind: "axis1",
        value: event.deltaY,
      });
    };

    const onMouseMove = (event: MouseEvent) => {
      emitPointer("OnMove", event, "pointer.move", {
        kind: "axis2",
        x: event.movementX ?? 0,
        y: event.movementY ?? 0,
      });
      if ((event.buttons & 1) === 1) {
        emitPointer("OnDrag", event, "pointer.primary", {
          kind: "button",
          pressed: true,
          value: 1,
        });
      }
    };

    const onMouseUp = (event: MouseEvent) => {
      emitPointer("OnRelease", event, "pointer.primary", {
        kind: "button",
        pressed: false,
        value: 0,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => emitKeyboard("OnValue", event, true);
    const onKeyUp = (event: KeyboardEvent) => emitKeyboard("OnValue", event, false);

    if (supportsPointerEvents) {
      target.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    }
    target.addEventListener("wheel", onWheel, { passive: false, capture: true });
    if (!supportsPointerEvents) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      if (supportsPointerEvents) {
        target.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      }
      target.removeEventListener("wheel", onWheel, true);
      if (!supportsPointerEvents) {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled, onAction, targetRef]);
}
