import { prepareSnippet } from "./snippets-model";
import { Monitor, Server, RotateCw, Pencil, AlertCircle } from "lucide-react";
import { sshFailure } from "./ssh-status";
import { useEffect, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
export type SessionInfo = {
  id: string;
  shell: string;
  cwd: string;
  pid?: number;
  transport: "local" | "ssh";
  target?: string;
};
export type TerminalHandle = {
  insertSnippet: (command: string) => void;
  focus: () => void;
  clear: () => void;
  find: (query: string, previous?: boolean) => void;
  zoom: (amount: number) => void;
};
type Output =
  | { type: "data"; bytes: number[] }
  | { type: "exit"; code: number | null }
  | { type: "error"; message: string };
export function TerminalPane({
  visible,
  profileId,
  focused,
  onFocus,
  register,
  onReady,
  onTitle,
  onExit,
  onSize,
  onRestart,
  onEdit,
}: {
  onRestart: () => void;
  onEdit?: () => void;
  visible: boolean;
  profileId?: string;
  focused: boolean;
  onFocus: () => void;
  register: (handle: TerminalHandle | null) => void;
  onReady: (info: SessionInfo) => void;
  onTitle: (title: string) => void;
  onExit: (error?: string) => void;
  onSize: (cols: number, rows: number) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [connecting, setConnecting] = useState(Boolean(profileId));
  const [hasOutput, setHasOutput] = useState(false);
  const [failure, setFailure] = useState<{
    title: string;
    details: string;
  } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const isActive = useRef(focused);
  isActive.current = focused;
  const callbacks = useRef({ register, onReady, onTitle, onExit, onSize });
  callbacks.current = { register, onReady, onTitle, onExit, onSize };
  useEffect(() => {
    setConnecting(Boolean(profileId));
    setHasOutput(false);
    setFailure(null);
    const startedAt = performance.now();
    let animationTimer: ReturnType<typeof setTimeout> | undefined;
    let outputSeen = false;
    const revealTerminal = () => {
      if (outputSeen) return;
      outputSeen = true;
      setHasOutput(true);
      animationTimer = setTimeout(
        () => setConnecting(false),
        Math.max(0, 800 - (performance.now() - startedAt)),
      );
    };
    let diagnosticTail = "";
    const decoder = new TextDecoder();
    const fail = (message: string) => {
      setConnecting(false);
      if (profileId)
        setFailure({ title: "Unable to start SSH", details: message });
      callbacks.current.onExit(profileId ? undefined : message);
    };
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SF Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 10000,
      allowProposedApi: false,
      theme: {
        background: "#101114",
        foreground: "#e2e3e7",
        cursor: "#ff686b",
        selectionBackground: "#5e333c",
        black: "#25262d",
        red: "#f27881",
        green: "#a0d5ad",
        yellow: "#e8ca91",
        blue: "#91b5ef",
        magenta: "#c2a1e4",
        cyan: "#8dced1",
        white: "#d4d6df",
        brightBlack: "#747887",
        brightRed: "#ff9aa2",
        brightGreen: "#b6efc2",
        brightYellow: "#ffe0a7",
        brightBlue: "#b6d2ff",
        brightMagenta: "#dfbfff",
        brightCyan: "#b6eeee",
        brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon(),
      search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(host.current!);
    runtime.current = { term, fit };
    let id: string | undefined,
      disposed = false,
      ended = false,
      pendingAck = 0;
    let writes = Promise.resolve();
    function acknowledge() {
      if (!id || !pendingAck || disposed) return;
      const bytes = pendingAck;
      pendingAck = 0;
      void invoke("ack_terminal", { id, bytes }).catch(() => {});
    }
    function fitTerminal() {
      if (
        host.current &&
        host.current.clientWidth > 0 &&
        host.current.clientHeight > 0
      )
        fit.fit();
    }
    fitTerminal();
    const observer = new ResizeObserver(fitTerminal);
    observer.observe(host.current!);
    const resize = term.onResize(({ cols, rows }) => {
      callbacks.current.onSize(cols, rows);
      if (id && !ended)
        void invoke("resize_terminal", { id, cols, rows }).catch(() => {});
    });
    const data = term.onData((value) => {
      if (!id || ended || disposed) return;
      setConnecting(false);
      // Serialize input so a paste and the following Enter cannot arrive out of order.
      for (let offset = 0; offset < value.length;) {
        let end = Math.min(offset + 8192, value.length);
        const last = value.charCodeAt(end - 1);
        if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
        const chunk = value.slice(offset, end);
        offset = end;
        writes = writes
          .then(async () => {
            if (!disposed && !ended)
              await invoke("write_terminal", { id, data: chunk });
          })
          .catch((error) => {
            if (!disposed && !ended) fail(String(error));
          });
      }
    });
    const title = term.onTitleChange((value) =>
      callbacks.current.onTitle(value.slice(0, 80)),
    );
    const output = new Channel<Output>();
    output.onmessage = (event) => {
      if (disposed) return;
      if (event.type === "data") {
        if (profileId) {
          diagnosticTail = (
            diagnosticTail +
            decoder.decode(new Uint8Array(event.bytes), { stream: true })
          ).slice(-16384);
          // Any SSH output may be a password, OTP, or host-key question. Never cover it.
          if (event.bytes.length) revealTerminal();
        }
        term.write(new Uint8Array(event.bytes), () => {
          pendingAck += event.bytes.length;
          acknowledge();
        });
      } else if (event.type === "exit") {
        ended = true;
        setConnecting(false);
        if (profileId) setFailure(sshFailure(diagnosticTail, event.code));
        term.write(
          `\r\n\x1b[90m[Session ended${event.code === null ? "" : ` · exit ${event.code}`} ]\x1b[0m\r\n`,
        );
        callbacks.current.onExit();
        // Remove the native session after its final output; scrollback remains visible.
        if (id) void invoke("close_terminal", { id }).catch(() => {});
      } else fail(event.message);
    };
    callbacks.current.register({
      insertSnippet: (command) => {
        if (!id || ended || disposed)
          throw Error("Select a running terminal before inserting.");
        term.paste(prepareSnippet(command, term.modes.bracketedPasteMode));
      },
      focus: () => term.focus(),
      clear: () => {
        term.clear();
        term.focus();
      },
      find: (query, previous = false) => {
        if (!query) search.clearDecorations();
        else if (previous) search.findPrevious(query);
        else search.findNext(query);
      },
      zoom: (amount) => {
        term.options.fontSize = Math.max(
          10,
          Math.min(24, (term.options.fontSize ?? 13) + amount),
        );
        fitTerminal();
      },
    });
    void invoke<SessionInfo>("open_terminal", {
      cols: term.cols,
      rows: term.rows,
      profileId: profileId ?? null,
      output,
    })
      .then((info) => {
        id = info.id;
        if (disposed || ended) {
          void invoke("close_terminal", { id });
          return;
        }
        callbacks.current.onReady(info);
        callbacks.current.onSize(term.cols, term.rows);
        acknowledge();
        void invoke("resize_terminal", {
          id,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
        if (isActive.current) term.focus();
      })
      .catch((error) => {
        if (disposed) return;
        ended = true;
        term.writeln(`\x1b[31mUnable to start shell: ${String(error)}\x1b[0m`);
        fail(String(error));
      });
    return () => {
      disposed = true;
      clearTimeout(animationTimer);
      observer.disconnect();
      resize.dispose();
      data.dispose();
      title.dispose();
      callbacks.current.register(null);
      runtime.current = null;
      term.dispose();
      if (id) void invoke("close_terminal", { id }).catch(() => {});
    };
  }, [attempt]);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      runtime.current?.fit.fit();
      if (focused) runtime.current?.term.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, focused]);
  return (
    <>
      <div
        ref={host}
        className={`terminal-host ${visible ? "active" : ""}`}
        onPointerDown={onFocus}
        onFocusCapture={onFocus}
        aria-label="Terminal session"
      />
      {visible && connecting && (
        <div
          className={`ssh-connecting ${hasOutput ? "compact" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div className="ssh-route" aria-hidden="true">
            <Monitor size={25} />
            <span className="ssh-dots">
              {[0, 1, 2, 3, 4].map((dot) => (
                <i key={dot} style={{ animationDelay: `${dot * 140}ms` }} />
              ))}
            </span>
            <Server size={25} />
          </div>
          <span>{hasOutput ? "SSH session" : "Connecting…"}</span>
        </div>
      )}
      {visible && failure && (
        <div className="ssh-failure" role="alert">
          <div className="ssh-failure-title">
            <AlertCircle size={16} />
            <strong>{failure.title}</strong>
          </div>
          <div className="ssh-failure-actions">
            <button
              onClick={() => {
                onRestart();
                setAttempt((value) => value + 1);
              }}
            >
              <RotateCw size={13} /> Retry
            </button>
            {onEdit && (
              <button onClick={onEdit}>
                <Pencil size={13} /> Edit connection
              </button>
            )}
          </div>
          <details>
            <summary>Show details</summary>
            <pre>{failure.details}</pre>
          </details>
        </div>
      )}
    </>
  );
}
