import { createPortal } from "react-dom";
import { ConnectionToast } from "./ConnectionToast";
import { reorderRelative } from "./order-model";
import { useOrderDrag } from "./useOrderDrag";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Pencil,
  Ellipsis,
  Plus,
  Server,
  ServerPlus,
  X,
  Search,
  Check,
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
  activeProfileId,
  profileStates,
  error,
  loading,
  onNew,
  onEdit,
  onConnect,
  onDelete,
  onMove,
  onRenameGroup,
  onReorder,
  canSplit,
  canConnect,
  compact,
}: {
  profiles: SshProfile[];
  activeProfileId?: string;
  profileStates: Record<string, "starting" | "live" | "ended">;
  compact: boolean;
  canConnect: boolean;
  error: string;
  loading: boolean;
  onNew: () => void;
  onEdit: (profile: SshProfile) => void;
  onConnect: (profile: SshProfile, target: ConnectTarget) => void;
  onDelete: (profile: SshProfile) => Promise<void>;
  onRenameGroup: (from: string, to: string) => Promise<void>;
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const renameLock = useRef(false);
  const renameButton = useRef<HTMLButtonElement>(null);
  function cancelRename() {
    if (renameLock.current) return;
    setRenaming(false);
    setRenameError("");
    requestAnimationFrame(() => renameButton.current?.focus());
  }
  async function renameFolder() {
    if (!openGroup || renameLock.current) return;
    const next = folderName.trim();
    if (
      !next ||
      [...next].length > 60 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(next)
    ) {
      setRenameError(
        "Enter a folder name up to 60 characters, without control characters.",
      );
      return;
    }
    if (
      next.toLowerCase() === "ungrouped" ||
      groups.some(
        (group) =>
          group.name !== openGroup &&
          group.name.toLowerCase() === next.toLowerCase(),
      )
    ) {
      setRenameError(
        "A folder with this name already exists. Choose another name.",
      );
      return;
    }
    if (next === openGroup) {
      cancelRename();
      return;
    }
    renameLock.current = true;
    setRenameBusy(true);
    setRenameError("");
    try {
      await onRenameGroup(openGroup, next);
      const order = groups.map((group) =>
        group.name === openGroup ? next : group.name,
      );
      setGroupOrder(order);
      try {
        localStorage.setItem("ultron.ssh.group-order", JSON.stringify(order));
      } catch {
        /* Keep the new order for this session. */
      }
      setOpenGroup(next);
      setRenaming(false);
      setUndo(null);
      requestAnimationFrame(() => renameButton.current?.focus());
    } catch (error) {
      setRenameError(String(error));
    } finally {
      renameLock.current = false;
      setRenameBusy(false);
    }
  }
  const [query, setQuery] = useState("");
  const picker = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const groupTrigger = useRef<HTMLButtonElement | null>(null);
  const groups = orderedGroups;
  const selectedGroup = groups.find((group) => group.name === openGroup);
  function closePicker() {
    if (renameLock.current) return;
    setRenaming(false);
    setRenameError("");
    setMenu(null);
    setOpenGroup(null);
    requestAnimationFrame(() => groupTrigger.current?.focus());
  }
  function connect(profile: SshProfile, target: ConnectTarget) {
    if (renameLock.current) return;
    closePicker();
    onConnect(profile, target);
  }
  useEffect(() => {
    if (openGroup !== null) {
      picker.current?.showModal();
      searchInput.current?.focus();
    }
  }, [openGroup]);
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
        event.preventDefault();
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
              <div className="ssh-group-heading">
                {!compact && (
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
                )}
                <button
                  className={`ssh-group-toggle ssh-project-button${group.profiles.some((profile) => profile.id === activeProfileId) ? " active" : ""}`}
                  title={group.name || "Ungrouped"}
                  aria-label={`Choose connection in ${group.name || "Ungrouped"}`}
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    if (groupDrag.suppress.current) return;
                    groupTrigger.current = event.currentTarget;
                    setMenu(null);
                    setQuery("");
                    setOpenGroup(group.name);
                  }}
                >
                  <Folder size={compact ? 19 : 15} />
                  <span>
                    {group.name || "Ungrouped"}
                    {group.profiles.find(
                      (profile) => profile.id === activeProfileId,
                    ) && (
                      <small>
                        {
                          group.profiles.find(
                            (profile) => profile.id === activeProfileId,
                          )?.name
                        }
                      </small>
                    )}
                  </span>
                  <small>{group.profiles.length}</small>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {openGroup !== null &&
        createPortal(
          <dialog
            ref={picker}
            className="help ssh-picker"
            aria-labelledby="ssh-picker-title"
            onCancel={(event) => {
              event.preventDefault();
              if (renaming) cancelRename();
              else closePicker();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                const rect = event.currentTarget.getBoundingClientRect();
                if (
                  event.clientX < rect.left ||
                  event.clientX > rect.right ||
                  event.clientY < rect.top ||
                  event.clientY > rect.bottom
                )
                  closePicker();
              }
            }}
          >
            <header>
              <span className="ssh-picker-folder" aria-hidden="true">
                <Folder size={21} />
              </span>
              <div className="ssh-picker-heading">
                <span className="ssh-picker-eyebrow">Connection folder</span>
                <h2 id="ssh-picker-title">
                  <span className="ssh-picker-name">
                    {openGroup || "Ungrouped"}
                  </span>
                  {!!openGroup && !renaming && (
                    <button
                      ref={renameButton}
                      className="icon-button"
                      disabled={moving}
                      aria-label="Rename folder"
                      title="Rename folder"
                      onClick={() => {
                        setFolderName(openGroup);
                        setRenameError("");
                        setRenaming(true);
                        setMenu(null);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </h2>
                <p>
                  {selectedGroup?.profiles.length ?? 0} saved{" "}
                  {selectedGroup?.profiles.length === 1
                    ? "connection"
                    : "connections"}
                </p>
              </div>
              <button
                className="icon-button"
                disabled={renameBusy}
                aria-label="Close connection picker"
                onClick={closePicker}
              >
                <X size={18} />
              </button>
            </header>
            {renaming && (
              <form
                className="ssh-folder-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  void renameFolder();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelRename();
                  }
                }}
              >
                <label htmlFor="ssh-folder-name">Folder name</label>
                <div>
                  <input
                    id="ssh-folder-name"
                    autoFocus
                    value={folderName}
                    maxLength={60}
                    disabled={renameBusy}
                    aria-invalid={!!renameError}
                    aria-describedby={
                      renameError ? "ssh-folder-error" : undefined
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      setFolderName(event.target.value);
                      setRenameError("");
                    }}
                  />
                  <button type="submit" disabled={renameBusy}>
                    {renameBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={renameBusy}
                    onClick={cancelRename}
                  >
                    Cancel
                  </button>
                </div>
                {renameError && (
                  <p id="ssh-folder-error" role="alert">
                    {renameError}
                  </p>
                )}
              </form>
            )}
            <label className="ssh-picker-search">
              <Search size={16} />
              <input
                disabled={renameBusy}
                ref={searchInput}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setMenu(null);
                }}
                placeholder="Search connections or host…"
                aria-label="Search connections"
              />
            </label>
            {!canConnect && (
              <p className="ssh-picker-hint" role="status">
                All 12 panes are in use. Close a pane to open another
                connection.
              </p>
            )}
            <div className="ssh-picker-list-label">
              <span>
                {query.trim() ? "SEARCH RESULTS" : "SAVED CONNECTIONS"}
              </span>
              <span aria-live="polite">
                {selectedGroup?.profiles.filter((profile) =>
                  `${profile.name} ${profileAddress(profile)}`
                    .toLowerCase()
                    .includes(query.trim().toLowerCase()),
                ).length ?? 0}
              </span>
            </div>
            <div
              inert={renameBusy}
              className="ssh-picker-list"
              onScroll={() => setMenu(null)}
            >
              {selectedGroup ? (
                [selectedGroup].map((group) => (
                  <div key={group.name} data-ssh-group={group.name}>
                    {group.profiles
                      .filter((profile) =>
                        `${profile.name} ${profileAddress(profile)}`
                          .toLowerCase()
                          .includes(query.trim().toLowerCase()),
                      )
                      .map((profile) => (
                        <div
                          className={`ssh-profile-row${activeProfileId === profile.id ? " is-current" : ""} ${menu === profile.id ? "menu-open" : ""}${dragging === profile.id ? " dragging" : ""}${rowDrop?.id === profile.id ? (rowDrop.after ? " order-after" : " order-before") : ""}`}
                          data-ssh-profile={profile.id}
                          key={profile.id}
                          onPointerDown={(event) => {
                            if (
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
                              event.currentTarget.setPointerCapture(
                                event.pointerId,
                              );
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
                              sameGroup && row && row.id !== profile.id
                                ? row
                                : null,
                            );
                            setDropGroup(!sameGroup ? target : null);
                            const scroll =
                              event.currentTarget.closest<HTMLElement>(
                                ".ssh-picker-list",
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
                              event.currentTarget.hasPointerCapture(
                                event.pointerId,
                              )
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
                              void reorderConnection(
                                profile.id,
                                row.id,
                                row.after,
                              );
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
                            const target =
                              group.profiles[index + (after ? 1 : -1)];
                            if (target)
                              void reorderConnection(
                                profile.id,
                                target.id,
                                after,
                              );
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
                              if (
                                !draggingRef.current &&
                                !suppressClick.current
                              )
                                connect(profile, "tab");
                            }}
                          >
                            {
                              <GripVertical
                                size={10}
                                className="ssh-drag-grip"
                                aria-hidden="true"
                              />
                            }
                            <span
                              className="ssh-picker-server"
                              aria-hidden="true"
                            >
                              <Server size={19} />
                            </span>
                            <span className="ssh-picker-connection-name">
                              {profile.name}
                              <small>{profileAddress(profile)}</small>
                            </span>
                          </button>
                          <ArrowUpRight
                            className="ssh-picker-connect-arrow"
                            size={16}
                            aria-hidden="true"
                          />
                          {profileStates[profile.id] && (
                            <span
                              className={`connection-state ${profileStates[profile.id]}`}
                            >
                              <i
                                className={`state-dot ${profileStates[profile.id]}`}
                                aria-hidden="true"
                              />
                              {profileStates[profile.id] === "live"
                                ? "Session active"
                                : profileStates[profile.id] === "starting"
                                  ? "Connecting"
                                  : "Disconnected"}
                            </span>
                          )}
                          {activeProfileId === profile.id && (
                            <span className="ssh-current">
                              <Check size={13} />
                              <span className="ssh-current-label">Current</span>
                            </span>
                          )}
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
                                  connect(profile, "tab");
                                }}
                              >
                                Connect in new tab
                              </button>
                              <button
                                role="menuitem"
                                disabled={!canSplit("columns")}
                                onClick={() => {
                                  close();
                                  connect(profile, "columns");
                                }}
                              >
                                Connect left / right
                              </button>
                              <button
                                role="menuitem"
                                disabled={!canSplit("rows")}
                                onClick={() => {
                                  close();
                                  connect(profile, "rows");
                                }}
                              >
                                Connect top / bottom
                              </button>
                              <hr />
                              <button
                                role="menuitem"
                                onClick={() => {
                                  close();
                                  closePicker();
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
                                  closePicker();
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
                                  closePicker();
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
                    {!group.profiles.some((profile) =>
                      `${profile.name} ${profileAddress(profile)}`
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                    ) && (
                      <p className="ssh-picker-empty">
                        No connections found. Try another name or host.
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="ssh-picker-empty">
                  This group has no saved connections.
                </p>
              )}
            </div>
            <footer inert={renameBusy}>
              <span className="ssh-picker-footer-hint">
                <kbd>esc</kbd> to close
              </span>
              <button
                onClick={() => {
                  closePicker();
                  onNew();
                }}
              >
                <Plus size={14} /> Add connection
              </button>
            </footer>
          </dialog>,
          document.body,
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
