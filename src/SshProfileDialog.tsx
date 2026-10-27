import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  FolderOpen,
  Server,
  X,
  LockKeyhole,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import type { SshProfile, SshAuthMethod } from "./ssh-model";
export function SshProfileDialog({
  initial,
  onClose,
  onSaved,
  canConnect,
  onForgot,
}: {
  initial: SshProfile;
  canConnect: boolean;
  onForgot: (profiles: SshProfile[]) => void;
  onClose: () => void;
  onSaved: (
    profiles: SshProfile[],
    saved: SshProfile,
    connect: boolean,
  ) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    nameInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({
      ...initial,
      authMethod: initial.authMethod ?? "auto",
      rememberPassword: initial.rememberPassword ?? false,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""),
    [storedAvailable, setStoredAvailable] = useState(
      initial.rememberPassword ?? false,
    );
  useEffect(() => {
    dialog.current?.showModal();
    nameInput.current?.focus();
  }, []);
  const patch = (change: Partial<SshProfile>) => {
    const endpointChanged =
      (change.host !== undefined && change.host !== draft.host) ||
      (change.port !== undefined && change.port !== draft.port) ||
      (change.username !== undefined && change.username !== draft.username);
    if (endpointChanged || change.authMethod === "key") {
      setPassword("");
      setStoredAvailable(false);
    }
    setDraft((old) => ({
      ...old,
      ...change,
      ...(endpointChanged || change.authMethod === "key"
        ? { rememberPassword: false }
        : {}),
    }));
  };
  async function forget() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const profiles = await invoke<SshProfile[]>("forget_ssh_password", {
        id: initial.id,
      });
      setPassword("");
      setStoredAvailable(false);
      setDraft((old) => ({ ...old, rememberPassword: false }));
      onForgot(profiles);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function save(connectAfter: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const profile = {
        ...draft,
        name: draft.name.trim(),
        host: draft.host.trim(),
        username: draft.username.trim(),
        identityFile: draft.identityFile.trim(),
      };
      const profiles = await invoke<SshProfile[]>("save_ssh_profile", {
        profile,
        password: profile.rememberPassword && password ? password : null,
      });
      const saved =
        profiles.find((p) => p.id === profile.id) ??
        profiles[profiles.length - 1];
      onSaved(profiles, saved, connectAfter);
    } catch (error) {
      setError(String(error));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="help ssh-dialog"
      aria-labelledby="ssh-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          void save(submitter?.value === "connect");
        }}
      >
        <header>
          <h2 id="ssh-dialog-title">
            <Server size={17} />
            {initial.id ? "Edit SSH connection" : "New SSH connection"}
          </h2>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            aria-label="Close SSH connection form"
          >
            <X size={17} />
          </button>
        </header>
        <fieldset disabled={busy} className="ssh-fields">
          <label>
            Name
            <input
              ref={nameInput}
              autoFocus
              required
              maxLength={80}
              value={draft.name}
              placeholder="Development server"
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          <div className="ssh-field-row">
            <label>
              Host
              <input
                required
                maxLength={253}
                value={draft.host}
                placeholder="server.example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => patch({ host: event.target.value })}
              />
            </label>
            <label className="ssh-port">
              Port
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={draft.port || ""}
                onChange={(event) =>
                  patch({ port: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <label>
            Username
            <input
              required
              maxLength={128}
              value={draft.username}
              placeholder="deploy"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => patch({ username: event.target.value })}
            />
          </label>
          <label>
            Authentication
            <select
              value={draft.authMethod}
              onChange={(event) =>
                patch({ authMethod: event.target.value as SshAuthMethod })
              }
            >
              <option value="auto">Auto</option>
              <option value="password">Password</option>
              <option value="key">SSH key</option>
            </select>
          </label>
          {draft.authMethod !== "password" && (
            <label>
              SSH key{" "}
              {draft.authMethod === "auto" && (
                <span className="optional">Optional</span>
              )}
              <div className="ssh-key-field">
                <input
                  value={draft.identityFile}
                  required={draft.authMethod === "key"}
                  placeholder={
                    draft.authMethod === "key"
                      ? "~/.ssh/id_ed25519"
                      : "Use ssh-agent / default keys"
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) =>
                    patch({ identityFile: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Choose SSH key file"
                  title="Choose SSH key file"
                  onClick={() => {
                    void open({
                      title: "Choose SSH identity file",
                      multiple: false,
                      directory: false,
                    })
                      .then((path) => {
                        if (typeof path === "string")
                          patch({ identityFile: path });
                      })
                      .catch((error) => setError(String(error)));
                  }}
                >
                  <FolderOpen size={16} />
                </button>
              </div>
            </label>
          )}
          {draft.authMethod !== "key" && (
            <div className="remember-password">
              <div className="keychain-heading">
                <span className="keychain-icon">
                  <LockKeyhole size={18} />
                </span>
                <div>
                  <strong>Password storage</strong>
                  <span>Protected by macOS Keychain</span>
                </div>
              </div>
              <label className="remember-toggle">
                <input
                  type="checkbox"
                  checked={draft.rememberPassword}
                  onChange={(event) => {
                    patch({ rememberPassword: event.target.checked });
                    if (!event.target.checked) setPassword("");
                  }}
                />{" "}
                Remember password in Keychain
              </label>
              {draft.rememberPassword && (
                <label>
                  SSH password
                  <input
                    type="password"
                    autoComplete="off"
                    aria-label="SSH password to remember"
                    value={password}
                    required={!storedAvailable}
                    maxLength={8192}
                    placeholder={
                      storedAvailable
                        ? "Leave blank to keep saved password"
                        : "Enter this server’s SSH password"
                    }
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              )}
              {initial.id && initial.rememberPassword && (
                <button
                  type="button"
                  className="forget-password"
                  disabled={busy || !storedAvailable}
                  onClick={() => void forget()}
                >
                  Forget password
                </button>
              )}
              {draft.rememberPassword ? (
                <div className="keychain-explainer">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <div>
                    <strong>macOS may ask for permission</strong>
                    <p>
                      If a Keychain window appears, enter your{" "}
                      <b>Mac login password</b>. This unlocks access to your
                      saved SSH password.
                    </p>
                    <p>
                      <b>Allow</b> grants access this time. <b>Always Allow</b>{" "}
                      remembers access for this app.
                    </p>
                  </div>
                </div>
              ) : (
                <p>
                  Enter your SSH password in the terminal each time you connect.
                </p>
              )}
              <p className="keychain-footnote">
                SSH passwords stay in Keychain. OTP / 2FA codes are never saved.
              </p>
            </div>
          )}
        </fieldset>
        <p className="ssh-hint">
          {draft.rememberPassword && draft.authMethod !== "key"
            ? "Uses your saved SSH password when requested. macOS controls Keychain access."
            : draft.authMethod === "password"
              ? "Your password is requested in the terminal. The server must allow password sign-in."
              : draft.authMethod === "key"
                ? "Choose a private key. Its passphrase, if needed, is requested in the terminal and is not saved."
                : "Tries SSH keys first, then asks for a password if the server allows it."}{" "}
          New host verification appears in the terminal.
        </p>
        {busy && draft.rememberPassword && (
          <div className="keychain-progress" role="status" aria-live="polite">
            <LoaderCircle size={17} className="keychain-spinner" />
            <div>
              <strong>Waiting for macOS Keychain…</strong>
              <span>
                If macOS asks, use your Mac login password in its permission
                window.
              </span>
            </div>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="subtle-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="secondary-action"
            disabled={busy}
            type="submit"
            value="save"
          >
            Save
          </button>
          <button
            className="save-appearance"
            disabled={busy || !canConnect}
            title={
              !canConnect
                ? "Close a terminal session before connecting"
                : undefined
            }
            type="submit"
            value="connect"
          >
            {busy ? "Saving…" : "Save & connect"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
