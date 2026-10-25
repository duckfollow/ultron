import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { colors, type TabColor } from "./workspace-model";
export function TabAppearance({
  name,
  color,
  onSave,
  onClose,
}: {
  name: string;
  color: TabColor;
  onSave: (name: string, color: TabColor) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [draftName, setDraftName] = useState(name),
    [draftColor, setDraftColor] = useState(color);
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.select();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="help tab-appearance"
      aria-labelledby="appearance-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draftName.trim(), draftColor);
        }}
      >
        <header>
          <h2 id="appearance-title">Tab appearance</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close tab appearance"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        <label htmlFor="tab-name">Name</label>
        <input
          ref={input}
          autoFocus
          id="tab-name"
          maxLength={40}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Use shell title"
        />
        <p>Leave blank to use the shell title.</p>
        <fieldset>
          <legend>Color</legend>
          <div className="tab-colors">
            {colors.map((option) => (
              <button
                type="button"
                key={option.id}
                aria-label={option.name}
                aria-pressed={draftColor === option.id}
                style={{ background: option.value }}
                onClick={() => setDraftColor(option.id)}
              >
                {draftColor === option.id && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="subtle-button" onClick={onClose}>
            Cancel
          </button>
          <button className="save-appearance" type="submit">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
