import { useEffect, useRef } from "react";
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
};
export type TerminalHandle = {
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
  focused,
  onFocus,
  register,
  onReady,
  onTitle,
  onExit,
  onSize,
}: {
  visible: boolean;
  focused: boolean;
  onFocus: () => void;
  register: (handle: TerminalHandle | null) => void;
  onReady: (info: SessionInfo) => void;
  onTitle: (title: string) => void;
  onExit: (error?: string) => void;
  onSize: (cols: number, rows: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const isActive = useRef(focused);
  isActive.current = focused;
  const callbacks = useRef({ register, onReady, onTitle, onExit, onSize });
  callbacks.current = { register, onReady, onTitle, onExit, onSize };
  useEffect(() => {
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
            if (!disposed && !ended) callbacks.current.onExit(String(error));
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
        term.write(new Uint8Array(event.bytes), () => {
          pendingAck += event.bytes.length;
          acknowledge();
        });
      } else if (event.type === "exit") {
        ended = true;
        term.write(
          `\r\n\x1b[90m[Session ended${event.code === null ? "" : ` · exit ${event.code}`} ]\x1b[0m\r\n`,
        );
        callbacks.current.onExit();
        // Remove the native session after its final output; scrollback remains visible.
        if (id) void invoke("close_terminal", { id }).catch(() => {});
      } else callbacks.current.onExit(event.message);
    };
    callbacks.current.register({
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
        callbacks.current.onExit(String(error));
      });
    return () => {
      disposed = true;
      observer.disconnect();
      resize.dispose();
      data.dispose();
      title.dispose();
      callbacks.current.register(null);
      runtime.current = null;
      term.dispose();
      if (id) void invoke("close_terminal", { id }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      runtime.current?.fit.fit();
      if (focused) runtime.current?.term.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, focused]);
  return (
    <div
      ref={host}
      className={`terminal-host ${visible ? "active" : ""}`}
      onPointerDown={onFocus}
      onFocusCapture={onFocus}
      aria-label="Terminal session"
    />
  );
}
