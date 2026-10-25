# Ultron

A standalone local terminal app for macOS. Separate repository, application identity, development port and storage from Dum-E.

## First Alpha

- Real login shell through a native pseudo-terminal (PTY), not simulated command output.
- Up to 12 independent terminals. Switching tabs preserves processes and scrollback.
- ANSI colors, Unicode, interactive programs, Ctrl+C, terminal resizing.
- Find output, clear scrollback, font size controls and keyboard shortcuts.
- Dark interface with a custom red identity. No AI service, telemetry or cloud account.

## Develop

Requires macOS 13.5+, Node.js 22.18+/24+, Rust and Xcode Command Line Tools.

```sh
npm ci
npm run dev
```

The app uses port 1432 and the identifier `com.duckfollow.ultron`.

```sh
npm run build:web
npm run test:native
npm run build
```

`npm run build` produces an ad-hoc-signed Apple Silicon app/DMG on an Apple Silicon Mac. Developer ID signing/notarization and independent machine testing are not yet configured. Other platforms are not validated.

## Behavior

New terminals start your `$SHELL` as an interactive login shell in `$HOME`. Commands run with your normal user permissions. Closing a terminal terminates its shell and signals its foreground job. Detached/background jobs that deliberately outlive the shell are not managed by Ultron. Existing terminal windows and other apps are unaffected.

Scrollback is limited to 10,000 lines. Output is streamed as bytes to preserve UTF-8 boundaries, with acknowledgement-based backpressure. Sessions are not restored after quitting. The app does not execute commands automatically or interpret natural-language instructions.

## References

- [xterm.js](https://xtermjs.org/docs/)
- [portable-pty](https://docs.rs/portable-pty/)
- [Tauri IPC channels](https://v2.tauri.app/develop/calling-frontend/)
