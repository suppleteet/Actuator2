import { useEffect, type RefObject } from "react";

export type InputActionPhase = "OnPress" | "OnDrag" | "OnRelease" | "OnMove" | "OnWheel";

export type InputAction = {
  phase: InputActionPhase;
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  button: number;
  buttons: number;
  pointerId: number;
  pointerType: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  deltaY: number;
};

export function useInputActions(options: {
  targetRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onAction: (action: InputAction) => void;
}) {
  const { targetRef, enabled, onAction } = options;

  useEffect(() => {
    if (!enabled) return;
    const targetElement = targetRef.current;
    if (targetElement === null) return;
    const target = targetElement;

    function toLocal(clientX: number, clientY: number) {
      const rect = target.getBoundingClientRect();
      return {
        localX: clientX - rect.left,
        localY: clientY - rect.top,
      };
    }

    const activePointers = new Set<number>();

    const emit = (phase: InputActionPhase, event: PointerEvent | MouseEvent | WheelEvent) => {
      const pointerId = "pointerId" in event ? event.pointerId : 1;
      const pointerType = "pointerType" in event ? event.pointerType : "mouse";
      const { localX, localY } = toLocal(event.clientX, event.clientY);
      const buttons = "buttons" in event ? event.buttons : 0;
      const button = "button" in event ? event.button : 0;
      const deltaY = "deltaY" in event ? event.deltaY : 0;

      onAction({
        phase,
        clientX: event.clientX,
        clientY: event.clientY,
        localX,
        localY,
        button,
        buttons,
        pointerId,
        pointerType,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        deltaY,
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      activePointers.add(event.pointerId);
      if (target.setPointerCapture !== undefined) {
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // Ignore pointer capture failures.
        }
      }
      emit("OnPress", event);
    };

    const onPointerMove = (event: PointerEvent) => {
      emit("OnMove", event);
      if (activePointers.has(event.pointerId) || (event.pointerType === "mouse" && (event.buttons & 1) === 1)) {
        emit("OnDrag", event);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      emit("OnRelease", event);
    };

    const onPointerCancel = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      emit("OnRelease", event);
    };

    const onWheel = (event: WheelEvent) => {
      emit("OnWheel", event);
    };

    const onMouseMove = (event: MouseEvent) => {
      emit("OnMove", event);
      if ((event.buttons & 1) === 1) {
        emit("OnDrag", event);
      }
    };

    const onMouseUp = (event: MouseEvent) => {
      emit("OnRelease", event);
    };

    target.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    target.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      target.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      target.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [enabled, onAction, targetRef]);
}
