## Ultron v0.1.0-alpha.7

Improves tab and sidebar controls for a cleaner terminal workspace.

### Changes

- Add an icon beside Utop to show or hide the tab bar, with a saved preference.
- Animate sidebar collapse/expand and tab bar show/hide; respect reduced-motion settings.
- Move the sidebar toggle before Workspace and use a sidebar-style icon.
- Automatically scroll the tab strip to reveal the selected or newly opened tab.
- Add a right-click menu to sidebar sessions for rename/color and closing the selected terminal or whole split tab.
- Hide scrollbars in the tab strip, sidebar lists, and terminal while preserving scrolling.
- Focus terminal input when clicking its content, including after using toolbar controls.
- Prepare terminal dimensions before paint and avoid refitting solely on focus changes.
- Coalesce rapid shell title updates and skip unchanged pane updates to reduce header flicker.

### Install

Apple Silicon Macs running macOS 13.5 or later. Download the DMG and drag Ultron into Applications.

Save terminal work and quit Ultron before replacing the app. Running sessions, tabs, and pane layouts are not restored after quitting. Saved profiles, snippets, group/server order, and preferences remain on this Mac.

This alpha is ad-hoc signed and is not notarized by Apple.

### Validation

- 20 frontend/model tests and 16 native tests passed.
- Isolated local SSH integration passed.
- TypeScript, Rust formatting, production web build, macOS app/DMG build, and bundle/DMG integrity checks passed locally.
- A full native UI walkthrough and optional interactive Keychain testing were not performed. Visual flicker improvements still need confirmation in the native app.
