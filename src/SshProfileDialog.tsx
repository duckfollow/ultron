import { CopyToast } from "./CopyToast";
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
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import type { SshProfile } from "./ssh-model";
export function SshProfileDialog({
  initial,
  groups,
  onClose,
  onSaved,
  canConnect,
  onForgot,
}: {
  initial: SshProfile;
  groups: string[];
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
      group: initial.group ?? "",
      authMethod: initial.authMethod ?? "auto",
      rememberPassword: initial.rememberPassword ?? false,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""),
    [storedAvailable, setStoredAvailable] = useState(
      initial.rememberPassword ?? false,
    );
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [copied, setCopied] = useState<"password" | "key" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copyValue(value: string, field: "password" | "key") {
    setCopied(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
    } catch {
      setError("Unable to copy to clipboard. Please try again.");
    }
  }
  async function passwordAction(copy: boolean) {
    if (busy) return;
    if (!copy && passwordVisible) {
      setPasswordVisible(false);
      return;
    }
    setError("");
    let value = password;
    if (!value && storedAvailable) {
      setBusy(true);
      try {
        value = await invoke<string>("reveal_ssh_password", { id: initial.id });
        setPassword(value);
      } catch (error) {
        setError(String(error));
        return;
      } finally {
        setBusy(false);
      }
    }
    if (!value) return;
    if (copy) await copyValue(value, "password");
    else setPasswordVisible(true);
  }
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
      setPasswordVisible(false);
      setCopied(null);
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
      setPasswordVisible(false);
      setCopied(null);
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
        group: draft.group?.trim() ?? "",
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
          <span className="ssh-dialog-emblem" aria-hidden="true">
            <Server size={22} />
          </span>
          <div className="ssh-dialog-heading">
            <span className="ssh-dialog-eyebrow">SSH CONNECTION</span>
            <h2 id="ssh-dialog-title">
              {initial.id ? "Edit connection" : "New connection"}
            </h2>
          </div>
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
        <p className="ssh-form-subtitle">
          Save your server details, choose how to sign in, then connect.
        </p>
        <fieldset disabled={busy} className="ssh-fields">
          <section
            className="ssh-form-section"
            aria-labelledby="ssh-server-section"
          >
            <div className="ssh-section-heading">
              <span aria-hidden="true">01</span>
              <h3 id="ssh-server-section">Server details</h3>
            </div>
            <div className="ssh-form-basics">
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
              <label>
                Connection folder <span className="optional">Optional</span>
                <input
                  list="ssh-group-options"
                  maxLength={60}
                  value={draft.group}
                  placeholder="e.g. Production"
                  onChange={(event) => patch({ group: event.target.value })}
                />
                <datalist id="ssh-group-options">
                  {groups.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
                <small className="ssh-group-hint">
                  Choose a folder or type a new name.
                </small>
              </label>
            </div>
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
          </section>
          <section
            className="ssh-form-section"
            aria-labelledby="ssh-auth-section"
          >
            <div className="ssh-section-heading">
              <span aria-hidden="true">02</span>
              <h3 id="ssh-auth-section">Sign-in method</h3>
            </div>
            <div
              className="ssh-auth-options"
              role="radiogroup"
              aria-label="Authentication"
            >
              {(
                [
                  ["auto", "Auto", "Try keys, then password"],
                  ["password", "Password", "Sign in with a password"],
                  ["key", "SSH key", "Use a private key file"],
                ] as const
              ).map(([value, title, description]) => (
                <label
                  key={value}
                  className={`ssh-auth-option${draft.authMethod === value ? " selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="ssh-auth"
                    value={value}
                    checked={draft.authMethod === value}
                    onChange={() => patch({ authMethod: value })}
                  />
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
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
                    disabled={!draft.identityFile}
                    aria-label={
                      copied === "key"
                        ? "SSH key path copied"
                        : "Copy SSH key path"
                    }
                    title={copied === "key" ? "Copied" : "Copy SSH key path"}
                    onClick={() => void copyValue(draft.identityFile, "key")}
                  >
                    {copied === "key" ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
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
                      if (!event.target.checked) {
                        setPassword("");
                        setPasswordVisible(false);
                        setCopied(null);
                      }
                    }}
                  />{" "}
                  Remember password in Keychain
                </label>
                {draft.rememberPassword && (
                  <div>
                    <label htmlFor="ssh-password">SSH password</label>
                    <div className="ssh-secret-field">
                      <input
                        id="ssh-password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-label="SSH password to remember"
                        value={password}
                        required={!storedAvailable}
                        maxLength={8192}
                        placeholder={
                          storedAvailable
                            ? "Leave blank to keep saved password"
                            : "Enter this server’s SSH password"
                        }
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setCopied(null);
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        disabled={!password && !storedAvailable}
                        aria-label={
                          passwordVisible
                            ? "Hide SSH password"
                            : "Show SSH password"
                        }
                        title={
                          passwordVisible
                            ? "Hide SSH password"
                            : "Show SSH password"
                        }
                        aria-pressed={passwordVisible}
                        onClick={() => void passwordAction(false)}
                      >
                        {passwordVisible ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={!password && !storedAvailable}
                        aria-label={
                          copied === "password"
                            ? "SSH password copied"
                            : "Copy SSH password"
                        }
                        title={
                          copied === "password" ? "Copied" : "Copy SSH password"
                        }
                        onClick={() => void passwordAction(true)}
                      >
                        {copied === "password" ? (
                          <Check size={16} />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                  </div>
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
                  <details className="keychain-help">
                    <summary>
                      <ShieldCheck size={14} /> About macOS Keychain access
                    </summary>
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
                          <b>Allow</b> grants access this time.{" "}
                          <b>Always Allow</b> remembers access for this app.
                        </p>
                      </div>
                    </div>
                  </details>
                ) : (
                  <p>
                    Enter your SSH password in the terminal each time you
                    connect.
                  </p>
                )}
                <p className="keychain-footnote">
                  SSH passwords stay in Keychain. OTP / 2FA codes are never
                  saved.
                </p>
              </div>
            )}
          </section>
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
        {copied && (
          <CopyToast
            message={
              copied === "password" ? "Password copied" : "SSH key path copied"
            }
          />
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
