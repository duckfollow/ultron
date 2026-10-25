# Contributing to Ultron

Bug reports, small improvements, and pull requests are welcome. Please discuss larger changes in an issue before implementing them.

## Setup

Use macOS 13.5 or later, Node.js 22.18+/24+, Rust stable, and Xcode Command Line Tools.

```sh
git clone https://github.com/duckfollow/ultron.git
cd ultron
npm ci
npm run dev
```

The UI is React/TypeScript in `src/`; native PTY, OpenSSH, and Keychain integration are Rust in `src-tauri/src/`.

## Validation

```sh
npm test
npm run build:web
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm run test:native
npm run test:ssh
```

`npm run test:ssh` uses a temporary loopback server, generated test keys, and isolated known_hosts files. `npm run test:keychain` additionally creates and removes disposable Keychain entries; run it locally on macOS when changing saved-password authentication. It is intentionally excluded from CI because Keychain access can require an interactive macOS session.

For UI testing, use a separate Tauri application identifier to keep real saved connections untouched. Test tab switching and split panes as well as the changed flow. Do not commit passwords, keys, terminal output containing secrets, or personal connection profiles.

Explain the problem, resulting behavior, and relevant validation in your PR. Contributions are provided under the project's MIT license.

Release maintainers can regenerate third-party notices with `python3 scripts/third-party-notices.py` after `npm ci`. The script collects installed macOS package licenses and fetches missing license texts from recorded upstream commits.
