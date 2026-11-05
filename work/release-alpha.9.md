## Ultron v0.1.0-alpha.9

Adds System, Dark, and Light appearance modes across Ultron.

### Changes

- Add Appearance settings near the bottom of the sidebar with System, Dark, and Light choices.
- Default to System and follow macOS appearance changes automatically. Save the chosen preference on this Mac.
- Theme the workspace, sidebar, SSH forms and connection folders, Utop, snippets, and update dialogs.
- Update terminal foreground, background, cursor, selection, and ANSI palettes without recreating terminal sessions.
- Apply the saved appearance before the app's first paint and use CSS variables for supported macOS WebKit versions.
- Add checks for theme selection, invalid saved preferences, and terminal color contrast.

### Install

Apple Silicon Macs running macOS 13.5 or later. Download the DMG and drag Ultron into Applications.

Save terminal work and quit Ultron before replacing the app. Running sessions, tabs, and pane layouts are not restored after quitting. Saved profiles, snippets, group/server order, and preferences remain on this Mac.

This alpha is ad-hoc signed and is not notarized by Apple.

### Validation

- 22 frontend/model tests and 16 native tests passed.
- Isolated local SSH integration passed.
- TypeScript, Prettier, Rust formatting, production web build, macOS app/DMG build, and bundle/DMG integrity checks passed locally.
- Reviewed System/Dark/Light selection, saved-preference reload, and SSH form appearance in an isolated browser preview using the actual UI components.
- A full native UI walkthrough, switching themes with live native terminal sessions, and interactive Keychain checks were not performed.
