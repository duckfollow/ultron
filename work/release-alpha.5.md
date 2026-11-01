## Ultron v0.1.0-alpha.5

A refreshed sidebar and terminal toolbar, with a searchable folder picker for saved SSH connections.

### Changes

- Open a project's connections in a searchable modal from either the expanded sidebar or the compact folder icon rail. The current connection is marked separately.
- Rename folders from the picker. Renames update all saved members in one write, reject blank/duplicate names, preserve connection metadata, and keep folder order. Ungrouped cannot be renamed.
- Refreshed sidebar with folder cards, connection counts, an empty workspace state, and grouped Snippets/Help controls. Click the Ultron logo or name to collapse/expand; the existing sidebar preference remains persistent across restarts.
- Grouped terminal tools for splitting/appearance, font size, and search/clear. Search highlights when active, and controls wrap on narrower windows.
- Emphasize SSH host/IP addresses in the terminal toolbar and status bar while keeping usernames and ports readable.
- Added text and color for Connecting, Session active, and Disconnected in the terminal toolbar and connection picker. Session active indicates a running SSH process, not confirmation of successful remote authentication. If a saved connection has multiple sessions, active sessions take precedence over starting or ended sessions.

### Install

Apple Silicon Macs running macOS 13.5 or later. Download the DMG and drag Ultron into Applications.

Save terminal work and quit Ultron before replacing the app. Running sessions, tabs, and pane layouts are not restored after quitting. Saved profiles, snippets, group/server order, and preferences remain on this Mac.

This alpha is ad-hoc signed and is not notarized by Apple. Developer ID signing, notarization, and Intel builds are not included.

### Validation

- 20 frontend/model tests and 16 native tests passed.
- Isolated local SSH integration passed separately.
- TypeScript, Rust formatting, production web build, macOS app/DMG build, and bundle/DMG integrity checks passed locally.
- Changed UI layouts were inspected in browser fixtures using sample connection data. A full native UI walkthrough and restart check were not performed.
- Optional interactive Keychain testing was not rerun; authentication behavior is unchanged.
