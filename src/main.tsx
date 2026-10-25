import { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Terminal,
  Plus,
  X,
  Search,
  ChevronDown,
  CircleHelp,
  Eraser,
  Minus,
  Command,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  TerminalPane,
  type TerminalHandle,
  type SessionInfo,
} from "./TerminalPane";
import "./style.css";
type Tab = {
  key: string;
  number: number;
  title: string;
  state: "starting" | "live" | "ended";
  info?: SessionInfo;
  error?: string;
  cols: number;
  rows: number;
};
const makeTab = (number: number): Tab => ({
  key: crypto.randomUUID(),
  number,
  title: "Shell",
  state: "starting",
  cols: 80,
  rows: 24,
});
const firstTab = makeTab(1);
function App() {
  const [tabs, setTabs] = useState<Tab[]>([firstTab]);
  const [active, setActive] = useState(firstTab.key);
  const [find, setFind] = useState(false),
    [query, setQuery] = useState(""),
    [help, setHelp] = useState(false);
  const handles = useRef(new Map<string, TerminalHandle>()),
    nextNumber = useRef(2),
    findInput = useRef<HTMLInputElement>(null),
    helpDialog = useRef<HTMLDialogElement>(null);
  const current = tabs.find((tab) => tab.key === active);
  function update(key: string, patch: Partial<Tab>) {
    setTabs((old) =>
      old.map((tab) => (tab.key === key ? { ...tab, ...patch } : tab)),
    );
  }
  function add() {
    if (tabs.length >= 12) return;
    const tab = makeTab(nextNumber.current++);
    setTabs((old) => [...old, tab]);
    setActive(tab.key);
    setFind(false);
  }
  function close(key: string) {
    const index = tabs.findIndex((tab) => tab.key === key);
    const remaining = tabs.filter((tab) => tab.key !== key);
    setTabs(remaining);
    if (active === key)
      setActive(remaining[Math.min(index, remaining.length - 1)]?.key ?? "");
  }
  function select(key: string) {
    handles.current.get(active)?.find("");
    setActive(key);
    setFind(false);
    setQuery("");
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (!event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "t") {
        event.preventDefault();
        add();
      } else if (key === "w") {
        event.preventDefault();
        if (current) close(active);
      } else if (key === "k") {
        event.preventDefault();
        handles.current.get(active)?.clear();
      } else if (key === "f") {
        event.preventDefault();
        setFind(true);
        findInput.current?.focus();
      } else if (key === "=" || key === "+") {
        event.preventDefault();
        handles.current.get(active)?.zoom(1);
      } else if (key === "-") {
        event.preventDefault();
        handles.current.get(active)?.zoom(-1);
      } else if (/^[1-9]$/.test(key) && tabs[Number(key) - 1]) {
        event.preventDefault();
        select(tabs[Number(key) - 1].key);
      }
    }
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  });
  useEffect(() => {
    if (find) findInput.current?.focus();
  }, [find]);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
  }, [help]);
  function dismissSearch() {
    setFind(false);
    setQuery("");
    handles.current.get(active)?.find("");
    handles.current.get(active)?.focus();
  }
  const shell = current?.info?.shell.split("/").pop() ?? "shell";
  return (
    <main className="app">
      <aside>
        <div className="brand">
          <div className="ultron-mark" aria-hidden="true">
            <i />
            <i />
          </div>
          <div>
            <strong>
              ULTRON<span>•</span>
            </strong>
            <small>YOUR COMMAND CENTER</small>
          </div>
        </div>
        <button
          className="new-session"
          onClick={add}
          disabled={tabs.length >= 12}
        >
          <Plus size={16} /> New terminal <kbd>⌘ T</kbd>
        </button>
        <div className="section-label">
          WORKSPACE <span>{String(tabs.length).padStart(2, "0")}</span>
        </div>
        <nav aria-label="Terminal sessions">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`session ${active === tab.key ? "selected" : ""}`}
              onClick={() => select(tab.key)}
            >
              <Terminal size={15} />
              <div>
                <span>
                  {tab.title === "Shell"
                    ? `Terminal ${String(tab.number).padStart(2, "0")}`
                    : `${String(tab.number).padStart(2, "0")} · ${tab.title}`}
                </span>
                <small>
                  {tab.state === "starting"
                    ? "Starting shell…"
                    : tab.state === "ended"
                      ? "Session ended"
                      : `${tab.info?.shell.split("/").pop()} · local`}
                </small>
              </div>
              <i className={`state-dot ${tab.state}`} />
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-label">
            <span /> LOCAL WORKSPACE
          </div>
          <p>Your shell. Your machine.</p>
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={14} /> Keyboard shortcuts <kbd>?</kbd>
          </button>
          <small>
            v0.1.0-alpha.1 <span>macOS</span>
          </small>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            <strong>
              {current
                ? `Terminal ${String(current.number).padStart(2, "0")}`
                : "Welcome"}
            </strong>
          </div>
          <span className="environment">
            <i />
            {shell} <ChevronDown size={12} />
          </span>
        </header>
        <div className="tabbar" role="tablist" aria-label="Open terminals">
          {tabs.map((tab) => (
            <div
              className={`tab ${active === tab.key ? "active" : ""}`}
              key={tab.key}
            >
              <button
                role="tab"
                aria-selected={active === tab.key}
                onClick={() => select(tab.key)}
              >
                <Terminal size={13} />
                {tab.title === "Shell"
                  ? `Terminal ${String(tab.number).padStart(2, "0")}`
                  : `${String(tab.number).padStart(2, "0")} · ${tab.title}`}
              </button>
              <button
                className="tab-close"
                aria-label={`Close terminal ${tab.number}`}
                onClick={() => close(tab.key)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="icon-button add-tab"
            onClick={add}
            disabled={tabs.length >= 12}
            aria-label="New terminal"
            title="New terminal (⌘ T)"
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="terminal-toolbar">
          <span>
            <span className="status-line" />
            {current?.state === "ended" ? "SESSION ENDED" : "TERMINAL"}
            <small>{current?.info?.cwd ?? "LOCAL SHELL"}</small>
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Decrease font size"
              onClick={() => handles.current.get(active)?.zoom(-1)}
            >
              <Minus size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Increase font size"
              onClick={() => handles.current.get(active)?.zoom(1)}
            >
              <Plus size={13} />
            </button>
            <span className="divider" />
            <button
              className="icon-button"
              aria-label="Find in terminal"
              title="Find (⌘ F)"
              onClick={() => {
                if (find) dismissSearch();
                else setFind(true);
              }}
            >
              <Search size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Clear scrollback"
              title="Clear scrollback (⌘ K)"
              onClick={() => handles.current.get(active)?.clear()}
            >
              <Eraser size={14} />
            </button>
          </div>
        </div>
        {find && (
          <div className="findbar">
            <Search size={13} />
            <input
              ref={findInput}
              value={query}
              aria-label="Find in terminal output"
              placeholder="Find in terminal…"
              onChange={(event) => {
                setQuery(event.target.value);
                handles.current.get(active)?.find(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") dismissSearch();
                else if (event.key === "Enter")
                  handles.current.get(active)?.find(query, event.shiftKey);
              }}
            />
            <button
              className="icon-button"
              aria-label="Previous match"
              onClick={() => handles.current.get(active)?.find(query, true)}
            >
              <ArrowUp size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Next match"
              onClick={() => handles.current.get(active)?.find(query)}
            >
              <ArrowDown size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Close search"
              onClick={dismissSearch}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <div className="terminal-stage">
          {tabs.map((tab) => (
            <TerminalPane
              key={tab.key}
              active={active === tab.key}
              register={(handle) => {
                if (handle) handles.current.set(tab.key, handle);
                else handles.current.delete(tab.key);
              }}
              onReady={(info) => update(tab.key, { info, state: "live" })}
              onTitle={(title) => update(tab.key, { title: title || "Shell" })}
              onExit={(error) => update(tab.key, { state: "ended", error })}
              onSize={(cols, rows) => update(tab.key, { cols, rows })}
            />
          ))}
          {!tabs.length && (
            <div className="empty">
              <div className="ultron-mark">
                <i />
                <i />
              </div>
              <small>READY WHEN YOU ARE</small>
              <h1>Make your next move.</h1>
              <p>A focused space for your commands.</p>
              <button className="new-session" onClick={add}>
                <Plus size={15} /> Open a terminal <kbd>⌘ T</kbd>
              </button>
            </div>
          )}
        </div>
        {current?.error && (
          <div className="error" role="alert">
            {current.error}
          </div>
        )}
        <footer>
          <span>
            <i className={`state-dot ${current?.state ?? ""}`} />
            {current?.state === "live"
              ? "Connected to local shell"
              : current?.state === "ended"
                ? "Session ended · Open a new terminal to continue"
                : tabs.length
                  ? "Starting…"
                  : "No open terminals"}
          </span>
          <div>
            <span>{current ? `${current.cols} × ${current.rows}` : ""}</span>
            <span>UTF-8</span>
            <span>LOCAL</span>
          </div>
        </footer>
      </section>
      {help && (
        <dialog
          ref={helpDialog}
          className="help"
          aria-label="Keyboard shortcuts"
          onCancel={(event) => {
            event.preventDefault();
            setHelp(false);
          }}
        >
          <header>
            <h2>
              <Command size={19} /> Keyboard shortcuts
            </h2>
            <button
              autoFocus
              className="icon-button"
              aria-label="Close shortcuts"
              onClick={() => setHelp(false)}
            >
              <X size={17} />
            </button>
          </header>
          {[
            ["New terminal", "⌘ T"],
            ["Close terminal", "⌘ W"],
            ["Find output", "⌘ F"],
            ["Clear scrollback", "⌘ K"],
            ["Switch terminal", "⌘ 1–9"],
            ["Font size", "⌘ + / −"],
            ["Interrupt command", "Ctrl C"],
          ].map(([label, shortcut]) => (
            <div className="shortcut" key={label}>
              <span>{label}</span>
              <kbd>{shortcut}</kbd>
            </div>
          ))}
          <p>
            Each terminal runs your login shell. Closing a terminal ends its
            session.
          </p>
        </dialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
