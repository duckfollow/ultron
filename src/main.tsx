import { reorderRelative } from "./order-model";
import { useOrderDrag } from "./useOrderDrag";
import { UtopMenu } from "./UtopMenu";
import { CommandSnippets } from "./CommandSnippets";
import { UpdateNotice } from "./UpdateNotice";
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
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  SquareTerminal,
  BookOpen,
  Activity,
} from "lucide-react";
import type { TerminalHandle } from "./TerminalPane";
import {
  makeTab,
  makePane,
  makeUtopPane,
  type Tab,
  type Pane,
} from "./workspace-types";
import {
  colors,
  layoutRects,
  removePane,
  resizeSplit,
  splitLayout,
  swapPanePositions,
  tabName,
  type Axis,
} from "./workspace-model";
import { SplitWorkspace } from "./SplitWorkspace";
import { TabAppearance } from "./TabAppearance";
import "./style.css";
const firstTab = makeTab(1);
function App() {
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([firstTab]),
    [active, setActive] = useState(firstTab.key);
  const reorderTabs = (source: string, target: string, after: boolean) =>
    setTabs((current) =>
      reorderRelative(current, source, target, after, (tab) => tab.key),
    );
  const tabOrder = useOrderDrag(
    "terminal-tab",
    tabs.map((tab) => tab.key),
    reorderTabs,
  );
  const sessionOrder = useOrderDrag(
    "terminal-session",
    tabs.map((tab) => tab.key),
    reorderTabs,
  );
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
  const utopActive = pane?.kind === "utop";
  const paneCount = tabs.reduce((count, tab) => count + tab.panes.length, 0);
  const appearanceTab = tabs.find((tab) => tab.key === appearance);
  const colorValue = (tab: Tab) =>
    colors.find((c) => c.id === tab.color)!.value;
  const tabStyle = (tab: Tab) =>
    ({ "--tab-color": colorValue(tab) }) as CSSProperties;
  const name = (tab: Tab) =>
    tab.panes.every((pane) => pane.kind === "utop") && !tab.customName
      ? "Utop"
      : tabName(
          tab.panes.find((p) => p.id === tab.activePane && p.kind !== "utop")
            ?.title ??
            tab.panes.find((p) => p.kind !== "utop")?.title ??
            "Utop",
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
    if (paneCount >= 12) return;
    const tab = makeTab(nextNumber.current++);
    clearSearch();
    setTabs((old) => [...old, tab]);
    setActive(tab.key);
  }
  function openUtop(target: ConnectTarget) {
    if (paneCount >= 12) return;
    if (target !== "tab" && !canSplit(target)) return;
    clearSearch();
    const monitor = makeUtopPane();
    if (target === "tab") {
      const tab = makeTab(nextNumber.current++, monitor);
      tab.color = "green";
      setTabs((old) => [...old, tab]);
      setActive(tab.key);
    } else if (current && pane) {
      updateTab(current.key, (tab) => ({
        ...tab,
        panes: [...tab.panes, monitor],
        layout: splitLayout(
          tab.layout,
          pane.id,
          monitor.id,
          crypto.randomUUID(),
          target,
        ),
        activePane: monitor.id,
      }));
    }
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
    if (!current || !pane || paneCount >= 12 || current.panes.length >= 4)
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
    if (paneCount >= 12) return;
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
        if (!utopActive) {
          setFind(true);
          findInput.current?.focus();
        }
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
      : paneCount >= 12
        ? "Maximum 12 workspace panes"
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
          disabled={paneCount >= 12}
        >
          {sidebarCollapsed ? <SquareTerminal size={18} /> : <Plus size={16} />}
          <span className="new-session-label">New terminal</span>
          <kbd>⌘ T</kbd>
        </button>
        <SshConnections
          profiles={profiles}
          compact={sidebarCollapsed}
          canConnect={paneCount < 12}
          error={profileError}
          loading={profilesLoading}
          onNew={() => setProfileDialog(newSshProfile())}
          onEdit={setProfileDialog}
          onConnect={connectSsh}
          canSplit={canSplit}
          onReorder={async (id, targetId, after) => {
            const updated = await invoke<SshProfile[]>("reorder_ssh_profile", {
              id,
              targetId,
              after,
            });
            setProfiles(updated);
          }}
          onMove={async (id, group, expectedGroup) => {
            const updated = await invoke<SshProfile[]>(
              "move_ssh_profile_group",
              { id, group, expectedGroup },
            );
            setProfiles(updated);
          }}
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
            <div
              key={tab.key}
              className={`workspace-session-row ${active === tab.key ? "selected" : ""}${sessionOrder.className(tab.key)}`}
              {...sessionOrder.props(tab.key)}
              style={tabStyle(tab)}
            >
              <button
                className="session"
                aria-current={active === tab.key ? "true" : undefined}
                onClick={() => {
                  if (
                    !tabOrder.suppress.current &&
                    !sessionOrder.suppress.current
                  )
                    select(tab.key);
                }}
                onDoubleClick={() => setAppearance(tab.key)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setAppearance(tab.key);
                }}
                aria-label={name(tab)}
                title={`${name(tab)} · Double-click to rename or change color`}
              >
                {tab.panes.every((pane) => pane.kind === "utop") ? (
                  <Activity size={15} />
                ) : (
                  <Terminal size={15} />
                )}
                <div>
                  <span>{name(tab)}</span>
                  <small>
                    {tab.panes.length > 1
                      ? `${tab.panes.length} panes · ${tab.panes.every((p) => p.kind === "utop") ? "Local monitors" : tab.panes.some((p) => p.kind === "utop") ? "Utop + terminal" : tab.panes.some((p) => p.sshProfile) ? "SSH" : "local"}`
                      : tab.panes[0].kind === "utop"
                        ? "Local system monitor"
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
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div
            className="sidebar-tools"
            role="group"
            aria-label="Workspace tools"
          >
            <button
              className="snippets-button"
              title="Command snippets"
              aria-label="Command snippets"
              onClick={() => setSnippetsOpen(true)}
            >
              <BookOpen size={15} />
              <span className="sidebar-tool-label">Snippets</span>
            </button>
            <button
              className="sidebar-help-button"
              onClick={() => setHelp(true)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <CircleHelp size={15} />
            </button>
          </div>
          <UpdateNotice />
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
            <strong>
              {utopActive ? "Utop" : current ? name(current) : "Welcome"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="environment">
              <i />
              {utopActive
                ? "LOCAL MACHINE"
                : pane?.sshProfile
                  ? "SSH"
                  : (pane?.info?.shell.split("/").pop() ?? "shell")}
            </span>
            <UtopMenu
              active={!!utopActive}
              canOpen={paneCount < 12}
              canSplit={canSplit}
              onOpen={openUtop}
            />
          </div>
        </header>
        <div className="tabbar" role="tablist" aria-label="Open terminals">
          {tabs.map((tab) => (
            <div
              className={`tab ${active === tab.key ? "active" : ""}${tabOrder.className(tab.key)}`}
              {...tabOrder.props(tab.key, true)}
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
                onClick={() => {
                  if (
                    !tabOrder.suppress.current &&
                    !sessionOrder.suppress.current
                  )
                    select(tab.key);
                }}
                onDoubleClick={() => setAppearance(tab.key)}
                title={name(tab)}
              >
                {tab.panes.every((pane) => pane.kind === "utop") ? (
                  <Activity size={13} />
                ) : (
                  <Terminal size={13} />
                )}
                <span className="tab-label">{name(tab)}</span>
                {tab.panes.length > 1 && (
                  <small className="pane-count">{tab.panes.length}</small>
                )}
              </button>
              <button
                className="tab-close"
                aria-label={`Close tab ${name(tab)}`}
                onClick={() => closeTab(tab.key)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="icon-button add-tab"
            onClick={add}
            disabled={paneCount >= 12}
            aria-label="New terminal"
            title="New terminal (⌘ T)"
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="terminal-toolbar">
          <span>
            <span className="status-line" />
            {utopActive
              ? "UTOP"
              : pane?.state === "ended"
                ? "SESSION ENDED"
                : "TERMINAL"}
            <small title="Starting directory">
              {utopActive
                ? "LOCAL MACHINE"
                : pane?.sshProfile
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
              disabled={!pane || utopActive}
              onClick={() => handle()?.zoom(-1)}
            >
              <Minus size={13} />
            </button>
            <button
              className="icon-button"
              aria-label="Increase font size"
              disabled={!pane || utopActive}
              onClick={() => handle()?.zoom(1)}
            >
              <Plus size={13} />
            </button>
            <span className="divider" />
            <button
              className="icon-button"
              aria-label="Find in terminal"
              disabled={!pane || utopActive}
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
              disabled={!pane || utopActive}
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
              swap={(first, second) =>
                updateTab(tab.key, (old) => ({
                  ...old,
                  layout: swapPanePositions(old.layout, first, second),
                }))
              }
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
            {utopActive
              ? "Utop · Local machine · Read only"
              : pane?.state === "live"
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
            <span>
              {pane && !utopActive ? `${pane.cols} × ${pane.rows}` : ""}
            </span>
            <span>UTF-8</span>
            <span>{pane?.sshProfile ? "SSH" : "LOCAL"}</span>
          </div>
        </footer>
      </section>
      {snippetsOpen && (
        <CommandSnippets
          target={
            pane && !utopActive
              ? `${current ? name(current) : "Terminal"} · ${pane.sshProfile ? profileAddress(pane.sshProfile) : "Local shell"}`
              : "No active terminal"
          }
          canInsert={pane?.state === "live" && !utopActive}
          onClose={() => setSnippetsOpen(false)}
          onInsert={(command) => {
            const terminal = handle();
            if (!terminal || pane?.state !== "live" || utopActive)
              throw Error("Select a running terminal before inserting.");
            terminal.insertSnippet(command);
            setSnippetsOpen(false);
            requestAnimationFrame(() => terminal.focus());
          }}
        />
      )}
      {profileDialog && (
        <SshProfileDialog
          key={profileDialog.id || "new"}
          initial={profileDialog}
          groups={[
            ...new Set(
              profiles
                .map((profile) => profile.group?.trim())
                .filter((group): group is string => !!group),
            ),
          ].sort()}
          onForgot={setProfiles}
          canConnect={paneCount < 12}
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
