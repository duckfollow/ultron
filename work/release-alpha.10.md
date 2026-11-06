## Ultron v0.1.0-alpha.10

Adds connection import/export, optional password-protected backups, and refined sidebar controls.

### Changes

- Import Ultron JSON with a connection preview and explicit Skip / Replace duplicate handling. Skip is the default; existing running sessions stay open.
- Export all saved connections or a single Connection folder. Plain JSON excludes passwords and private key contents.
- Optionally include saved SSH passwords in an encrypted backup. Require a backup password of at least 12 characters and confirmation; encrypt the entire payload with Argon2id and XChaCha20-Poly1305.
- Read exported passwords from macOS Keychain only after choosing Export encrypted. Unlock encrypted backups before previewing; decrypted SSH passwords stay in the native process.
- Save passwords for accepted imported entries to Keychain. Skipped entries keep their credentials. Attempt rollback on a credential or profile-write failure and report incomplete rollback explicitly.
- Detect stale previews and changed source files before import. Validate formats, sizes, entries and fixed encryption parameters before changing stored data.
- Refine the Import & export layout, remove nested scrolling, and fix clipped footer actions.
- Match compact sidebar hover areas and use PlugZap for Add SSH in the compact sidebar.
- Refresh third-party notices for cryptography dependencies and document the encrypted backup format.

### Backup passwords

Include saved passwords is off by default. Private key file contents and key passphrases are never included. Keep the backup password safe: Ultron does not store it and cannot recover it.

### Install

Apple Silicon Macs running macOS 13.5 or later. Download the DMG and drag Ultron into Applications.

Save terminal work and quit Ultron before replacing the app. Running sessions, tabs, and pane layouts are not restored after quitting. Saved profiles, snippets, group/server order, and preferences remain on this Mac.

This alpha is ad-hoc signed and is not notarized by Apple.

### Validation and limits

- 22 frontend/model tests and 29 native tests passed, including encrypted roundtrip, wrong passwords, tampering, validation, duplicate policies, scoped export, stale previews and rollback behavior.
- Isolated local SSH integration passed.
- TypeScript, Prettier, Rust formatting, production web build, macOS app/DMG build, and bundle/DMG integrity checks passed locally.
- Reviewed import/export and encrypted backup flows in an isolated browser preview with dummy data and injected fixture services.
- Native file dialogs and real interactive Keychain export/import were not exercised. Credential transaction tests use a fake store. This implementation has not undergone an independent security audit.
