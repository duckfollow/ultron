import { useEffect, useId, useRef, useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  X,
  Save,
  Copy,
  ArrowDownToLine,
  Trash2,
} from "lucide-react";
import {
  loadSnippets,
  saveSnippets,
  type CommandSnippet,
} from "./snippets-model";
import "./command-snippets.css";
const emptySnippet = (): CommandSnippet => ({
  id: crypto.randomUUID(),
  name: "",
  command: "",
  updatedAt: Date.now(),
});
export function CommandSnippets({
  target,
  canInsert,
  onInsert,
  onClose,
}: {
  target: string;
  canInsert: boolean;
  onInsert: (command: string) => void;
  onClose: () => void;
}) {
  const [initial] = useState(() => {
    try {
      return { snippets: loadSnippets(localStorage), error: "" };
    } catch {
      return {
        snippets: [],
        error:
          "Saved snippets could not be read. Existing data has not been changed.",
      };
    }
  });
  const [snippets, setSnippets] = useState(initial.snippets);
  const [draft, setDraft] = useState<CommandSnippet>(emptySnippet);
  const [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    nameId = useId(),
    commandId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const existing = snippets.some((snippet) => snippet.id === draft.id);
  const visible = snippets.filter((snippet) =>
    `${snippet.name}\n${snippet.command}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  function persist(next: CommandSnippet[]) {
    saveSnippets(localStorage, next);
    setSnippets(next);
  }
  function select(snippet: CommandSnippet) {
    setDraft({ ...snippet });
    setError("");
    setMessage("");
    setDeleting(false);
  }
  return (
    <dialog
      ref={dialog}
      className="snippets-dialog"
      aria-labelledby={titleId}
      onCancel={onClose}
    >
      <header>
        <h2 id={titleId}>
          <BookOpen size={18} /> Command snippets
        </h2>
        <button
          className="icon-button"
          aria-label="Close command snippets"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {initial.error ? (
        <p className="snippets-error" role="alert">
          {initial.error}
        </p>
      ) : (
        <>
          <div className="snippets-body">
            <section
              className="snippets-library"
              aria-label="Saved command snippets"
            >
              <button
                className="snippet-new"
                onClick={() => select(emptySnippet())}
              >
                <Plus size={14} />
                New snippet
              </button>
              <label className="snippet-search">
                <Search size={14} />
                <input
                  autoFocus
                  aria-label="Search snippets"
                  placeholder="Search snippets…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="snippet-list">
                {visible.length ? (
                  visible.map((snippet) => (
                    <button
                      key={snippet.id}
                      className={snippet.id === draft.id ? "selected" : ""}
                      onClick={() => select(snippet)}
                      aria-pressed={snippet.id === draft.id}
                    >
                      <strong>{snippet.name}</strong>
                      <span>{snippet.command}</span>
                    </button>
                  ))
                ) : (
                  <p>
                    {snippets.length
                      ? "No matching snippets."
                      : "Save your first command to reuse it later."}
                  </p>
                )}
              </div>
              <small>Saved on this device</small>
            </section>
            <form
              className="snippet-editor"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.name.trim() || !draft.command.trim()) return;
                try {
                  const saved = {
                    ...draft,
                    name: draft.name.trim(),
                    updatedAt: Date.now(),
                  };
                  persist([
                    saved,
                    ...snippets.filter((item) => item.id !== saved.id),
                  ]);
                  setDraft(saved);
                  setError("");
                  setMessage("Snippet saved.");
                } catch {
                  setError(
                    "Could not save snippet. Check available storage and try again.",
                  );
                }
              }}
            >
              <label htmlFor={nameId}>Snippet name</label>
              <input
                id={nameId}
                required
                maxLength={120}
                placeholder="e.g. Git status"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
              <label htmlFor={commandId}>Command</label>
              <textarea
                id={commandId}
                required
                maxLength={65536}
                spellCheck={false}
                placeholder="git status --short"
                value={draft.command}
                onChange={(event) => {
                  setDraft({ ...draft, command: event.target.value });
                  setError("");
                  setMessage("");
                }}
              />
              <p className="snippet-hint">
                Insert into: <strong>{target}</strong>
                <br />
                Adds text at the terminal cursor. Check the current prompt
                before inserting; press Enter yourself to run.
              </p>
              <div className="snippet-actions">
                <button
                  type="submit"
                  disabled={!draft.name.trim() || !draft.command.trim()}
                >
                  <Save size={13} />
                  {existing ? "Save changes" : "Save snippet"}
                </button>
                <button
                  type="button"
                  disabled={!draft.command.trim()}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(draft.command);
                      setMessage("Command copied.");
                      setError("");
                    } catch {
                      setError(
                        "Could not copy. Select the command and copy it manually.",
                      );
                    }
                  }}
                >
                  <Copy size={13} />
                  Copy
                </button>
                <button
                  type="button"
                  className="snippet-insert"
                  disabled={!canInsert || !draft.command.trim()}
                  onClick={() => {
                    try {
                      onInsert(draft.command);
                    } catch (error) {
                      setError(
                        String(error instanceof Error ? error.message : error),
                      );
                    }
                  }}
                >
                  <ArrowDownToLine size={13} />
                  Insert
                </button>
              </div>
              {error && (
                <p className="snippets-error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="snippet-feedback" role="status">
                  {message}
                </p>
              )}
              {existing && (
                <div className="snippet-delete">
                  {deleting ? (
                    <>
                      <span>Delete “{draft.name}”?</span>
                      <button
                        type="button"
                        className="snippet-danger"
                        onClick={() => {
                          try {
                            persist(
                              snippets.filter((item) => item.id !== draft.id),
                            );
                            select(emptySnippet());
                            setMessage("Snippet deleted.");
                          } catch {
                            setError(
                              "Could not delete snippet. Please try again.",
                            );
                          }
                        }}
                      >
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setDeleting(false)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="snippet-danger"
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 size={13} />
                      Delete snippet
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>
        </>
      )}
    </dialog>
  );
}
