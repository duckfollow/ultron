import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  CheckCircle2,
  FileJson,
  Folder,
  LoaderCircle,
  ShieldCheck,
  X,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  connectionTransferServices,
  type ConnectionTransferServices,
  type ImportPreview,
} from "./connection-transfer-api";
import { groupSshProfiles, profileAddress, type SshProfile } from "./ssh-model";
import "./connection-transfer.css";
export function ConnectionTransfer({
  profiles,
  initialGroup = null,
  initialMode = "import",
  onImported,
  onClose,
  services = connectionTransferServices,
}: {
  profiles: SshProfile[];
  initialGroup?: string | null;
  initialMode?: "import" | "export";
  onImported: (profiles: SshProfile[]) => void;
  onClose: () => void;
  services?: ConnectionTransferServices;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    panelId = useId();
  const [mode, setMode] = useState(initialMode);
  const [group, setGroup] = useState<string | null>(initialGroup);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filename, setFilename] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [locked, setLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [includePasswords, setIncludePasswords] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [unlockVisible, setUnlockVisible] = useState(false);
  const backupPasswordValid =
    Array.from(exportPassword).length >= 12 &&
    new TextEncoder().encode(exportPassword).length <= 1024 &&
    exportPassword.trim().length > 0;
  const passwordsMatch = exportPassword === confirmation;
  function changeMode(next: "import" | "export") {
    if (mode === next) return;
    setMode(next);
    setError("");
    setPreview(null);
    setFilename("");
    setSelectedPath("");
    setLocked(false);
    setUnlockPassword("");
    setIncludePasswords(false);
    setExportPassword("");
    setConfirmation("");
    setPasswordVisible(false);
    setUnlockVisible(false);
  }
  const [policy, setPolicy] = useState<"skip" | "replace">("skip");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    title: string;
    detail: string;
  } | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (success)
      dialog.current
        ?.querySelector<HTMLButtonElement>("footer button")
        ?.focus();
  }, [success]);
  const duplicates = preview?.conflicts.filter((v) => v !== null).length ?? 0;
  const newCount = (preview?.transfer.connections.length ?? 0) - duplicates;
  const overflow = preview ? preview.existingCount + newCount > 100 : false;
  const changes = newCount + (policy === "replace" ? duplicates : 0);
  const selected = profiles.filter(
    (p) => group === null || (p.group ?? "") === group,
  );
  async function choose() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const path = await services.chooseFile();
      if (typeof path !== "string") return;
      // Clear an older preview before reading another file, including invalid files.
      setPreview(null);
      setSelectedPath(path);
      setLocked(false);
      setUnlockPassword("");
      setUnlockVisible(false);
      setFilename(path.split(/[\\/]/).pop() ?? "connections.json");
      const inspection = await services.preview(path);
      setLocked(inspection.locked);
      setPreview(inspection.preview);
      setPolicy("skip");
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function unlock() {
    if (busy || !selectedPath || !unlockPassword) return;
    setBusy(true);
    setError("");
    try {
      const inspection = await services.preview(selectedPath, unlockPassword);
      if (!inspection.preview) throw new Error("Unable to unlock this backup.");
      setPreview(inspection.preview);
      setLocked(false);
      setUnlockVisible(false);
      setPolicy("skip");
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function importFile() {
    if (busy || !preview || overflow || !changes) return;
    setBusy(true);
    setError("");
    try {
      const source = preview.encrypted
        ? {
            filePath: selectedPath,
            fileDigest: preview.fileDigest!,
            backupPassword: unlockPassword,
          }
        : null;
      const result = await services.import(preview, policy, source);
      setUnlockPassword("");
      onImported(result.profiles);
      setSuccess({
        title: "Connections imported",
        detail: `${result.added} added · ${result.replaced} replaced · ${result.skipped} skipped.${result.passwordsImported ? ` ${result.passwordsImported} ${result.passwordsImported === 1 ? "password" : "passwords"} saved to Keychain.` : ""} Open sessions keep running.`,
      });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function exportFile() {
    if (
      busy ||
      !selected.length ||
      (includePasswords && (!backupPasswordValid || !passwordsMatch))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const name =
        group === null
          ? "ultron-connections.json"
          : `ultron-${group.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 50) || "folder"}.json`;
      const path = await services.chooseDestination(
        includePasswords ? "ultron-connections.encrypted.json" : name,
      );
      if (!path) return;
      const count = await services.export(
        path,
        group,
        includePasswords ? exportPassword : null,
      );
      setExportPassword("");
      setConfirmation("");
      setPasswordVisible(false);
      setSuccess({
        title: "Export saved",
        detail: `${count} ${count === 1 ? "connection" : "connections"} exported.${includePasswords ? " Saved passwords are included in the encrypted file. Keep your backup password safe; it cannot be recovered." : " Passwords are not included."} Private key contents are never included.`,
      });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="help connection-transfer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <header className="transfer-header">
        <span className="transfer-emblem" aria-hidden="true">
          <ArrowLeftRight size={21} />
        </span>
        <div>
          <span className="transfer-eyebrow">CONNECTIONS</span>
          <h2 id={titleId}>Import & export</h2>
        </div>
        <button
          autoFocus
          type="button"
          className="icon-button"
          disabled={busy}
          aria-label="Close import and export"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {success ? (
        <>
          <div className="transfer-success" role="status">
            <CheckCircle2 size={38} aria-hidden="true" />
            <h3>{success.title}</h3>
            <p>{success.detail}</p>
          </div>
          <footer>
            <button
              type="button"
              className="transfer-primary"
              onClick={onClose}
            >
              Done
            </button>
          </footer>
        </>
      ) : (
        <>
          <div
            className="transfer-tabs"
            role="tablist"
            aria-label="Connection transfer"
            onKeyDown={(event) => {
              if (
                busy ||
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "import"
                  : event.key === "End"
                    ? "export"
                    : mode === "import"
                      ? "export"
                      : "import";
              changeMode(next);
              event.currentTarget
                .querySelector<HTMLButtonElement>(
                  `#${CSS.escape(`${panelId}-${next}`)}`,
                )
                ?.focus();
            }}
          >
            {(
              [
                ["import", "Import", ArrowDownToLine],
                ["export", "Export", ArrowUpFromLine],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${panelId}-${value}`}
                aria-controls={panelId}
                aria-selected={mode === value}
                tabIndex={mode === value ? 0 : -1}
                disabled={busy}
                onClick={() => {
                  changeMode(value);
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <section
            className="transfer-body"
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${panelId}-${mode}`}
          >
            {mode === "import" ? (
              <>
                {!preview && (
                  <div className="transfer-intro">
                    <h3>Import connections</h3>
                    <p>Choose a JSON file exported from Ultron.</p>
                  </div>
                )}
                <div
                  className={`transfer-file${preview ? " is-selected" : ""}`}
                >
                  <FileJson size={25} aria-hidden="true" />
                  <div>
                    <strong>{filename || "Choose a connection file"}</strong>
                    <span>
                      {locked
                        ? "Encrypted backup · password required"
                        : preview?.encrypted
                          ? "Encrypted backup · unlocked"
                          : preview
                            ? "Ready to review"
                            : "JSON backups · up to 100 connections"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="transfer-secondary"
                    disabled={busy}
                    onClick={() => void choose()}
                  >
                    {preview || locked ? "Change file" : "Choose file"}
                  </button>
                </div>
                {locked && (
                  <form
                    className="transfer-unlock"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void unlock();
                    }}
                  >
                    <div className="transfer-secret-heading">
                      <LockKeyhole size={18} />
                      <div>
                        <h3>Unlock this backup</h3>
                        <p>
                          Enter the password set when this file was exported.
                        </p>
                      </div>
                    </div>
                    <label htmlFor={`${panelId}-unlock`}>Backup password</label>
                    <div className="transfer-password-field">
                      <input
                        id={`${panelId}-unlock`}
                        autoFocus
                        type={unlockVisible ? "text" : "password"}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={1024}
                        value={unlockPassword}
                        disabled={busy}
                        onChange={(event) =>
                          setUnlockPassword(event.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="icon-button"
                        disabled={busy}
                        aria-label={
                          unlockVisible
                            ? "Hide backup password"
                            : "Show backup password"
                        }
                        onClick={() => setUnlockVisible((v) => !v)}
                      >
                        {unlockVisible ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                    <button
                      className="transfer-primary"
                      type="submit"
                      disabled={busy || !unlockPassword}
                    >
                      {busy ? "Unlocking…" : "Unlock backup"}
                      <LockKeyhole size={14} />
                    </button>
                  </form>
                )}
                {preview && (
                  <>
                    <div className="transfer-summary" aria-live="polite">
                      <span>
                        <strong>{preview.transfer.connections.length}</strong>{" "}
                        in file
                      </span>
                      <span>
                        <strong>{newCount}</strong> new
                      </span>
                      <span>
                        <strong>{duplicates}</strong>{" "}
                        {duplicates === 1 ? "duplicate" : "duplicates"}
                      </span>
                    </div>
                    {preview.encrypted && (
                      <p className="transfer-secret-note">
                        <LockKeyhole size={14} />
                        {preview.passwordCount} saved{" "}
                        {preview.passwordCount === 1 ? "password" : "passwords"}{" "}
                        in this encrypted backup. Skipped entries keep their
                        current passwords.
                      </p>
                    )}
                    {duplicates > 0 && (
                      <div className="transfer-conflict-bar">
                        <label htmlFor={`${panelId}-duplicates`}>
                          Duplicate connections
                        </label>
                        <select
                          id={`${panelId}-duplicates`}
                          disabled={busy}
                          value={policy}
                          onChange={(event) =>
                            setPolicy(event.target.value as "skip" | "replace")
                          }
                        >
                          <option value="skip">
                            Skip · keep saved settings
                          </option>
                          <option value="replace">
                            Replace · use file settings
                          </option>
                        </select>
                        <span>Matched by host, port and username.</span>
                      </div>
                    )}
                    <div className="transfer-preview-heading">
                      <h3>Review connections</h3>
                      <span>
                        {preview.transfer.connections.length} in this file
                      </span>
                    </div>
                    <ul
                      className="transfer-preview"
                      aria-label="Connections to import"
                    >
                      {preview.transfer.connections.map((p, i) => (
                        <li key={i}>
                          <span
                            className="transfer-row-icon"
                            aria-hidden="true"
                          >
                            <Folder size={15} />
                          </span>
                          <div>
                            <strong>{p.name}</strong>
                            <span>
                              {profileAddress({
                                ...p,
                                id: "",
                                rememberPassword: false,
                              })}
                            </span>
                            <small>
                              {p.group || "Ungrouped"}
                              {preview.conflicts[i] !== null
                                ? ` · matches ${preview.conflicts[i]}`
                                : ""}
                            </small>
                          </div>
                          <span
                            className={`transfer-action ${preview.conflicts[i] === null ? "add" : policy}`}
                          >
                            {preview.conflicts[i] === null
                              ? "Add"
                              : policy === "skip"
                                ? "Skip"
                                : "Replace"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!changes && (
                      <p className="transfer-note">
                        All connections already exist. Choose Replace duplicates
                        to update them, or select another file.
                      </p>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="transfer-intro">
                  <h3>Export connections</h3>
                  <p>
                    Save a local backup or move your servers to another Mac.
                  </p>
                </div>
                <label className="transfer-scope">
                  Connections to export
                  <select
                    value={group === null ? "all" : `folder:${group}`}
                    disabled={busy}
                    onChange={(event) =>
                      setGroup(
                        event.target.value === "all"
                          ? null
                          : event.target.value.slice(7),
                      )
                    }
                  >
                    <option value="all">
                      All connections ({profiles.length})
                    </option>
                    {groupSshProfiles(profiles).map((g) => (
                      <option key={g.name} value={`folder:${g.name}`}>
                        {g.name || "Ungrouped"} ({g.profiles.length})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="transfer-export-card">
                  <FileJson size={32} aria-hidden="true" />
                  <div>
                    <strong>
                      {selected.length}{" "}
                      {selected.length === 1 ? "connection" : "connections"}
                    </strong>
                    <span>
                      {group === null
                        ? `${groupSshProfiles(selected).length} ${groupSshProfiles(selected).length === 1 ? "folder" : "folders"} · Ultron JSON`
                        : `${group || "Ungrouped"} · Ultron JSON`}
                    </span>
                  </div>
                </div>
                <fieldset className="transfer-protection" disabled={busy}>
                  <label className="transfer-secret-toggle">
                    <input
                      type="checkbox"
                      checked={includePasswords}
                      onChange={(event) => {
                        setIncludePasswords(event.target.checked);
                        setExportPassword("");
                        setConfirmation("");
                        setPasswordVisible(false);
                      }}
                    />
                    <span>
                      <strong>Include saved passwords</strong>
                      <small>Encrypt the whole backup with a password.</small>
                    </span>
                    <LockKeyhole size={18} aria-hidden="true" />
                  </label>
                  {includePasswords && (
                    <div className="transfer-protection-fields">
                      <p>
                        {
                          selected.filter(
                            (p) => p.rememberPassword && p.authMethod !== "key",
                          ).length
                        }{" "}
                        saved{" "}
                        {selected.filter(
                          (p) => p.rememberPassword && p.authMethod !== "key",
                        ).length === 1
                          ? "password"
                          : "passwords"}{" "}
                        · macOS may ask for Keychain access.
                      </p>
                      <label htmlFor={`${panelId}-backup`}>
                        Backup password
                      </label>
                      <div className="transfer-password-field">
                        <input
                          id={`${panelId}-backup`}
                          type={passwordVisible ? "text" : "password"}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={1024}
                          value={exportPassword}
                          onChange={(event) =>
                            setExportPassword(event.target.value)
                          }
                          aria-describedby={`${panelId}-password-help`}
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={
                            passwordVisible
                              ? "Hide backup password"
                              : "Show backup password"
                          }
                          onClick={() => setPasswordVisible((v) => !v)}
                        >
                          {passwordVisible ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                      <small id={`${panelId}-password-help`}>
                        At least 12 characters. Use a long password, not a short
                        PIN.
                      </small>
                      <label htmlFor={`${panelId}-confirm`}>
                        Confirm backup password
                      </label>
                      <div className="transfer-password-field">
                        <input
                          id={`${panelId}-confirm`}
                          type={passwordVisible ? "text" : "password"}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={1024}
                          value={confirmation}
                          onChange={(event) =>
                            setConfirmation(event.target.value)
                          }
                          aria-invalid={!!confirmation && !passwordsMatch}
                        />
                      </div>
                      {!!confirmation && !passwordsMatch && (
                        <p className="transfer-inline-error" role="status">
                          Passwords do not match.
                        </p>
                      )}
                      <p className="transfer-secret-warning">
                        Keep this password somewhere safe. Ultron cannot recover
                        it.
                      </p>
                    </div>
                  )}
                </fieldset>
                <div className="transfer-included">
                  <h4>Included in your file</h4>
                  <p>
                    Names, folders, hosts, ports, usernames, sign-in methods and
                    SSH key paths.
                  </p>
                </div>
                {!selected.length && (
                  <p className="transfer-note">
                    Add a connection before exporting.
                  </p>
                )}
              </>
            )}
            <div className="transfer-privacy">
              <ShieldCheck size={17} aria-hidden="true" />
              <p>
                {mode === "export" && includePasswords
                  ? "Saved SSH passwords are read from Keychain only when you export. Private keys are never included."
                  : locked
                    ? "This backup is encrypted. Unlock it to review connections before importing."
                    : mode === "import" && preview?.encrypted
                      ? "Saved passwords will be stored in macOS Keychain only after you import."
                      : "Plain JSON never includes passwords or private keys. SSH key paths may need updating on another Mac."}
              </p>
            </div>
            {overflow && (
              <p className="transfer-error" role="alert">
                This import would exceed 100 saved connections. Choose a smaller
                export or remove unused saved connections.
              </p>
            )}
            {error && (
              <p className="transfer-error" role="alert">
                {error}
              </p>
            )}
          </section>
          <footer>
            <span role="status" aria-live="polite">
              {busy ? (
                <>
                  <LoaderCircle size={14} className="update-spinning" />
                  {locked
                    ? "Unlocking backup…"
                    : mode === "export" && includePasswords
                      ? "Reading Keychain / encrypting…"
                      : "Working…"}
                </>
              ) : mode === "import" && preview ? (
                `${newCount} to add${duplicates ? ` · ${duplicates} to ${policy}` : ""}`
              ) : (
                "Local JSON file"
              )}
            </span>
            <button
              type="button"
              className="transfer-secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="transfer-primary"
              disabled={
                busy ||
                (mode === "import"
                  ? !preview || overflow || !changes
                  : !selected.length ||
                    (includePasswords &&
                      (!backupPasswordValid || !passwordsMatch)))
              }
              onClick={() =>
                void (mode === "import" ? importFile() : exportFile())
              }
            >
              {mode === "import"
                ? `Import${preview ? ` ${changes}` : ""}`
                : includePasswords
                  ? "Export encrypted"
                  : "Export JSON"}
              {mode === "import" ? (
                <ArrowDownToLine size={14} />
              ) : (
                <ArrowUpFromLine size={14} />
              )}
            </button>
          </footer>
        </>
      )}
    </dialog>
  );
}
