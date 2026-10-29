import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
export function useOrderDrag(
  kind: string,
  ids: string[],
  onMove: (source: string, target: string, after: boolean) => void,
) {
  const cleanup = useRef<(() => void) | null>(null);
  const suppress = useRef(false);
  const [source, setSource] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  function clear() {
    cleanup.current?.();
    cleanup.current = null;
    setSource(null);
    setDrop(null);
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", clear);
    return () => {
      cleanup.current?.();
      window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", clear);
    };
  }, []);
  function hit(event: PointerEvent, horizontal: boolean) {
    const node = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(`[data-order-kind="${kind}"]`);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      id: node.dataset.orderId!,
      after: horizontal
        ? event.clientX > rect.left + rect.width / 2
        : event.clientY > rect.top + rect.height / 2,
    };
  }
  return {
    source,
    suppress,
    className(id: string) {
      return `${source === id ? " order-dragging" : ""}${drop?.id === id ? (drop.after ? " order-after" : " order-before") : ""}`;
    },
    props(id: string, horizontal = false) {
      return {
        "data-order-kind": kind,
        "data-order-id": id,
        onPointerDown(event: ReactPointerEvent<HTMLElement>) {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest(
              ".tab-close,.ssh-profile-more,.ssh-profile-menu",
            )
          )
            return;
          clear();
          suppress.current = false;
          const x = event.clientX,
            y = event.clientY,
            pointerId = event.pointerId,
            element = event.currentTarget;
          let active = false;
          const move = (pointer: PointerEvent) => {
            if (pointer.pointerId !== pointerId) return;
            if (
              !active &&
              Math.hypot(pointer.clientX - x, pointer.clientY - y) < 6
            )
              return;
            if (!active) {
              active = true;
              suppress.current = true;
              setSource(id);
            }
            pointer.preventDefault();
            const target = hit(pointer, horizontal);
            setDrop(target?.id !== id ? target : null);
            const scroll = element.closest<HTMLElement>(
              horizontal ? ".tabbar" : ".ssh-profile-list,nav",
            );
            if (scroll) {
              const rect = scroll.getBoundingClientRect();
              if (horizontal)
                scroll.scrollLeft +=
                  pointer.clientX < rect.left + 25
                    ? -16
                    : pointer.clientX > rect.right - 25
                      ? 16
                      : 0;
              else
                scroll.scrollTop +=
                  pointer.clientY < rect.top + 25
                    ? -12
                    : pointer.clientY > rect.bottom - 25
                      ? 12
                      : 0;
            }
          };
          const up = (pointer: PointerEvent) => {
            if (pointer.pointerId !== pointerId) return;
            const target = active ? hit(pointer, horizontal) : null;
            clear();
            if (active) {
              pointer.preventDefault();
              if (target && target.id !== id)
                onMove(id, target.id, target.after);
            }
            setTimeout(() => {
              suppress.current = false;
            }, 0);
          };
          const cancel = () => {
            clear();
            setTimeout(() => {
              suppress.current = false;
            }, 0);
          };
          cleanup.current = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
          };
          window.addEventListener("pointermove", move, { passive: false });
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancel);
        },
        onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
          if (
            !event.altKey ||
            !event.shiftKey ||
            !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const after = event.key === "ArrowDown" || event.key === "ArrowRight";
          const target = ids[ids.indexOf(id) + (after ? 1 : -1)];
          if (target !== undefined) onMove(id, target, after);
        },
      };
    },
  };
}
