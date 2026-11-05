import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Moon, Sun, Settings2, X } from "lucide-react";
import { useAppearance } from "./theme";
export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useAppearance();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        className="appearance-nav-button"
        aria-label="Appearance settings"
        title="Appearance settings"
        onClick={() => setOpen(true)}
      >
        <Settings2 size={15} />
        <span className="sidebar-tool-label">Appearance</span>
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="help appearance-dialog"
            aria-labelledby="appearance-settings-title"
            onCancel={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <header>
              <h2 id="appearance-settings-title">Appearance</h2>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close appearance settings"
                onClick={close}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              Choose how Ultron looks. Terminal colors update with your theme.
            </p>
            <fieldset className="appearance-options">
              <legend>Color mode</legend>
              {(
                [
                  ["system", "System", "Follow macOS appearance", Monitor],
                  ["dark", "Dark", "A familiar dark workspace", Moon],
                  ["light", "Light", "Soft surfaces for daytime", Sun],
                ] as const
              ).map(([value, label, description, Icon]) => (
                <label
                  key={value}
                  className={`appearance-option${value === preference ? " selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="appearance"
                    value={value}
                    checked={preference === value}
                    onChange={() => setPreference(value)}
                  />
                  <Icon size={19} />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="appearance-current" role="status">
              {preference === "system"
                ? `Following macOS · ${resolved === "dark" ? "Dark" : "Light"}`
                : `${preference === "dark" ? "Dark" : "Light"} mode`}
            </p>
          </dialog>,
          document.body,
        )}
    </>
  );
}
