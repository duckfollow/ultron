import { useEffect, useId, useRef, useState } from "react";
import { Activity, Plus, Columns2, Rows2 } from "lucide-react";
import type { ConnectTarget } from "./ssh-model";
export function UtopMenu({
  active,
  canOpen,
  canSplit,
  onOpen,
}: {
  active: boolean;
  canOpen: boolean;
  canSplit: (axis: "columns" | "rows") => boolean;
  onOpen: (target: ConnectTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    first = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={root}
      className="utop-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className={`icon-button utop-toggle ${active ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Open Utop local system monitor"
        title="Utop · Local machine"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
      >
        <Activity size={16} />
      </button>
      {open && (
        <div
          className="utop-open-menu"
          id={id}
          role="group"
          aria-label="Open Utop"
        >
          <small>UTOP · LOCAL MACHINE</small>
          {(
            [
              ["tab", "Open in new tab", Plus],
              ["columns", "Split left / right", Columns2],
              ["rows", "Split top / bottom", Rows2],
            ] as const
          ).map(([target, label, Icon], index) => (
            <button
              ref={index === 0 ? first : undefined}
              key={target}
              disabled={target === "tab" ? !canOpen : !canSplit(target)}
              title={
                target !== "tab" && !canSplit(target)
                  ? "Select a larger pane, or close a pane to split"
                  : undefined
              }
              onClick={() => {
                setOpen(false);
                onOpen(target);
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
