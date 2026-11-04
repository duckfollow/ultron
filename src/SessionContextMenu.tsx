import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Palette, X } from "lucide-react";

export function SessionContextMenu({
  x,
  y,
  name,
  paneCount,
  onAppearance,
  onCloseTab,
  onDismiss,
}: {
  x: number;
  y: number;
  name: string;
  paneCount: number;
  onAppearance: () => void;
  onCloseTab: () => void;
  onDismiss: (restoreFocus?: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useLayoutEffect(() => {
    const element = menu.current!;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) dismiss.current();
    };
    const close = () => dismiss.current();
    const scroll = (event: Event) => {
      if (!element.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [x, y]);
  return createPortal(
    <div
      ref={menu}
      className="session-context-menu"
      role="menu"
      aria-label={`Terminal actions for ${name}`}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onDismiss(true);
        } else if (
          ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          const items = [
            ...menu.current!.querySelectorAll<HTMLButtonElement>("button"),
          ];
          const current = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const index =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[index]?.focus();
        }
      }}
    >
      <span className="session-context-name">{name}</span>
      <button role="menuitem" onClick={onAppearance}>
        <Palette size={14} /> Rename / change color
      </button>
      <button
        role="menuitem"
        className="session-context-close"
        onClick={onCloseTab}
      >
        <X size={14} />{" "}
        {paneCount > 1 ? `Close tab (${paneCount} panes)` : "Close terminal"}
      </button>
    </div>,
    document.body,
  );
}
