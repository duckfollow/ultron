import { ConnectionToast } from "./ConnectionToast";
import { reorderRelative } from "./order-model";
import { useOrderDrag } from "./useOrderDrag";
import { useEffect, useRef, useState } from "react";
import {
  Ellipsis,
  Plus,
  Server,
  ServerPlus,
  X,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderInput,
  GripVertical,
} from "lucide-react";
import {
  profileAddress,
  groupSshProfiles,
  type ConnectTarget,
  type SshProfile,
} from "./ssh-model";
export function SshConnections({
  profiles,
  error,
  loading,
  onNew,
  onEdit,
  onConnect,
  onDelete,
  onMove,
  onReorder,
  canSplit,
  canConnect,
  compact,
}: {
  profiles: SshProfile[];
  compact: boolean;
  canConnect: boolean;
  error: string;
  loading: boolean;
  onNew: () => void;
  onEdit: (profile: SshProfile) => void;
  onConnect: (profile: SshProfile, target: ConnectTarget) => void;
  onDelete: (profile: SshProfile) => Promise<void>;
  onMove: (id: string, group: string, expectedGroup: string) => Promise<void>;
  onReorder: (id: string, targetId: string, after: boolean) => Promise<void>;
  canSplit: (target: "columns" | "rows") => boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null),
    [deleting, setDeleting] = useState<SshProfile | null>(null),
    [deleteError, setDeleteError] = useState(""),
    [busy, setBusy] = useState(false);
  const [groupOrder, setGroupOrder] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("ultron.ssh.group-order") ?? "[]",
      );
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  const orderedGroups = groupSshProfiles(profiles, groupOrder);
  const groupDrag = useOrderDrag(
    "ssh-group",
    orderedGroups.map((group) => group.name),
    (source, target, after) => {
      const next = reorderRelative(
        orderedGroups.map((group) => group.name),
        source,
        target,
        after,
        (name) => name,
      );
      try {
        localStorage.setItem("ultron.ssh.group-order", JSON.stringify(next));
        setGroupOrder(next);
        setMoveError("");
        setMoveNotice("Group order saved.");
        setUndo(null);
      } catch {
        setMoveError("Could not save group order. Please try again.");
      }
    },
  );
  const [rowDrop, setRowDrop] = useState<{ id: string; after: boolean } | null>(
    null,
  );
  function rowAt(x: number, y: number) {
    const node = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-ssh-profile]");
    if (!node) return null;
    return {
      id: node.dataset.sshProfile!,
      after:
        y >
        node.getBoundingClientRect().top +
          node.getBoundingClientRect().height / 2,
    };
  }
  async function reorderConnection(id: string, target: string, after: boolean) {
    if (moveLock.current) return;
    moveLock.current = true;
    setMoving(true);
    setMoveError("");
    try {
      await onReorder(id, target, after);
      setMoveNotice("Connection order saved.");
      setUndo(null);
    } catch (error) {
      setMoveError(String(error));
    } finally {
      moveLock.current = false;
      setMoving(false);
    }
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);
  const pointerDrag = useRef<{ x: number; y: number; active: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  function clearDrag() {
    pointerDrag.current = null;
    draggingRef.current = null;
    setDragging(null);
    setDropGroup(null);
    setRowDrop(null);
  }
  function destinationAt(x: number, y: number): string | null {
    return (
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-ssh-group]")
        ?.dataset.sshGroup ?? null
    );
  }
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearDrag();
    };
    window.addEventListener("keydown", cancel);
    window.addEventListener("blur", clearDrag);
    return () => {
      window.removeEventListener("keydown", cancel);
      window.removeEventListener("blur", clearDrag);
    };
  }, []);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const moveLock = useRef(false);
  const [moveError, setMoveError] = useState("");
  const [noticeId, setNoticeId] = useState(0);
  const [moveNotice, setMoveNoticeValue] = useState("");
  function setMoveNotice(message: string) {
    if (message) setNoticeId((id) => id + 1);
    setMoveNoticeValue(message);
  }
  const [undo, setUndo] = useState<{
    id: string;
    name: string;
    from: string;
    to: string;
  } | null>(null);
  const [moveProfile, setMoveProfile] = useState<SshProfile | null>(null);
  const [destination, setDestination] = useState("");
  const moveDialog = useRef<HTMLDialogElement>(null);
  const moveInput = useRef<HTMLInputElement>(null);
  function rememberCollapsed(next: string[]) {
    setCollapsed(next);
    try {
      localStorage.setItem("ultron.ssh.collapsed-groups", JSON.stringify(next));
    } catch {
      /* The current session still works without storage. */
    }
  }
  async function moveConnection(
    id: string,
    name: string,
    from: string,
    to: string,
    isUndo = false,
  ) {
    if (moveLock.current || from === to.trim()) return;
    moveLock.current = true;
    setMoving(true);
    setMoveError("");
    try {
      const target = to.trim();
      await onMove(id, target, from);
      rememberCollapsed(collapsed.filter((group) => group !== target));
      setUndo(isUndo ? null : { id, name, from, to: target });
      setMoveNotice(
        isUndo
          ? `Restored ${name} to ${target || "Ungrouped"}.`
          : `Moved ${name} to ${target || "Ungrouped"}.`,
      );
      setMoveProfile(null);
    } catch (error) {
      setMoveError(String(error));
    } finally {
      moveLock.current = false;
      setMoving(false);
    }
  }
  useEffect(() => {
    if (moveProfile) {
      moveDialog.current?.showModal();
      moveInput.current?.focus();
    }
  }, [moveProfile]);
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem("ultron.ssh.collapsed-groups") ?? "[]",
      );
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  });
  function toggleGroup(name: string) {
    setMenu(null);
    const next = collapsed.includes(name)
      ? collapsed.filter((group) => group !== name)
      : [...collapsed, name];
    rememberCollapsed(next);
  }
  const groups = compact
    ? [{ name: "", profiles: orderedGroups.flatMap((group) => group.profiles) }]
    : orderedGroups;
  if (!compact && dragging && !groups.some((group) => group.name === ""))
    groups.push({ name: "", profiles: [] });
  const [position, setPosition] = useState({ left: 205, top: 100 });
  const menuRef = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setMenu(null);
    setDragging(null);
    draggingRef.current = null;
    setDropGroup(null);
  }, [compact]);
  function close() {
    setMenu(null);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (
        !menuRef.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    menuRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  useEffect(() => {
    if (deleting) dialog.current?.showModal();
  }, [deleting]);
  return (
    <section className="ssh-connections" aria-label="Saved SSH connections">
      <div className="section-label">
        <span className="ssh-section-title">CONNECTIONS</span>
        <button
          className="icon-button"
          aria-label="Add SSH connection"
          title="Add SSH connection"
          onClick={onNew}
        >
          {compact ? <ServerPlus size={16} /> : <Plus size={13} />}
        </button>
      </div>
      {error && (
        <p className="ssh-list-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="ssh-empty">Loading connections…</p>
      ) : !profiles.length ? (
        <p className="ssh-empty">Save a server to connect in one click.</p>
      ) : (
        <div className="ssh-profile-list" onScroll={() => setMenu(null)}>
          {groups.map((group) => (
            <div
              className={`ssh-group${dropGroup === group.name ? " drop-target" : ""}${groupDrag.className(group.name)}`}
              data-order-kind="ssh-group"
              data-order-id={group.name}
              key={group.name}
              data-ssh-group={compact ? undefined : group.name}
            >
              {!compact && (
                <div className="ssh-group-heading">
                  <button
                    type="button"
                    className="ssh-group-grip"
                    aria-label={`Reorder group ${group.name || "Ungrouped"}`}
                    title="Drag to reorder · Option Shift ↑/↓"
                    disabled={moving}
                    {...groupDrag.props(group.name)}
                  >
                    <GripVertical size={12} />
                  </button>
                  <button
                    className="ssh-group-toggle"
                    aria-expanded={!collapsed.includes(group.name)}
                    onClick={() => {
                      if (!groupDrag.suppress.current) toggleGroup(group.name);
                    }}
                    onMouseEnter={(event) => {
                      const label = event.currentTarget.querySelector("span");
                      event.currentTarget.title =
                        label && label.scrollWidth > label.clientWidth
                          ? group.name || "Ungrouped"
                          : "";
                    }}
                  >
                    {collapsed.includes(group.name) ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    <Folder size={12} />
                    <span>{group.name || "Ungrouped"}</span>
                    <small>{group.profiles.length}</small>
                    {dropGroup === group.name && <em>Move here</em>}
                  </button>
                </div>
              )}
              {(compact || !collapsed.includes(group.name)) &&
                group.profiles.map((profile) => (
                  <div
                    className={`ssh-profile-row ${menu === profile.id ? "menu-open" : ""}${dragging === profile.id ? " dragging" : ""}${rowDrop?.id === profile.id ? (rowDrop.after ? " order-after" : " order-before") : ""}`}
                    data-ssh-profile={profile.id}
                    key={profile.id}
                    onPointerDown={(event) => {
                      if (
                        compact ||
                        moving ||
                        event.button !== 0 ||
                        (event.target as HTMLElement).closest(
                          ".ssh-profile-more, .ssh-profile-menu",
                        )
                      )
                        return;
                      suppressClick.current = false;
                      pointerDrag.current = {
                        x: event.clientX,
                        y: event.clientY,
                        active: false,
                      };
                    }}
                    onPointerMove={(event) => {
                      const state = pointerDrag.current;
                      if (!state) return;
                      if (
                        !state.active &&
                        Math.hypot(
                          event.clientX - state.x,
                          event.clientY - state.y,
                        ) < 6
                      )
                        return;
                      if (!state.active) {
                        state.active = true;
                        draggingRef.current = profile.id;
                        suppressClick.current = true;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDragging(profile.id);
                        setMenu(null);
                        setMoveError("");
                      }
                      event.preventDefault();
                      const target = destinationAt(
                        event.clientX,
                        event.clientY,
                      );
                      const row = rowAt(event.clientX, event.clientY);
                      const sameGroup =
                        target === (profile.group?.trim() ?? "");
                      setRowDrop(
                        sameGroup && row && row.id !== profile.id ? row : null,
                      );
                      setDropGroup(!sameGroup ? target : null);
                      const scroll =
                        event.currentTarget.closest<HTMLElement>(
                          ".ssh-profile-list",
                        );
                      if (scroll) {
                        const rect = scroll.getBoundingClientRect();
                        scroll.scrollTop +=
                          event.clientY < rect.top + 24
                            ? -12
                            : event.clientY > rect.bottom - 24
                              ? 12
                              : 0;
                      }
                    }}
                    onPointerUp={(event) => {
                      const active = pointerDrag.current?.active;
                      const target = active
                        ? destinationAt(event.clientX, event.clientY)
                        : null;
                      const row = active
                        ? rowAt(event.clientX, event.clientY)
                        : null;
                      clearDrag();
                      if (
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      if (!active) return;
                      event.preventDefault();
                      setTimeout(() => {
                        suppressClick.current = false;
                      }, 0);
                      if (
                        target === (profile.group?.trim() ?? "") &&
                        row &&
                        row.id !== profile.id
                      ) {
                        void reorderConnection(profile.id, row.id, row.after);
                      } else if (target !== null)
                        void moveConnection(
                          profile.id,
                          profile.name,
                          profile.group?.trim() ?? "",
                          target,
                        );
                    }}
                    onKeyDown={(event) => {
                      if (
                        !event.altKey ||
                        !event.shiftKey ||
                        !["ArrowUp", "ArrowDown"].includes(event.key) ||
                        moving
                      )
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const index = group.profiles.findIndex(
                        (item) => item.id === profile.id,
                      );
                      const after = event.key === "ArrowDown";
                      const target = group.profiles[index + (after ? 1 : -1)];
                      if (target)
                        void reorderConnection(profile.id, target.id, after);
                    }}
                    onPointerCancel={() => {
                      clearDrag();
                      suppressClick.current = false;
                    }}
                    onLostPointerCapture={() => {
                      clearDrag();
                      setTimeout(() => {
                        suppressClick.current = false;
                      }, 0);
                    }}
                  >
                    <button
                      className="ssh-profile"
                      disabled={!canConnect}
                      aria-label={`Connect to ${profile.name}`}
                      title={`${profile.name}${profile.group ? ` · ${profile.group}` : ""} · ${profileAddress(profile)} · Connect in new tab`}
                      onClick={() => {
                        if (!draggingRef.current && !suppressClick.current)
                          onConnect(profile, "tab");
                      }}
                    >
                      {!compact && (
                        <GripVertical
                          size={10}
                          className="ssh-drag-grip"
                          aria-hidden="true"
                        />
                      )}
                      <Server size={13} />
                      <span>
                        {profile.name}
                        <small>{profileAddress(profile)}</small>
                      </span>
                    </button>
                    <button
                      className="ssh-profile-more"
                      aria-label={`Manage SSH connection ${profile.name}`}
                      title={`Manage ${profile.name}`}
                      aria-expanded={menu === profile.id}
                      aria-haspopup="menu"
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        setPosition({
                          left: Math.min(
                            window.innerWidth - 204,
                            rect.right + 8,
                          ),
                          top: Math.max(
                            8,
                            Math.min(window.innerHeight - 286, rect.top),
                          ),
                        });
                        setMenu(menu === profile.id ? null : profile.id);
                      }}
                    >
                      <Ellipsis size={13} />
                    </button>
                    {menu === profile.id && (
                      <div
                        ref={menuRef}
                        className="ssh-profile-menu"
                        style={position}
                        role="menu"
                        aria-label={`Manage ${profile.name}`}
                        onKeyDown={(event) => {
                          if (
                            event.key === "ArrowDown" ||
                            event.key === "ArrowUp"
                          ) {
                            event.preventDefault();
                            const buttons = [
                              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                "button:not(:disabled)",
                              ),
                            ];
                            const index = buttons.indexOf(
                              document.activeElement as HTMLButtonElement,
                            );
                            buttons[
                              (index +
                                (event.key === "ArrowDown"
                                  ? 1
                                  : buttons.length - 1)) %
                                buttons.length
                            ]?.focus();
                          }
                        }}
                      >
                        <button
                          role="menuitem"
                          disabled={!canConnect}
                          onClick={() => {
                            close();
                            onConnect(profile, "tab");
                          }}
                        >
                          Connect in new tab
                        </button>
                        <button
                          role="menuitem"
                          disabled={!canSplit("columns")}
                          onClick={() => {
                            close();
                            onConnect(profile, "columns");
                          }}
                        >
                          Connect left / right
                        </button>
                        <button
                          role="menuitem"
                          disabled={!canSplit("rows")}
                          onClick={() => {
                            close();
                            onConnect(profile, "rows");
                          }}
                        >
                          Connect top / bottom
                        </button>
                        <hr />
                        <button
                          role="menuitem"
                          onClick={() => {
                            close();
                            onEdit(profile);
                          }}
                        >
                          Edit connection
                        </button>
                        <button
                          role="menuitem"
                          disabled={moving}
                          onClick={() => {
                            close();
                            setMoveError("");
                            setDestination(profile.group?.trim() ?? "");
                            setMoveProfile(profile);
                          }}
                        >
                          <FolderInput size={13} /> Move to group…
                        </button>
                        <button
                          role="menuitem"
                          className="delete-profile"
                          onClick={() => {
                            close();
                            setDeleteError("");
                            setDeleting(profile);
                          }}
                        >
                          Delete connection…
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      {(moveNotice || moveError || moving) && !moveProfile && (
        <ConnectionToast
          key={noticeId}
          message={moveError || (moving ? "Moving connection…" : moveNotice)}
          error={!!moveError}
          busy={moving}
          onUndo={
            undo && !moveError
              ? () =>
                  void moveConnection(
                    undo.id,
                    undo.name,
                    undo.to,
                    undo.from,
                    true,
                  )
              : undefined
          }
          onDismiss={() => {
            setMoveNotice("");
            setMoveError("");
            setUndo(null);
          }}
        />
      )}
      {moveProfile && (
        <dialog
          ref={moveDialog}
          className="help ssh-move-dialog"
          aria-labelledby="ssh-move-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!moving) setMoveProfile(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void moveConnection(
                moveProfile.id,
                moveProfile.name,
                moveProfile.group?.trim() ?? "",
                destination,
              );
            }}
          >
            <header>
              <h2 id="ssh-move-title">
                <FolderInput size={17} /> Move to group
              </h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close move connection"
                disabled={moving}
                onClick={() => setMoveProfile(null)}
              >
                <X size={16} />
              </button>
            </header>
            <p>
              Move “{moveProfile.name}” to an existing group, or type a new
              name.
            </p>
            <label className="ssh-move-label">
              Group
              <input
                ref={moveInput}
                list="ssh-move-groups"
                maxLength={60}
                disabled={moving}
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Ungrouped"
              />
            </label>
            <datalist id="ssh-move-groups">
              {groupSshProfiles(profiles)
                .filter((group) => group.name)
                .map((group) => (
                  <option key={group.name} value={group.name} />
                ))}
            </datalist>
            <small>Leave blank to move to Ungrouped.</small>
            {moveError && (
              <p role="alert" className="form-error">
                {moveError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                disabled={moving}
                onClick={() => setMoveProfile(null)}
              >
                Cancel
              </button>
              <button
                className="save-appearance"
                type="submit"
                disabled={
                  moving ||
                  destination.trim() === (moveProfile.group?.trim() ?? "")
                }
              >
                {moving ? "Moving…" : "Move connection"}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {deleting && (
        <dialog
          ref={dialog}
          className="help delete-ssh-dialog"
          aria-labelledby="delete-ssh-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setDeleting(null);
          }}
        >
          <header>
            <h2 id="delete-ssh-title">Delete connection?</h2>
            <button
              className="icon-button"
              disabled={busy}
              aria-label="Cancel delete connection"
              onClick={() => setDeleting(null)}
            >
              <X size={16} />
            </button>
          </header>
          <p>
            Remove “{deleting.name}” from saved connections? Open sessions will
            stay running.
          </p>
          {deleteError && (
            <p role="alert" className="form-error">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              autoFocus
              className="subtle-button"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              className="save-appearance"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onDelete(deleting)
                  .then(() => setDeleting(null))
                  .catch((error) => setDeleteError(String(error)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
