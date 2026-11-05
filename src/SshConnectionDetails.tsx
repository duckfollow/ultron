import { CopyToast } from "./CopyToast";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Copy, Eye, EyeOff, Pencil, Server, X } from "lucide-react";
import { profileAddress, type SshProfile } from "./ssh-model";

export function SshConnectionDetails({
  profile,
  onClose,
  onEdit,
}: {
  profile: SshProfile;
  onClose: () => void;
  onEdit: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy(value: string, label: string) {
    setError("");
    setCopied("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setError("Unable to copy to clipboard. Please try again.");
    }
  }
  async function secret(copyOnly: boolean) {
    if (busy) return;
    if (!copyOnly && visible) {
      setVisible(false);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const value =
        password ??
        (await invoke<string>("reveal_ssh_password", { id: profile.id }));
      setPassword(value);
      if (copyOnly) await copy(value, "Password");
      else setVisible(true);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  function row(label: string, value: string, copyable = true) {
    return (
      <div className="ssh-detail-row" key={label}>
        <dt>{label}</dt>
        <dd>{value || "—"}</dd>
        {copyable && value && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Copy ${label.toLowerCase()}`}
            title={`Copy ${label.toLowerCase()}`}
            onClick={() => void copy(value, label)}
          >
            {copied === label ? <Check size={15} /> : <Copy size={15} />}
          </button>
        )}
      </div>
    );
  }
  return (
    <dialog
      ref={dialog}
      className="help ssh-details-dialog"
      aria-labelledby="ssh-details-title"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id="ssh-details-title">
          <Server size={18} /> Connection details
        </h2>
        <button
          type="button"
          autoFocus
          className="icon-button"
          disabled={busy}
          aria-label="Close connection details"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="ssh-detail-intro">
        <h3>{profile.name}</h3>
        <span>{profile.group || "Ungrouped"}</span>
      </div>
      <dl className="ssh-detail-list">
        {row("Address", profileAddress(profile))}
        {row("Host", profile.host)}
        {row("Port", String(profile.port))}
        {row("Username", profile.username)}
        {row(
          "Authentication",
          {
            auto: "Auto · keys, then password",
            password: "Password",
            key: "SSH key",
          }[profile.authMethod ?? "auto"],
          false,
        )}
        {profile.authMethod !== "password" &&
          row(
            "SSH key path",
            profile.identityFile || "",
            !!profile.identityFile,
          )}
        {profile.rememberPassword && profile.authMethod !== "key" && (
          <div className="ssh-detail-row ssh-detail-password">
            <dt>Password</dt>
            <dd>{visible ? password : "••••••••"}</dd>
            <div className="ssh-detail-actions">
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                aria-label={visible ? "Hide SSH password" : "Show SSH password"}
                title={visible ? "Hide SSH password" : "Show SSH password"}
                onClick={() => void secret(false)}
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={busy}
                aria-label="Copy SSH password"
                title="Copy SSH password"
                onClick={() => void secret(true)}
              >
                {copied === "Password" ? (
                  <Check size={15} />
                ) : (
                  <Copy size={15} />
                )}
              </button>
            </div>
          </div>
        )}
      </dl>
      <p className="ssh-detail-status" role="status" aria-live="polite">
        {busy
          ? "Reading macOS Keychain…"
          : profile.rememberPassword
            ? "Saved password is read only when you choose Show or Copy."
            : "No password saved in Keychain."}
      </p>
      {copied && <CopyToast message={`${copied} copied`} />}
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
          Close
        </button>
        <button
          type="button"
          className="save-appearance"
          disabled={busy}
          onClick={onEdit}
        >
          <Pencil size={14} /> Edit connection
        </button>
      </div>
    </dialog>
  );
}
