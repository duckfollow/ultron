const ultronLogo = new URL("../src-tauri/icon.svg", import.meta.url).href;
import { useState, useRef, useEffect, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SshConnections } from "./SshConnections";
import { SshProfileDialog } from "./SshProfileDialog";
import {
  newSshProfile,
  profileAddress,
  type SshProfile,
  type ConnectTarget,
} from "./ssh-model";
import { createRoot } from "react-dom/client";
import {
  Terminal,
  Plus,
  X,
  Search,
  CircleHelp,
  Eraser,
  Minus,
  Command,
  ArrowUp,
  ArrowDown,
  Columns2,
  Rows2,
  Ellipsis,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  SquareTerminal,
} from "lucide-react";
import type { TerminalHandle } from "./TerminalPane";
import { makeTab, makePane, type Tab, type Pane } from "./workspace-types";
import {
  colors,
  layoutRects,
  removePane,
  resizeSplit,
  splitLayout,
  tabName,
  type Axis,
} from "./workspace-model";
import { SplitWorkspace } from "./SplitWorkspace";
import { TabAppearance } from "./TabAppearance";
import "./style.css";
const firstTab = makeTab(1);
function App() {
  const [tabs, setTabs] = useState<Tab[]>([firstTab]),
    [active, setActive] = useState(firstTab.key);
  const [find, setFind] = useState(false),
    [query, setQuery] = useState(""),
    [help, setHelp] = useState(false),
    [appearance, setAppearance] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<SshProfile[]>([]),
    [profileError, setProfileError] = useState(""),
    [profilesLoading, setProfilesLoading] = useState(true),
    [profileDialog, setProfileDialog] = useState<SshProfile | null>(null);
  useEffect(() => {
    void invoke<SshProfile[]>("list_ssh_profiles")
      .then(setProfiles)
      .catch((error) => setProfileError(String(error)))
      .finally(() => setProfilesLoading(false));
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ultron.sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("ultron.sidebarCollapsed", String(sidebarCollapsed));
    } catch {
      /* The rail still works when preference storage is unavailable. */
    }
  }, [sidebarCollapsed]);
  const [stageSize, setStageSize] = useState({ width: 1000, height: 600 });
  const handles = useRef(new Map<string, TerminalHandle>()),
    nextNumber = useRef(2),
    findInput = useRef<HTMLInputElement>(null),
    helpDialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const current = tabs.find((tab) => tab.key === active),
    pane = current?.panes.find((p) => p.id === current.activePane);
  const sessionCount = tabs.reduce((count, tab) => count + tab.panes.length, 0);
  const appearanceTab = tabs.find((tab) => tab.key === appearance);
  const colorValue = (tab: Tab) =>
    colors.find((c) => c.id === tab.color)!.value;
  const tabStyle = (tab: Tab) =>
    ({ "--tab-color": colorValue(tab) }) as CSSProperties;
  const name = (tab: Tab) =>
    tabName(
      tab.number,
      tab.panes.find((p) => p.id === tab.activePane)?.title ?? "Shell",
      tab.customName,
    );
  const handle = () => (pane ? handles.current.get(pane.id) : undefined);
  function updateTab(id: string, change: (tab: Tab) => Tab) {
    setTabs((old) => old.map((tab) => (tab.key === id ? change(tab) : tab)));
  }
  function updatePane(tabId: string, id: string, patch: Partial<Pane>) {
    updateTab(tabId, (tab) => ({
      ...tab,
      panes: tab.panes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }
  function clearSearch() {
    handle()?.find("");
    setFind(false);
    setQuery("");
  }
  function select(id: string) {
    clearSearch();
    setActive(id);
  }
  function add() {
    if (sessionCount >= 12) return;
    const tab = makeTab(nextNumber.current++);
    clearSearch();
    setTabs((old) => [...old, tab]);
    setActive(tab.key);
  }
  function closeTab(id: string) {
    clearSearch();
    const index = tabs.findIndex((tab) => tab.key === id),
      remaining = tabs.filter((tab) => tab.key !== id);
    setTabs(remaining);
    if (active === id)
      setActive(remaining[Math.min(index, remaining.length - 1)]?.key ?? "");
  }
  function focusPane(tabId: string, id: string) {
    if (tabId !== active) return;
    updateTab(tabId, (tab) =>
      tab.activePane === id ? tab : { ...tab, activePane: id },
    );
    if (current?.activePane !== id) clearSearch();
  }
  function closePane(tabId: string, id: string) {
    const tab = tabs.find((t) => t.key === tabId);
    if (!tab) return;
    if (tab.panes.length === 1) {
      closeTab(tabId);
      return;
    }
    clearSearch();
    const index = tab.panes.findIndex((p) => p.id === id);
    updateTab(tabId, (old) => {
      const panes = old.panes.filter((p) => p.id !== id);
      return {
        ...old,
        panes,
        layout: removePane(old.layout, id)!,
        activePane:
          old.activePane === id
            ? panes[Math.min(index, panes.length - 1)].id
            : old.activePane,
      };
    });
  }
  function canSplit(axis: Axis) {
    if (!current || !pane || sessionCount >= 12 || current.panes.length >= 4)
      return false;
    const rect = layoutRects(current.layout).panes.get(pane.id)!;
    return axis === "columns"
      ? rect.width * stageSize.width >= 330
      : rect.height * stageSize.height >= 250;
  }
  function split(axis: Axis) {
    if (!current || !pane || !canSplit(axis)) return;
    const newPane = makePane(),
      id = current.key,
      target = pane.id;
    clearSearch();
    updateTab(id, (tab) => ({
      ...tab,
      panes: [...tab.panes, newPane],
      layout: splitLayout(
        tab.layout,
        target,
        newPane.id,
        crypto.randomUUID(),
        axis,
      ),
      activePane: newPane.id,
    }));
  }
  function connectSsh(profile: SshProfile, target: ConnectTarget) {
    if (sessionCount >= 12) return;
    if (target !== "tab" && !canSplit(target)) return;
    clearSearch();
    if (target === "tab") {
      const tab = makeTab(nextNumber.current++);
      tab.customName = profile.name;
      tab.color = "cyan";
      tab.panes[0].sshProfile = { ...profile };
      setTabs((old) => [...old, tab]);
      setActive(tab.key);
    } else if (current && pane) {
      const next = { ...makePane(), sshProfile: { ...profile } };
      updateTab(current.key, (tab) => ({
        ...tab,
        panes: [...tab.panes, next],
        layout: splitLayout(
          tab.layout,
          pane.id,
          next.id,
          crypto.randomUUID(),
          target,
        ),
        activePane: next.id,
      }));
    }
  }
  function closeProfileDialog() {
    setProfileDialog(null);
    requestAnimationFrame(() => handle()?.focus());
  }
  function nextPane() {
    if (!current) return;
    const order = [...layoutRects(current.layout).panes.keys()];
    const id = order[(order.indexOf(current.activePane) + 1) % order.length];
    focusPane(current.key, id);
    handles.current.get(id)?.focus();
  }
  function closeAppearance() {
    setAppearance(null);
    requestAnimationFrame(() => handle()?.focus());
  }
  function dismissSearch() {
    clearSearch();
    handle()?.focus();
  }
  useEffect(() => {
    const element = stage.current!;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        !event.metaKey ||
        help ||
        appearance ||
        profileDialog ||
        document.querySelector("dialog[open]")
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        setSidebarCollapsed((value) => !value);
      } else if (key === "t") {
        event.preventDefault();
        add();
      } else if (key === "w") {
        event.preventDefault();
        if (current && pane) {
          if (event.shiftKey) closeTab(current.key);
          else closePane(current.key, pane.id);
        }
      } else if (key === "d") {
        event.preventDefault();
        split(event.shiftKey ? "rows" : "columns");
      } else if (key === "j") {
        event.preventDefault();
        nextPane();
      } else if (key === "k") {
        event.preventDefault();
        handle()?.clear();
      } else if (key === "f") {
        event.preventDefault();
        setFind(true);
        findInput.current?.focus();
      } else if (key === "=" || key === "+") {
        event.preventDefault();
        handle()?.zoom(1);
      } else if (key === "-") {
        event.preventDefault();
        handle()?.zoom(-1);
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
  const splitHint = (axis: Axis) =>
    canSplit(axis)
      ? `${axis === "columns" ? "Split left / right (⌘ D)" : "Split top / bottom (⌘ ⇧ D)"}`
      : sessionCount >= 12
        ? "Maximum 12 terminal sessions"
        : current && current.panes.length >= 4
          ? "Maximum 4 panes per tab"
          : "Make the active pane larger to split";
  return (
    <main className="app">
      <aside
        className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}
        aria-label="Workspace sidebar"
      >
        <div className="sidebar-top">
          <div className="brand">
            <img
              className="ultron-mark"
              src={ultronLogo}
              alt=""
              aria-hidden="true"
            />
            <div className="brand-copy">
              <strong>
                ULTRON<span>•</span>
              </strong>
              <small>YOUR COMMAND CENTER</small>
            </div>
          </div>
          <button
            className="icon-button sidebar-toggle"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (⌘ B)`}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <button
          className="new-session"
          aria-label="New terminal"
          title="New terminal (⌘ T)"
          onClick={add}
          disabled={sessionCount >= 12}
        >
          {sidebarCollapsed ? <SquareTerminal size={18} /> : <Plus size={16} />}
          <span className="new-session-label">New terminal</span>
          <kbd>⌘ T</kbd>
        </button>
        <SshConnections
          profiles={profiles}
          compact={sidebarCollapsed}
          canConnect={sessionCount < 12}
          error={profileError}
          loading={profilesLoading}
          onNew={() => setProfileDialog(newSshProfile())}
          onEdit={setProfileDialog}
          onConnect={connectSsh}
          canSplit={canSplit}
          onDelete={async (profile) => {
            const updated = await invoke<SshProfile[]>("delete_ssh_profile", {
              id: profile.id,
            });
            setProfiles(updated);
          }}
        />
        <div className="section-label workspace-section-label">
          <span className="workspace-section-title">WORKSPACE</span>
          <span>{String(tabs.length).padStart(2, "0")}</span>
        </div>
        <nav aria-label="Terminal sessions">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`session ${active === tab.key ? "selected" : ""}`}
              style={tabStyle(tab)}
              onClick={() => select(tab.key)}
              onDoubleClick={() => setAppearance(tab.key)}
              onContextMenu={(event) => {
                event.preventDefault();
                setAppearance(tab.key);
              }}
              aria-label={name(tab)}
              title={`${name(tab)} · Double-click to rename or change color`}
            >
              <Terminal size={15} />
              <span className="session-index" aria-hidden="true">
                {tab.number}
              </span>
              <div>
                <span>{name(tab)}</span>
                <small>
                  {tab.panes.length > 1
                    ? `${tab.panes.length} panes · ${tab.panes.some((p) => p.sshProfile) ? "SSH" : "local"}`
                    : tab.panes[0].state === "starting"
                      ? "Starting shell…"
                      : tab.panes[0].state === "ended"
                        ? "Session ended"
                        : tab.panes[0].sshProfile
                          ? profileAddress(tab.panes[0].sshProfile!)
                          : `${tab.panes[0].info?.shell.split("/").pop()} · local`}
                </small>
              </div>
              <i className="tab-color-dot" />
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-label">
            <span /> LOCAL WORKSPACE
          </div>
          <p>Your shell. Your machine.</p>
          <button
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            <CircleHelp size={14} />
            <span className="shortcut-label">Keyboard shortcuts</span>
            <kbd>?</kbd>
          </button>
          <small>
            v0.1.0-alpha.1 <span>macOS</span>
          </small>
        </div>
      </aside>
      <section
        className="workspace"
        style={current ? tabStyle(current) : undefined}
      >
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            <strong>{current ? name(current) : "Welcome"}</strong>
          </div>
          <span className="environment">
            <i />
            {pane?.sshProfile
              ? "SSH"
              : (pane?.info?.shell.split("/").pop() ?? "shell")}
          </span>
        </header>
        <div className="tabbar" role="tablist" aria-label="Open terminals">
          {tabs.map((tab) => (
            <div
              className={`tab ${active === tab.key ? "active" : ""}`}
              key={tab.key}
              style={tabStyle(tab)}
              onContextMenu={(event) => {
                event.preventDefault();
                setAppearance(tab.key);
              }}
            >
              <button
                role="tab"
                aria-selected={active === tab.key}
                onClick={() => select(tab.key)}
                onDoubleClick={() => setAppearance(tab.key)}
                title={name(tab)}
              >
                <Terminal size={13} />
                <span className="tab-label">{name(tab)}</span>
                {tab.panes.length > 1 && (
                  <small className="pane-count">{tab.panes.length}</small>
                )}
              </button>
              <button
                className="tab-settings"
                aria-label={`Edit appearance of ${name(tab)}`}
                onClick={() => setAppearance(tab.key)}
                title="Rename / color"
              >
                <Ellipsis size={13} />
              </button>
              <button
                className="tab-close"
                aria-label={`Close tab ${tab.number}`}
                onClick={() => closeTab(tab.key)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="icon-button add-tab"
            onClick={add}
            disabled={sessionCount >= 12}
            aria-label="New terminal"
            title="New terminal (⌘ T)"
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="terminal-toolbar">
          <span>
            <span className="status-line" />
            {pane?.state === "ended" ? "SESSION ENDED" : "TERMINAL"}
            <small title="Starting directory">
              {pane?.sshProfile
                ? profileAddress(pane.sshProfile)
                : (pane?.info?.cwd ?? "LOCAL SHELL")}
            </small>
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Split left / right"
              title={splitHint("columns")}
              disabled={!canSplit("columns")}
              onClick={() => split("columns")}
            >
              <Columns2 size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Split top / bottom"
              title={splitHint("rows")}
              disabled={!canSplit("rows")}
              onClick={() => split("rows")}
            >
              <Rows2 size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Tab appearance"
              title="Rename / color"
              disabled={!current}
              onClick={() => setAppearance(active)}
            >
              <Palette size={14} />
            </button>
            <span className="divider" />
            <button
              className="icon-button"
              aria-label="Decrease font size"
              onClick={() => handle()?.zoom(-1)}
            >
              <Minus size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Increase font size"
              onClick={() => handle()?.zoom(1)}
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
              onClick={() => handle()?.clear()}
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
              placeholder="Find in active pane…"
              onChange={(event) => {
                setQuery(event.target.value);
                handle()?.find(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") dismissSearch();
                else if (event.key === "Enter")
                  handle()?.find(query, event.shiftKey);
              }}
            />
            <button
              className="icon-button"
              aria-label="Previous match"
              onClick={() => handle()?.find(query, true)}
            >
              <ArrowUp size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Next match"
              onClick={() => handle()?.find(query)}
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
        <div ref={stage} className="terminal-stage">
          {tabs.map((tab) => (
            <SplitWorkspace
              key={tab.key}
              getConnection={(id) =>
                profiles.find((profile) => profile.id === id)
              }
              editConnection={(profile) =>
                setProfileDialog(
                  profiles.find((saved) => saved.id === profile.id) ?? profile,
                )
              }
              tab={tab}
              visible={active === tab.key}
              register={(id, terminal) => {
                if (terminal) handles.current.set(id, terminal);
                else handles.current.delete(id);
              }}
              updatePane={(id, patch) => updatePane(tab.key, id, patch)}
              focusPane={(id) => focusPane(tab.key, id)}
              closePane={(id) => closePane(tab.key, id)}
              resize={(id, ratio) =>
                updateTab(tab.key, (old) => ({
                  ...old,
                  layout: resizeSplit(old.layout, id, ratio),
                }))
              }
            />
          ))}
          {!tabs.length && (
            <div className="empty">
              <img className="ultron-mark" src={ultronLogo} alt="Ultron" />
              <small>READY WHEN YOU ARE</small>
              <h1>Make your next move.</h1>
              <p>A focused space for your commands.</p>
              <button className="new-session" onClick={add}>
                <Plus size={15} /> Open a terminal <kbd>⌘ T</kbd>
              </button>
            </div>
          )}
        </div>
        <footer>
          <span>
            <i className={`state-dot ${pane?.state ?? ""}`} />
            {pane?.state === "live"
              ? pane.sshProfile
                ? `SSH session · ${profileAddress(pane.sshProfile)}`
                : "Connected to local shell"
              : pane?.state === "ended"
                ? "Session ended"
                : tabs.length
                  ? "Starting…"
                  : "No open terminals"}
          </span>
          <div>
            {current && current.panes.length > 1 && (
              <span>{current.panes.length} PANES</span>
            )}
            <span>{pane ? `${pane.cols} × ${pane.rows}` : ""}</span>
            <span>UTF-8</span>
            <span>{pane?.sshProfile ? "SSH" : "LOCAL"}</span>
          </div>
        </footer>
      </section>
      {profileDialog && (
        <SshProfileDialog
          key={profileDialog.id || "new"}
          initial={profileDialog}
          onForgot={setProfiles}
          canConnect={sessionCount < 12}
          onClose={closeProfileDialog}
          onSaved={(updated, saved, connect) => {
            setProfiles(updated);
            setProfileError("");
            closeProfileDialog();
            if (connect) connectSsh(saved, "tab");
          }}
        />
      )}
      {appearanceTab && (
        <TabAppearance
          key={appearanceTab.key}
          name={appearanceTab.customName ?? ""}
          color={appearanceTab.color}
          onClose={closeAppearance}
          onSave={(customName, color) => {
            updateTab(appearanceTab.key, (tab) => ({
              ...tab,
              customName: customName || undefined,
              color,
            }));
            closeAppearance();
          }}
        />
      )}
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
            ["Toggle sidebar", "⌘ B"],
            ["New tab", "⌘ T"],
            ["Split left / right", "⌘ D"],
            ["Split top / bottom", "⌘ ⇧ D"],
            ["Next pane", "⌘ J"],
            ["Close active pane", "⌘ W"],
            ["Close whole tab", "⌘ ⇧ W"],
            ["Find in active pane", "⌘ F"],
            ["Clear scrollback", "⌘ K"],
            ["Switch tab", "⌘ 1–9"],
            ["Font size", "⌘ + / −"],
            ["Interrupt command", "Ctrl C"],
          ].map(([label, shortcut]) => (
            <div className="shortcut" key={label}>
              <span>{label}</span>
              <kbd>{shortcut}</kbd>
            </div>
          ))}
          <p>
            Double-click a tab to rename it or choose a color. Drag dividers to
            resize; double-click to reset. Closing a pane ends only its shell.
          </p>
        </dialog>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
