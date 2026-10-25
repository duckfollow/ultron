import { useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import { TerminalPane, type TerminalHandle } from "./TerminalPane";
import { layoutRects, type Rect } from "./workspace-model";
import type { Pane, Tab } from "./workspace-types";
function position(rect: Rect): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}
export function SplitWorkspace({
  tab,
  visible,
  register,
  updatePane,
  focusPane,
  closePane,
  resize,
  editConnection,
  getConnection,
}: {
  getConnection: (id: string) => Pane["sshProfile"];
  editConnection: (profile: NonNullable<Pane["sshProfile"]>) => void;
  tab: Tab;
  visible: boolean;
  register: (id: string, handle: TerminalHandle | null) => void;
  updatePane: (id: string, patch: Partial<Pane>) => void;
  focusPane: (id: string) => void;
  closePane: (id: string) => void;
  resize: (id: string, ratio: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    axis: "columns" | "rows";
    parent: Rect;
    bounds: DOMRect;
  } | null>(null);
  const { panes, dividers } = layoutRects(tab.layout);
  return (
    <div
      ref={host}
      className={`tab-stage ${tab.panes.length > 1 ? "is-split" : ""}`}
      hidden={!visible}
    >
      {tab.panes.map((pane, index) => (
        <section
          key={pane.id}
          className={`pane-frame ${tab.activePane === pane.id ? "focused" : ""}`}
          style={position(panes.get(pane.id)!)}
          aria-label={`Pane ${index + 1}`}
        >
          {tab.panes.length > 1 && (
            <header
              className="pane-heading"
              onPointerDown={() => focusPane(pane.id)}
            >
              <button
                className="pane-focus"
                onClick={() => {
                  focusPane(pane.id);
                }}
                aria-label={`Focus pane ${index + 1}`}
              >
                <i className={`state-dot ${pane.state}`} />
                <span>{index + 1}</span>
                <span>
                  {pane.sshProfile
                    ? "SSH"
                    : (pane.info?.shell.split("/").pop() ?? "shell")}
                </span>
                <small>
                  {pane.state === "ended"
                    ? "Session ended"
                    : pane.title === "Shell"
                      ? ""
                      : pane.title}
                </small>
              </button>
              <button
                className="icon-button"
                aria-label={`Close pane ${index + 1}`}
                onClick={() => closePane(pane.id)}
              >
                <X size={12} />
              </button>
            </header>
          )}
          <div className="pane-content">
            <TerminalPane
              onRestart={() =>
                updatePane(pane.id, {
                  state: "starting",
                  info: undefined,
                  error: undefined,
                  sshProfile: pane.sshProfile
                    ? (getConnection(pane.sshProfile.id) ?? pane.sshProfile)
                    : undefined,
                })
              }
              onEdit={
                pane.sshProfile
                  ? () => editConnection(pane.sshProfile!)
                  : undefined
              }
              visible={visible}
              profileId={pane.sshProfile?.id}
              focused={visible && tab.activePane === pane.id}
              onFocus={() => focusPane(pane.id)}
              register={(handle) => register(pane.id, handle)}
              onReady={(info) => updatePane(pane.id, { info, state: "live" })}
              onTitle={(title) =>
                updatePane(pane.id, { title: title || "Shell" })
              }
              onExit={(error) => updatePane(pane.id, { state: "ended", error })}
              onSize={(cols, rows) => updatePane(pane.id, { cols, rows })}
            />
          </div>
          {pane.error && (
            <div className="error" role="alert">
              {pane.error}
            </div>
          )}
        </section>
      ))}
      {dividers.map((divider) => (
        <div
          key={divider.id}
          role="separator"
          tabIndex={0}
          aria-label={
            divider.axis === "columns"
              ? "Resize side-by-side panes"
              : "Resize stacked panes"
          }
          aria-orientation={
            divider.axis === "columns" ? "vertical" : "horizontal"
          }
          aria-valuemin={15}
          aria-valuemax={85}
          aria-valuenow={Math.round(divider.ratio * 100)}
          className={`pane-divider ${divider.axis}`}
          style={position(divider.rect)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: divider.id,
              axis: divider.axis,
              parent: divider.parent,
              bounds: host.current!.getBoundingClientRect(),
            };
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (
              !current ||
              current.id !== divider.id ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            const { bounds, parent, axis } = current;
            const ratio =
              axis === "columns"
                ? ((event.clientX - bounds.left) / bounds.width - parent.x) /
                  parent.width
                : ((event.clientY - bounds.top) / bounds.height - parent.y) /
                  parent.height;
            resize(divider.id, ratio);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onDoubleClick={() => resize(divider.id, 0.5)}
          onKeyDown={(event) => {
            const decrease =
              divider.axis === "columns" ? "ArrowLeft" : "ArrowUp";
            const increase =
              divider.axis === "columns" ? "ArrowRight" : "ArrowDown";
            if (
              event.key === decrease ||
              event.key === increase ||
              event.key === "Home" ||
              event.key === "End"
            ) {
              event.preventDefault();
              resize(
                divider.id,
                event.key === "Home"
                  ? 0.15
                  : event.key === "End"
                    ? 0.85
                    : divider.ratio + (event.key === increase ? 0.05 : -0.05),
              );
            }
          }}
        >
          <span />
        </div>
      ))}
    </div>
  );
}
