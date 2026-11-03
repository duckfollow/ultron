## Ultron v0.1.0-alpha.6

Restores the dedicated sidebar collapse/expand button.

### Changes

- Keep the ULTRON logo and name visible independently of the sidebar toggle.
- Restore a separate, always-visible collapse/expand icon button in both expanded and compact sidebar layouts.
- Preserve the ⌘ B shortcut and saved sidebar preference.

### Install

Apple Silicon Macs running macOS 13.5 or later. Download the DMG and drag Ultron into Applications.

Save terminal work and quit Ultron before replacing the app. Running sessions, tabs, and pane layouts are not restored after quitting. Saved profiles, snippets, group/server order, and preferences remain on this Mac.

This alpha is ad-hoc signed and is not notarized by Apple.

### Validation

- 20 frontend/model tests and 16 native tests passed.
- Isolated local SSH integration passed.
- TypeScript, Rust formatting, production web build, macOS app/DMG build, and bundle/DMG integrity checks passed locally.
- A full native UI walkthrough and optional interactive Keychain testing were not performed.
