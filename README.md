# Ultron

A standalone local terminal app for macOS. Separate repository, application identity, development port and storage from Dum-E.

## First Alpha

- Real login shell through a native pseudo-terminal (PTY), not simulated command output.
- Saved SSH connections: name, host, port, username and optional SSH key path. Connect in a new tab or a split pane using the system OpenSSH client.
- Up to 12 independent terminal sessions. Each tab supports up to 4 panes, split left/right or top/bottom. Switching tabs and splitting preserves existing processes and scrollback.
- Drag a divider to resize panes, use its arrow keys, or double-click it to restore an even split. Small panes must be enlarged before splitting further.
- Double-click a tab (or use its … button) to set a name and color. Custom names remain fixed when the shell title changes; a blank name restores automatic titles.
- ANSI colors, Unicode, interactive programs, Ctrl+C, terminal resizing.
- Find output, clear scrollback, font size controls and keyboard shortcuts.
- Collapsible sidebar with a compact 64px icon rail. Toggle with the sidebar button or ⌘ B; the preference survives restarts without restarting terminal sessions.
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
npm test
npm run test:native
npm run test:ssh
npm run build
```

`npm run build` produces an ad-hoc-signed Apple Silicon app/DMG on an Apple Silicon Mac. Developer ID signing/notarization and independent machine testing are not yet configured. Other platforms are not validated.

## Behavior

New terminals start your `$SHELL` as an interactive login shell in `$HOME`. Commands run with your normal user permissions. Closing a pane terminates only its shell and signals its foreground job. Closing a whole tab closes all of its panes. Detached/background jobs that deliberately outlive the shell are not managed by Ultron. Existing terminal windows and other apps are unaffected.

Scrollback is limited to 10,000 lines. Output is streamed as bytes to preserve UTF-8 boundaries, with acknowledgement-based backpressure. Sessions are not restored after quitting. The app does not execute commands automatically or interpret natural-language instructions.

## References

- [xterm.js](https://xtermjs.org/docs/)
- [portable-pty](https://docs.rs/portable-pty/)
- [Tauri IPC channels](https://v2.tauri.app/develop/calling-frontend/)

## Split and tab shortcuts

| Action | Shortcut |
| --- | --- |
| Toggle sidebar | ⌘ B |
| Split left / right | ⌘ D |
| Split top / bottom | ⌘ ⇧ D |
| Focus next pane | ⌘ J |
| Close active pane | ⌘ W |
| Close whole tab | ⌘ ⇧ W |
| Switch tab | ⌘ 1–9 |

Find, clear scrollback and font controls affect the focused pane. Names, colors and layouts are session-only, like the terminals themselves. Closing a pane does not close neighboring panes.

## Saved SSH connections

Use **Connections → +** to save a server. **Save** works offline; **Save & connect** opens a new tab. Click a connection to open another SSH session, or use **…** to connect in a split pane, edit, or delete its saved profile. Deleting a profile leaves existing sessions running.

Profiles are stored atomically at `~/Library/Application Support/com.duckfollow.ultron/ssh-profiles.json` with owner-only file permissions. The app saves connection metadata and the identity-file path; it never copies private keys or stores passwords in the profile file. **Authentication** is saved per profile:

- **Auto** tries keys / ssh-agent first, then password or keyboard-interactive authentication. An optional key path chooses a specific identity.
- **Password** skips public keys and asks in the terminal. The server must allow password or keyboard-interactive sign-in; this setting cannot enable it on the server. A previously selected key is ignored in this mode.
- **SSH key** requires a private key file and uses public-key authentication only. Encrypted keys may ask for a passphrase in the terminal; there is no login-password fallback.

Profiles created before this option default to Auto. Key paths may be absolute or start with `~/`. Missing selected key files produce an error instead of silently falling back. Existing connections keep their current authentication until reopened.

SSH panes show a client-to-server animation while waiting for initial output. The animation stays visible for at least 800 ms while SSH starts. If output arrives sooner it shrinks into a small corner indicator, keeping password, OTP, and host-key prompts accessible. Typing or a failure dismisses it immediately. Failed SSH exits show a concise error, **Show details**, **Retry** in the same pane, and **Edit connection**. Retry uses the latest saved profile. Details include recognized SSH diagnostics; terminal scrollback remains available. Normal remote command exits do not show connection failures.

Authentication and new host-key verification happen in the terminal. OpenSSH checks the user's normal known_hosts file; changed host keys are rejected. The app invokes `/usr/bin/ssh` with separate arguments (no shell command interpolation), a 15-second connection timeout, agent forwarding off, and local SSH commands disabled. Authentication preferences and interactive prompts are explicit, and connection multiplexing is disabled so the chosen method is used for each new session. Other user SSH configuration, including host aliases and ProxyJump, is inherited; the profile's port and username are explicit overrides. A running SSH process is labeled **SSH session**, not proof of successful authentication.

`npm run test:ssh` creates temporary test keys and a loopback-only SSH fixture, verifies interactive key, password, keyboard-interactive, and Auto fallback sessions, checks that passwords are not echoed, and confirms that key-only mode does not fall back and mismatched host keys are rejected. It uses isolated known_hosts files and never reads saved connections or modifies the user's SSH configuration. UI testing uses a separate preview identifier.

**Remember password** is optional and off by default. Saved login passwords live in macOS Keychain, with no paid service or subscription. Use **Forget password** to remove one. Changing the server, port, or username requires a new password. Rejected saved passwords are removed before asking again. OTP / 2FA codes and key passphrases are always entered manually and never stored. Automatic filling only applies to OpenSSH’s exact login-password prompt; generic keyboard-interactive prompts remain manual. macOS may request Keychain access permission.

`npm run test:keychain` additionally checks saved-password sign-in, rejected-password retry, and manual OTP with disposable credentials in the local macOS Keychain.

SCP/SFTP file-transfer controls are not part of this milestone. Sessions remain transient; saved SSH profiles survive app restarts.
