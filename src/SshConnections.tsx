import { useEffect, useRef, useState } from "react";
import { Ellipsis, Plus, Server, X } from "lucide-react";
import {
  profileAddress,
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
  canSplit: (target: "columns" | "rows") => boolean;
}) {
  const [menu, setMenu] = useState<string | null>(null),
    [deleting, setDeleting] = useState<SshProfile | null>(null),
    [deleteError, setDeleteError] = useState(""),
    [busy, setBusy] = useState(false);
  const [position, setPosition] = useState({ left: 205, top: 100 });
  const menuRef = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => setMenu(null), [compact]);
  function close() {
    setMenu(null);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
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
          {compact ? <Server size={16} /> : <Plus size={13} />}
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
          {profiles.map((profile) => (
            <div className="ssh-profile-row" key={profile.id}>
              <button
                className="ssh-profile"
                disabled={!canConnect}
                aria-label={`Connect to ${profile.name}`}
                title={`${profile.name} · ${profileAddress(profile)} · Connect in new tab`}
                onClick={() => onConnect(profile, "tab")}
              >
                <Server size={13} />
                <span>
                  {profile.name}
                  <small>{profileAddress(profile)}</small>
                </span>
              </button>
              <button
                className="ssh-profile-more"
                aria-label={`Manage SSH connection ${profile.name}`}
                aria-expanded={menu === profile.id}
                aria-haspopup="menu"
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPosition({
                    left: Math.min(window.innerWidth - 204, rect.right + 8),
                    top: Math.max(
                      8,
                      Math.min(window.innerHeight - 246, rect.top),
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
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
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
