## Ultron v0.1.0-alpha.8

Redesigned SSH connection forms and folder lists, with on-demand credential viewing and clearer copy feedback.

### Changes

- Refresh New/Edit SSH connection forms with grouped server details, visible Auto / Password / SSH key choices, and persistent Save / Save & connect actions.
- Refresh Connection folder lists with sign-in method and session status beneath each server name, plus direct View and Copy address buttons.
- Add a connection details dialog with per-field copying and a shortcut to Edit connection.
- Add eye and copy controls for typed or saved SSH passwords. Saved passwords are read from macOS Keychain only after choosing Show or Copy.
- Add copying for SSH key file paths; private key file contents are not loaded into the UI.
- Show brief copy-success toasts and a checkmark on the copied field's button, without displaying copied secret values in notifications.
- Improve spacing around connection guidance and keep copy feedback from shifting form content.

### Install

Apple Silicon Macs running macOS 13.5 or later. Download the DMG and drag Ultron into Applications.

Save terminal work and quit Ultron before replacing the app. Running sessions, tabs, and pane layouts are not restored after quitting. Saved profiles, snippets, group/server order, and preferences remain on this Mac.

This alpha is ad-hoc signed and is not notarized by Apple.

### Validation

- 20 frontend/model tests and 16 native tests passed.
- Isolated local SSH integration passed.
- TypeScript, Prettier, Rust formatting, production web build, macOS app/DMG build, and bundle/DMG integrity checks passed locally.
- A native UI walkthrough and interactive Keychain reveal/copy checks were not performed. Existing tests do not cover the new clipboard and visibility controls end to end.
