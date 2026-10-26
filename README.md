# Ultron

<img src="src-tauri/icons/128x128.png" alt="Ultron logo" width="80" height="80" />

An open-source terminal for macOS with native shell sessions, split panes, and saved SSH connections. Built with Tauri, React, Rust, and xterm.js.

[Download Ultron](https://github.com/duckfollow/ultron/releases) · [All releases](https://github.com/duckfollow/ultron/releases) · [Report a bug](https://github.com/duckfollow/ultron/issues)

## Install

The current release is an **alpha** for **Apple Silicon Macs running macOS 13.5 or later**. Download the `.dmg` from [Releases](https://github.com/duckfollow/ultron/releases), open it, and drag Ultron into Applications.

Downloads are ad-hoc signed and **not notarized by Apple**. macOS Gatekeeper may block the app, including showing a “damaged” warning. If it blocks the download, build from source using the development instructions below. A notarized installer and independent testing on other Macs are still pending. Intel Macs and other operating systems are not validated.

A `SHA256SUMS.txt` file accompanies each release. Compare it with the result of:

```sh
shasum -a 256 Ultron_0.1.0-alpha.2_aarch64.dmg
```

## License

Ultron is available under the [MIT License](LICENSE). Bundled third-party components retain their respective licenses; see `THIRD_PARTY_NOTICES.txt` in the release assets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and validation. When reporting issues, include the app version, macOS version, and steps to reproduce. Remove passwords, keys, OTP codes, and private server details from logs and screenshots.

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

| Action             | Shortcut |
| ------------------ | -------- |
| Toggle sidebar     | ⌘ B      |
| Split left / right | ⌘ D      |
| Split top / bottom | ⌘ ⇧ D    |
| Focus next pane    | ⌘ J      |
| Close active pane  | ⌘ W      |
| Close whole tab    | ⌘ ⇧ W    |
| Switch tab         | ⌘ 1–9    |

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

## Update checks

The sidebar shows the installed version and **Check for updates**. Ultron checks the public `duckfollow/ultron` GitHub Releases feed automatically at most once per day, and allows manual checks at any time. When a newer release is available, **Download** opens its GitHub Release page in the default browser; **Later** dismisses the notice. Updates are installed manually. The control remains accessible when the sidebar is collapsed.

Preview builds receive newer preview and stable releases; stable builds receive stable releases only. The newest semantic version among the most recent 100 releases is selected, ignoring drafts, invalid version tags, and build-metadata-only changes. Automatic check failures stay quiet; manual checks show an error and can be retried. Checks send the app version in the User-Agent and do not include terminal content, commands, or SSH profile information.

To publish an update, keep the versions in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` in sync, then publish a GitHub Release with a semantic version tag (for example `v0.1.0-alpha.2`) and its installer. Mark preview versions as prereleases. No GitHub token or separate update server is required for public releases.

## Command snippets

Open **Command snippets** in the sidebar to create named commands, search by name or content, edit, copy, and delete them. Snippets persist in local WebView storage on this device across app launches. The dialog shows the destination terminal/pane before inserting.

**Insert** pastes at the active terminal cursor without sending Enter or clearing existing input. Review the current prompt first. Trailing line endings are removed. Multiline commands require the terminal application to have bracketed paste enabled; otherwise use Copy or a single line. Control sequences are rejected on insertion. Commands can be reviewed or edited in the snippet dialog before insertion, and still require Enter in the terminal to run.

## Utop local system monitor

Select the **Utop** activity icon in the top-right corner to choose a new tab, a left/right split, or a top/bottom split for the machine running Ultron. Utop panes share the same layout as local and SSH terminals. Resize dividers, drag a pane header onto another pane to swap positions, or use its Swap button. Closing a Utop pane leaves the other sessions running. CPU (including logical cores and load average), RAM/swap, per-interface network rates, mounted disk capacity, and searchable/sortable processes are collected through native OS APIs. It always shows **Local machine**, even when an SSH terminal is open. Existing terminal panes stay open when switching to Utop. The monitor is read only. Its layout adapts to the pane width, with scrolling for smaller panes. Monitor panes count toward the existing limits of four panes per tab and twelve panes per workspace.

Choose a 1, 2, or 5 second refresh interval, or pause and resume. Sampling stops when the containing workspace tab is inactive or the page is hidden. Visible Utop panes continue refreshing while a neighboring terminal has focus; native snapshots are shared to avoid duplicate sampling. Graphs retain up to 2 minutes in memory. CPU and network rates warm up over two samples; long gaps start a new baseline. Network rates use the actual elapsed sample time and one selected interface, rather than summing interfaces. Process CPU uses 100% per logical core, so a process may exceed 100%; total CPU stays within 0–100%. Process memory is resident memory as reported by the OS. The table displays the first 200 matches after filtering and sorting.

Disk capacities are shown per mount and are not summed because APFS volumes can share container capacity. Disk metadata refreshes approximately every 10 seconds. No `sudo`, remote monitoring, process termination, telemetry, or persistent metric history is used.
