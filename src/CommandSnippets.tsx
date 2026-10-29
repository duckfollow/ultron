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
  Terminal,
  Check,
  Circle,
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
  const [draft, setDraft] = useState<CommandSnippet>(() =>
    initial.snippets[0] ? { ...initial.snippets[0] } : emptySnippet(),
  );
  const [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<CommandSnippet | "close" | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(),
    nameId = useId(),
    commandId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const savedDraft = snippets.find((snippet) => snippet.id === draft.id);
  const existing = !!savedDraft;
  const dirty = savedDraft
    ? draft.name !== savedDraft.name || draft.command !== savedDraft.command
    : !!(draft.name || draft.command);
  const valid = !!draft.name.trim() && !!draft.command.trim();
  const lines = draft.command ? draft.command.split("\n").length : 0;
  function save(): boolean {
    if (!valid) return false;
    try {
      const saved = {
        ...draft,
        name: draft.name.trim(),
        updatedAt: Date.now(),
      };
      persist([saved, ...snippets.filter((item) => item.id !== saved.id)]);
      setDraft(saved);
      setError("");
      setMessage("Snippet saved.");
      return true;
    } catch {
      setError(
        "Could not save snippet. Check available storage and try again.",
      );
      return false;
    }
  }
  function navigate(next: CommandSnippet | "close") {
    if (dirty && (next === "close" || next.id !== draft.id)) setPending(next);
    else finishNavigation(next);
  }
  function finishNavigation(next: CommandSnippet | "close") {
    setPending(null);
    if (next === "close") onClose();
    else {
      select(next);
      if (!next.name && !next.command)
        requestAnimationFrame(() => nameInput.current?.focus());
    }
  }
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
      onCancel={(event) => {
        event.preventDefault();
        if (pending) setPending(null);
        else navigate("close");
      }}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          if (!pending && dirty) form.current?.requestSubmit();
        }
      }}
    >
      <header>
        <div className="snippets-heading">
          <span className="snippets-eyebrow">YOUR COMMAND LIBRARY</span>
          <h2 id={titleId}>
            <BookOpen size={18} /> Command snippets
          </h2>
          <p>Keep useful commands close. Insert when you’re ready.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close command snippets"
          onClick={() => navigate("close")}
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
          {pending && (
            <div
              className="snippet-unsaved"
              role="alert"
              aria-label="Unsaved changes"
            >
              <div>
                <strong>Save your changes?</strong>
                <p>
                  “{draft.name.trim() || "Untitled snippet"}” has unsaved edits.
                </p>
                {error && <p className="snippets-error">{error}</p>}
              </div>
              <div>
                <button type="button" onClick={() => setPending(null)}>
                  Keep editing
                </button>
                <button type="button" onClick={() => finishNavigation(pending)}>
                  Discard changes
                </button>
                <button
                  type="button"
                  className="snippet-save"
                  disabled={!valid}
                  onClick={() => {
                    if (save()) finishNavigation(pending);
                  }}
                >
                  Save & continue
                </button>
              </div>
            </div>
          )}
          <div className="snippets-body" inert={pending ? true : undefined}>
            <section
              className="snippets-library"
              aria-label="Saved command snippets"
            >
              <div className="snippet-library-title">
                <strong>Library</strong>
                <span>{snippets.length}</span>
              </div>
              <button
                className="snippet-new"
                onClick={() => navigate(emptySnippet())}
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
              {search && (
                <div className="snippet-results">
                  {visible.length} {visible.length === 1 ? "match" : "matches"}
                  <button type="button" onClick={() => setSearch("")}>
                    Clear
                  </button>
                </div>
              )}
              <div className="snippet-list">
                {visible.length ? (
                  visible.map((snippet) => (
                    <button
                      key={snippet.id}
                      className={snippet.id === draft.id ? "selected" : ""}
                      onClick={() => navigate(snippet)}
                      aria-pressed={snippet.id === draft.id}
                    >
                      <div className="snippet-list-title">
                        <Terminal size={13} />
                        <strong>{snippet.name}</strong>
                        {snippet.id === draft.id && dirty && (
                          <Circle
                            size={6}
                            fill="currentColor"
                            aria-label="Unsaved changes"
                          />
                        )}
                      </div>
                      <span>{snippet.command}</span>
                    </button>
                  ))
                ) : (
                  <div className="snippet-empty">
                    <BookOpen size={24} />
                    <strong>
                      {snippets.length
                        ? "No matches"
                        : "Your library starts here"}
                    </strong>
                    <p>
                      {snippets.length
                        ? "Try a command or a different name."
                        : "Name a command on the right, then save it for next time."}
                    </p>
                  </div>
                )}
              </div>
              <small>
                <Check size={11} /> Saved on this device
              </small>
            </section>
            <form
              className="snippet-editor"
              ref={form}
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className="snippet-editor-heading">
                <div>
                  <span className="snippets-eyebrow">
                    {existing ? "SAVED COMMAND" : "CREATE A COMMAND"}
                  </span>
                  <h3>{existing ? savedDraft?.name : "New snippet"}</h3>
                </div>
                <span className={`snippet-save-state${dirty ? " dirty" : ""}`}>
                  {dirty ? (
                    <>
                      <Circle size={6} fill="currentColor" />
                      Unsaved changes
                    </>
                  ) : existing ? (
                    <>
                      <Check size={12} />
                      Saved
                    </>
                  ) : (
                    "Draft"
                  )}
                </span>
              </div>
              <label htmlFor={nameId}>Snippet name</label>
              <input
                id={nameId}
                ref={nameInput}
                required
                maxLength={120}
                placeholder="e.g. Git status"
                value={draft.name}
                onChange={(event) => {
                  setDraft({ ...draft, name: event.target.value });
                  setMessage("");
                  setError("");
                }}
              />
              <div className="snippet-command-label">
                <label htmlFor={commandId}>Command</label>
                <span>
                  Plain text · {lines} {lines === 1 ? "line" : "lines"}
                </span>
              </div>
              <textarea
                id={commandId}
                required
                maxLength={65536}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="git status --short"
                value={draft.command}
                onChange={(event) => {
                  setDraft({ ...draft, command: event.target.value });
                  setError("");
                  setMessage("");
                }}
              />
              <div
                className={`snippet-destination${!canInsert ? " unavailable" : ""}`}
              >
                <Terminal size={15} />
                <div>
                  <span>INSERT INTO</span>
                  <strong>{target}</strong>
                  <p>
                    {canInsert
                      ? "Adds text at the cursor. Press Enter in the terminal to run."
                      : "Select a running terminal to insert. You can still copy this command."}
                  </p>
                </div>
              </div>
              <div className="snippet-actions">
                <button type="submit" disabled={!valid || !dirty}>
                  <Save size={13} />
                  {existing ? "Save changes" : "Save snippet"}
                  <kbd>⌘S</kbd>
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
                  Insert into terminal
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
                            select(
                              snippets.find((item) => item.id !== draft.id) ??
                                emptySnippet(),
                            );
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
