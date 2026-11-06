# Password-protected connection backups

The default export is plain Ultron JSON without passwords. Enabling **Include saved passwords** creates an encrypted JSON envelope; all connection metadata and any saved SSH login passwords are inside the ciphertext. Private key file contents and key passphrases are never read or included. Encrypted exports use a neutral default filename.

## Format version 1

The outer envelope has `format: "ultron-encrypted-connections"`, `version: 1`, `cipher: "xchacha20poly1305"`, and a `kdf` object with `algorithm: "argon2id"`, `memoryKiB: 65536`, `iterations: 3`, and `parallelism: 4`. The implementation uses Argon2 v1.3 (version 19), a 32-byte derived key, a fresh 16-byte OS-random salt, and a fresh 24-byte OS-random nonce for every export. Salt, nonce and authenticated ciphertext are standard padded Base64.

The AEAD associated data is the exact UTF-8 byte string:

```
Ultron encrypted connections v1;argon2id-v19;m=65536;t=3;p=4;xchacha20poly1305
```

All algorithm identifiers, version numbers, parameters and decoded lengths are validated before key derivation. Version 1 accepts only the fixed parameters above, preventing an input file from requesting unbounded KDF memory or computation. Ciphertext modifications or a wrong password fail authentication before payload parsing.

The decrypted payload contains a standard version 1 Ultron `transfer` plus a `passwords` array. Each password record has an `index` into `transfer.connections` and a `password`. Password records must have distinct, valid indexes and valid SSH password values. SSH key authentication entries cannot have password records. IDs and Keychain flags are not transferred.

Backup passwords are compared as exact UTF-8 strings without trimming or normalization. Export requires at least 12 Unicode characters, nonblank content, and no more than 1024 UTF-8 bytes. Confirmation is required in the UI. Unlocking accepts the entered value without changing it. There is no recovery mechanism or stored copy of the backup password.

## Limits and lifecycle

Plain exports retain the 1 MB / 100-entry format. Encrypted envelopes are limited to 4 MB; decrypted payloads to 2 MB and 100 entries. Neither plaintext payloads nor decrypted SSH passwords are written to temporary files. Export atomically replaces the selected destination with a file restricted to the owning user on Unix systems. If Keychain access, validation, or encryption fails, the destination is not replaced.

An encrypted preview returns only connection metadata, a password count, the saved-connection revision, and a SHA-256 fingerprint of the encrypted source file. No decrypted SSH passwords are returned through IPC. To import, the native process rereads the file, checks its fingerprint against the unlocked preview, authenticates and decrypts it again, and rejects a stale saved-connection revision before modifying Keychain or profile storage.

The UI holds the backup password only for the current flow, clearing it after success, when selecting another source, switching modes, disabling password export, or closing the dialog. Native password records, backup password arguments, previous Keychain value snapshots, derived keys, and plaintext serialization/decryption buffers use zeroizing types. JavaScript and OS/library-managed memory are not guaranteed to be erased.

## Import and failure handling

Duplicate matching uses host (case-insensitive), port and username. Skip is the default. A skipped row never reads or writes its Keychain value. Replace preserves the matched connection ID and exact endpoint spelling used for Keychain association. New connections receive new IDs. Only the final accepted source entry for an endpoint can supply its imported password.

Before writing any password, all affected Keychain accounts are snapshotted. If a read is denied, nothing is modified. On a password write or atomic profile-file write failure, affected accounts are restored to their prior value or absence in reverse order. A rollback failure is reported explicitly, since Keychain and the profile file cannot share a cross-store atomic transaction. Existing running terminal sessions are not replaced or reconnected.

## Validation

Tests use isolated temporary profile files and a fake credential store. They cover encrypted roundtrip, randomized ciphertext, wrong passwords, tampering, unsupported or excessive KDF parameters, malformed password records, scoped credential export, duplicate skip/replace behavior, stale previews, and rollback after credential or profile-write failure. UI checks use dummy backup passwords and injected local fixture services. Live interactive macOS Keychain dialogs still require native verification. This implementation has not undergone an independent security audit.

Implementation references: [RustCrypto Argon2 0.5.3](https://docs.rs/argon2/0.5.3/argon2/), [RustCrypto XChaCha20-Poly1305 0.10.1](https://docs.rs/chacha20poly1305/0.10.1/chacha20poly1305/), and [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html).
