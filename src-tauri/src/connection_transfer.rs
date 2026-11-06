use crate::secure_backup::{self, Contents, PasswordRecord};
use crate::ssh::{self, AuthMethod, Profile, ProfileStore};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
use tauri::{AppHandle, State};
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};
const LIMIT: usize = 1024 * 1024;

// Intentionally excludes profile IDs, Keychain flags, passwords and key contents.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connection {
    name: String,
    #[serde(default)]
    group: String,
    host: String,
    port: u16,
    username: String,
    #[serde(default)]
    identity_file: String,
    #[serde(default)]
    auth_method: AuthMethod,
}
impl Connection {
    pub(crate) fn profile(&self) -> Profile {
        Profile {
            id: String::new(),
            name: self.name.trim().into(),
            group: self.group.trim().into(),
            host: self.host.trim().into(),
            port: self.port,
            username: self.username.trim().into(),
            identity_file: self.identity_file.trim().into(),
            auth_method: self.auth_method.clone(),
            remember_password: false,
        }
    }
}
impl From<&Profile> for Connection {
    fn from(p: &Profile) -> Self {
        Self {
            name: p.name.clone(),
            group: p.group.clone(),
            host: p.host.clone(),
            port: p.port,
            username: p.username.clone(),
            identity_file: p.identity_file.clone(),
            auth_method: p.auth_method.clone(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Transfer {
    format: String,
    version: u32,
    pub(crate) connections: Vec<Connection>,
}
fn endpoint(p: &Profile) -> (String, u16, String) {
    (p.host.to_ascii_lowercase(), p.port, p.username.clone())
}
pub(crate) fn validate(transfer: &Transfer) -> Result<(), String> {
    if transfer.format != "ultron-connections" || transfer.version != 1 {
        return Err(
            "Unsupported connection file. Use an Ultron export with format version 1.".into(),
        );
    }
    if transfer.connections.is_empty() || transfer.connections.len() > 100 {
        return Err("Choose a file containing 1 to 100 connections.".into());
    }
    for (index, c) in transfer.connections.iter().enumerate() {
        let p = c.profile();
        p.validate()
            .map_err(|e| format!("Connection {}: {e}", index + 1))?;
    }
    Ok(())
}
pub(crate) fn parse(bytes: &[u8]) -> Result<Transfer, String> {
    if bytes.len() > LIMIT {
        return Err("Connection file is too large (maximum 1 MB).".into());
    }
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    let mut transfer: Transfer = serde_json::from_slice(bytes).map_err(|_| "Invalid connection file. Choose JSON exported from Ultron; passwords and unknown fields are not accepted.")?;
    validate(&transfer)?;
    transfer.connections = transfer
        .connections
        .iter()
        .map(|c| Connection::from(&c.profile()))
        .collect();
    Ok(transfer)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    transfer: Transfer,
    revision: String,
    existing_count: usize,
    conflicts: Vec<Option<String>>,
    encrypted: bool,
    password_count: usize,
    file_digest: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    locked: bool,
    preview: Option<Preview>,
}
fn read_backup(file_path: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    let file = fs::File::open(file_path).map_err(|_| "Unable to open the selected file.")?;
    if !file
        .metadata()
        .map_err(|_| "Unable to inspect the file.")?
        .is_file()
    {
        return Err("Choose a regular JSON file.".into());
    }
    let mut bytes = Zeroizing::new(Vec::new());
    file.take((secure_backup::FILE_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Unable to read the selected file.")?;
    if bytes.len() > secure_backup::FILE_LIMIT {
        return Err("Backup file is too large (maximum 4 MB for encrypted backups).".into());
    }
    Ok(bytes)
}
#[tauri::command]
pub async fn preview_ssh_import(
    app: AppHandle,
    store: State<'_, ProfileStore>,
    file_path: String,
    backup_password: Option<String>,
) -> Result<Inspection, String> {
    let backup_password = backup_password.map(Zeroizing::new);
    let lock = store.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = read_backup(&file_path)?;
        let encrypted = secure_backup::is_encrypted(&bytes)?;
        if encrypted && backup_password.is_none() {
            return Ok(Inspection {
                locked: true,
                preview: None,
            });
        }
        let (transfer, password_count) = if encrypted {
            let contents = secure_backup::decrypt(&bytes, backup_password.as_ref().unwrap())?;
            let count = contents.passwords.len();
            (contents.transfer, count)
        } else {
            (parse(&bytes)?, 0)
        };
        let _guard = lock.lock().map_err(|_| "Connection storage is busy.")?;
        let profiles = ssh::read(&ssh::path(&app)?)?;
        let mut candidates = profiles.clone();
        let conflicts = transfer
            .connections
            .iter()
            .map(|c| {
                let profile = c.profile();
                let found = candidates
                    .iter()
                    .find(|p| endpoint(p) == endpoint(&profile))
                    .map(|p| p.name.clone());
                if found.is_none() {
                    candidates.push(profile);
                }
                found
            })
            .collect();
        Ok(Inspection {
            locked: false,
            preview: Some(Preview {
                revision: serde_json::to_string(&profiles)
                    .map_err(|_| "Unable to prepare import.")?,
                existing_count: profiles.len(),
                transfer,
                conflicts,
                encrypted,
                password_count,
                file_digest: if encrypted {
                    Some(secure_backup::fingerprint(&bytes))
                } else {
                    None
                },
            }),
        })
    })
    .await
    .map_err(|_| "Could not prepare import.".to_string())?
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DuplicatePolicy {
    Skip,
    Replace,
}
fn merge(
    existing: &[Profile],
    transfer: &Transfer,
    policy: DuplicatePolicy,
) -> Result<(Vec<Profile>, usize, usize, usize), String> {
    validate(transfer)?;
    let mut profiles = existing.to_vec();
    let (mut added, mut replaced, mut skipped) = (0, 0, 0);
    for c in &transfer.connections {
        let mut incoming = c.profile();
        let matches: Vec<usize> = profiles
            .iter()
            .enumerate()
            .filter(|(_, p)| endpoint(p) == endpoint(&incoming))
            .map(|(i, _)| i)
            .collect();
        if let Some(&index) = matches.first() {
            match policy {
                DuplicatePolicy::Skip => {
                    skipped += 1;
                    continue;
                }
                DuplicatePolicy::Replace => {
                    if matches.len() > 1 {
                        return Err("Multiple saved connections match one endpoint. Use Skip duplicates or resolve the saved duplicates first.".into());
                    }
                    incoming.id = profiles[index].id.clone();
                    // Preserve the exact endpoint spelling used by its Keychain account.
                    incoming.host = profiles[index].host.clone();
                    // Never read, write or delete a Keychain entry during transfer.
                    incoming.remember_password = profiles[index].remember_password
                        && incoming.auth_method != AuthMethod::Key;
                    profiles[index] = incoming;
                    replaced += 1;
                }
            }
        } else {
            incoming.id = uuid::Uuid::new_v4().to_string();
            profiles.push(incoming);
            added += 1;
        }
    }
    if profiles.len() > 100 {
        return Err("Import exceeds the limit of 100 saved connections. Export fewer connections or remove unused saved entries.".into());
    }
    Ok((profiles, added, replaced, skipped))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    profiles: Vec<Profile>,
    added: usize,
    replaced: usize,
    skipped: usize,
    passwords_imported: usize,
}
#[tauri::command]
pub async fn import_ssh_connections(
    app: AppHandle,
    store: State<'_, ProfileStore>,
    transfer: Transfer,
    revision: String,
    policy: DuplicatePolicy,
    source: Option<EncryptedSource>,
) -> Result<ImportResult, String> {
    let lock = store.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "Connection storage is busy.")?;
        let path = ssh::path(&app)?;
        if let Some(source) = source {
            let bytes = read_backup(&source.file_path)?;
            if secure_backup::fingerprint(&bytes) != source.file_digest {
                return Err(
                    "Backup file changed. Choose it again and unlock a fresh preview.".into(),
                );
            }
            let contents = secure_backup::decrypt(&bytes, &source.backup_password)?;
            apply_secure_import(&path, &contents, &revision, policy, &mut MacCredentials)
        } else {
            apply_import(&path, &transfer, &revision, policy)
        }
    })
    .await
    .map_err(|_| "Could not finish import.".to_string())?
}
fn apply_import(
    path: &Path,
    transfer: &Transfer,
    revision: &str,
    policy: DuplicatePolicy,
) -> Result<ImportResult, String> {
    let old = ssh::read(path)?;
    if serde_json::to_string(&old).map_err(|_| "Unable to read connections.")? != revision {
        return Err("Saved connections changed. Choose the file again to refresh the preview before importing.".into());
    }
    let (profiles, added, replaced, skipped) = merge(&old, transfer, policy)?;
    if added + replaced > 0 {
        ssh::write(path, &profiles)?;
    }
    Ok(ImportResult {
        profiles,
        added,
        replaced,
        skipped,
        passwords_imported: 0,
    })
}
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncryptedSource {
    file_path: String,
    file_digest: String,
    backup_password: String,
}
trait CredentialStore {
    fn read(&mut self, profile: &Profile) -> Result<Option<String>, String>;
    fn set(&mut self, profile: &Profile, password: &str) -> Result<(), String>;
    fn forget(&mut self, profile: &Profile) -> Result<(), String>;
}
struct MacCredentials;
impl CredentialStore for MacCredentials {
    fn read(&mut self, p: &Profile) -> Result<Option<String>, String> {
        crate::credentials::read_optional(p)
    }
    fn set(&mut self, p: &Profile, value: &str) -> Result<(), String> {
        crate::credentials::set(p, value)
    }
    fn forget(&mut self, p: &Profile) -> Result<(), String> {
        crate::credentials::forget(p)
    }
}
fn collect_encrypted(
    profiles: &[Profile],
    group: Option<&str>,
    credentials: &mut impl CredentialStore,
) -> Result<Contents, String> {
    let selected: Vec<&Profile> = profiles
        .iter()
        .filter(|p| group.is_none_or(|g| p.group == g))
        .collect();
    let transfer = parse(&export_bytes(profiles, group)?)?;
    let mut passwords = Vec::new();
    for (index, p) in selected.iter().enumerate() {
        if p.remember_password && p.auth_method != AuthMethod::Key {
            let password = credentials.read(p)?.ok_or("A saved password is missing. Update or forget it in the connection form, then export again.")?;
            passwords.push(PasswordRecord { index, password });
        }
    }
    let contents = Contents {
        transfer,
        passwords,
    };
    contents.validate()?;
    Ok(contents)
}
fn commit_passwords(
    profiles: &[Profile],
    updates: &[(Profile, &str)],
    credentials: &mut impl CredentialStore,
    persist: impl FnOnce(&[Profile]) -> Result<(), String>,
) -> Result<(), String> {
    // Snapshot all affected accounts before the first write, so denied reads change nothing.
    let snapshots: Vec<(Profile, Option<Zeroizing<String>>)> = updates
        .iter()
        .map(|(p, _)| Ok((p.clone(), credentials.read(p)?.map(Zeroizing::new))))
        .collect::<Result<_, String>>()?;
    let rollback = |credentials: &mut _, count: usize| {
        let mut failed = false;
        for (profile, old) in snapshots[..count].iter().rev() {
            let result = match old {
                Some(value) => CredentialStore::set(credentials, profile, value),
                None => CredentialStore::forget(credentials, profile),
            };
            if result.is_err() {
                failed = true;
            }
        }
        failed
    };
    for (index, (profile, password)) in updates.iter().enumerate() {
        if credentials.set(profile, password).is_err() {
            return Err(if rollback(credentials,index+1) { "Import failed. Some Keychain changes could not be rolled back; review saved passwords before retrying." } else { "Unable to save imported passwords. Keychain changes were rolled back and connections were not imported." }.into());
        }
    }
    if let Err(error) = persist(profiles) {
        return Err(if rollback(credentials, updates.len()) {
            "Could not save connections and some Keychain changes could not be rolled back. Review saved passwords before retrying.".into()
        } else {
            format!("{error}. Imported password changes were rolled back.")
        });
    }
    Ok(())
}
fn apply_secure_import(
    path: &Path,
    contents: &Contents,
    revision: &str,
    policy: DuplicatePolicy,
    credentials: &mut impl CredentialStore,
) -> Result<ImportResult, String> {
    contents.validate()?;
    let old = ssh::read(path)?;
    if serde_json::to_string(&old).map_err(|_| "Unable to read connections.")? != revision {
        return Err("Saved connections changed. Choose the file again to refresh the preview before importing.".into());
    }
    let skip = matches!(policy, DuplicatePolicy::Skip);
    let (mut profiles, added, replaced, skipped) = merge(&old, &contents.transfer, policy)?;
    let mut seen: std::collections::HashSet<_> = old.iter().map(endpoint).collect();
    let mut effective = std::collections::HashMap::new();
    for (index, c) in contents.transfer.connections.iter().enumerate() {
        let key = endpoint(&c.profile());
        if seen.contains(&key) && skip {
            continue;
        }
        seen.insert(key.clone());
        effective.insert(key, index);
    }
    let mut updates = Vec::new();
    for record in &contents.passwords {
        let key = endpoint(&contents.transfer.connections[record.index].profile());
        if effective.get(&key) != Some(&record.index) {
            continue;
        }
        let target = profiles
            .iter_mut()
            .find(|p| endpoint(p) == key)
            .ok_or("Unable to plan password import.")?;
        if target.auth_method == AuthMethod::Key {
            continue;
        }
        target.remember_password = true;
        updates.push((target.clone(), record.password.as_str()));
    }
    commit_passwords(&profiles, &updates, credentials, |p| {
        if added + replaced > 0 {
            ssh::write(path, p)
        } else {
            Ok(())
        }
    })?;
    Ok(ImportResult {
        profiles,
        added,
        replaced,
        skipped,
        passwords_imported: updates.len(),
    })
}
fn export_bytes(profiles: &[Profile], group: Option<&str>) -> Result<Vec<u8>, String> {
    let connections = profiles
        .iter()
        .filter(|p| group.is_none_or(|g| p.group == g))
        .map(Connection::from)
        .collect();
    let transfer = Transfer {
        format: "ultron-connections".into(),
        version: 1,
        connections,
    };
    if transfer.connections.is_empty() {
        return Err("No connections to export.".into());
    }
    serde_json::to_vec_pretty(&transfer).map_err(|_| "Unable to prepare export.".into())
}
fn write_export(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("Choose a destination folder.")?;
    let temp = dir.join(format!(".ultron-export-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temp)
            .map_err(|_| "Unable to create the export file.")?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "Unable to write the export file.")?;
        fs::rename(&temp, path).map_err(|_| "Unable to save the export file.")
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result.map_err(str::to_string)
}
#[tauri::command]
pub async fn export_ssh_connections(
    app: AppHandle,
    store: State<'_, ProfileStore>,
    file_path: String,
    group: Option<String>,
    backup_password: Option<String>,
) -> Result<usize, String> {
    let backup_password = backup_password.map(Zeroizing::new);
    let lock = store.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock.lock().map_err(|_| "Connection storage is busy.")?;
        let store_path = ssh::path(&app)?;
        let destination = Path::new(&file_path);
        if destination == store_path
            || (destination.canonicalize().ok().is_some()
                && destination.canonicalize().ok() == store_path.canonicalize().ok())
        {
            return Err("Choose a destination outside Ultron's connection storage.".into());
        }
        let profiles = ssh::read(&store_path)?;
        let bytes = if let Some(password) = backup_password {
            secure_backup::validate_export_password(&password)?;
            let contents = collect_encrypted(&profiles, group.as_deref(), &mut MacCredentials)?;
            secure_backup::encrypt(&contents, &password)?
        } else {
            export_bytes(&profiles, group.as_deref())?
        };
        let count = profiles
            .iter()
            .filter(|p| group.as_ref().is_none_or(|g| &p.group == g))
            .count();
        write_export(destination, &bytes)?;
        Ok(count)
    })
    .await
    .map_err(|_| "Could not finish export.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn profile(host: &str) -> Profile {
        Profile {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Development".into(),
            group: "Project A".into(),
            host: host.into(),
            port: 22,
            username: "deploy".into(),
            identity_file: "/keys/key with spaces".into(),
            auth_method: AuthMethod::Auto,
            remember_password: true,
        }
    }
    fn file(profiles: &[Profile]) -> Transfer {
        parse(&export_bytes(profiles, None).unwrap()).unwrap()
    }
    #[test]
    fn export_roundtrip_excludes_credentials_and_preserves_portable_settings() {
        let old = profile("dev.example.com");
        let bytes = export_bytes(std::slice::from_ref(&old), None).unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let entry = &json["connections"][0];
        for field in ["id", "rememberPassword", "password", "privateKey"] {
            assert!(entry.get(field).is_none());
        }
        let (imported, added, replaced, skipped) =
            merge(&[], &parse(&bytes).unwrap(), DuplicatePolicy::Skip).unwrap();
        assert_eq!((added, replaced, skipped), (1, 0, 0));
        assert_ne!(old.id, imported[0].id);
        assert!(!imported[0].remember_password);
        assert_eq!(old.identity_file, imported[0].identity_file);
        assert_eq!(old.group, imported[0].group);
        assert_eq!(old.host, imported[0].host);
        assert_eq!(old.auth_method, imported[0].auth_method);
    }
    #[test]
    fn duplicate_policy_is_explicit_and_keeps_stable_ids_and_saved_password_flags() {
        let old = profile("DEV.example.com");
        let mut source = profile("dev.example.com");
        source.name = "Renamed".into();
        source.group = "Production".into();
        let transfer = file(std::slice::from_ref(&source));
        let (skipped, a, r, s) =
            merge(std::slice::from_ref(&old), &transfer, DuplicatePolicy::Skip).unwrap();
        assert_eq!((a, r, s), (0, 0, 1));
        assert_eq!(skipped[0], old);
        let (replaced, a, r, s) = merge(
            std::slice::from_ref(&old),
            &transfer,
            DuplicatePolicy::Replace,
        )
        .unwrap();
        assert_eq!((a, r, s), (0, 1, 0));
        assert_eq!(replaced[0].id, old.id);
        assert_eq!(
            crate::credentials::account(&replaced[0]),
            crate::credentials::account(&old)
        );
        assert!(replaced[0].remember_password);
        assert_eq!(replaced[0].name, "Renamed");
        assert_eq!(replaced[0].group, "Production");
        source.auth_method = AuthMethod::Key;
        let (key, _, _, _) = merge(&[old], &file(&[source]), DuplicatePolicy::Replace).unwrap();
        assert!(!key[0].remember_password);
    }
    #[test]
    fn malformed_unknown_secret_fields_and_oversized_files_are_rejected() {
        let bytes = export_bytes(&[profile("dev.example.com")], None).unwrap();
        let base: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        for field in ["password", "privateKey", "rememberPassword", "id"] {
            let mut invalid = base.clone();
            invalid["connections"][0][field] = serde_json::json!("not-importable");
            assert!(parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        for version in [0, 2] {
            let mut invalid = base.clone();
            invalid["version"] = serde_json::json!(version);
            assert!(parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        for (field, value) in [
            ("host", serde_json::json!("--bad")),
            ("port", serde_json::json!(0)),
            ("username", serde_json::json!("bad user")),
            ("name", serde_json::json!("bad\nname")),
            ("authMethod", serde_json::json!("unsupported")),
        ] {
            let mut invalid = base.clone();
            invalid["connections"][0][field] = value;
            assert!(parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        assert!(parse(b"not json").is_err());
        assert!(parse(&vec![b' '; LIMIT + 1]).is_err());
        let mut bom = vec![0xef, 0xbb, 0xbf];
        bom.extend(bytes);
        assert!(parse(&bom).is_ok());
    }
    #[test]
    fn capacity_and_ambiguous_replacements_fail_before_any_store_mutation() {
        let old: Vec<Profile> = (0..100).map(|i| profile(&format!("host-{i}"))).collect();
        assert!(merge(&old, &file(&[profile("new-host")]), DuplicatePolicy::Skip).is_err());
        assert_eq!(old.len(), 100);
        let a = profile("same-host");
        let b = profile("same-host");
        let transfer = file(&[profile("same-host")]);
        assert!(merge(&[a.clone(), b.clone()], &transfer, DuplicatePolicy::Replace).is_err());
        let (same, _, _, skipped) = merge(&[a, b], &transfer, DuplicatePolicy::Skip).unwrap();
        assert_eq!(same.len(), 2);
        assert_eq!(skipped, 1);
    }
    #[test]
    fn export_folder_and_duplicate_rows_have_predictable_results() {
        let a = profile("same-host");
        let mut b = a.clone();
        b.name = "Other alias".into();
        b.group = "Project B".into();
        let bytes = export_bytes(&[a.clone(), b.clone()], Some("Project B")).unwrap();
        let transfer = parse(&bytes).unwrap();
        assert_eq!(transfer.connections.len(), 1);
        assert_eq!(transfer.connections[0].name, "Other alias");
        let all = file(&[a, b]);
        let (skip, a, r, s) = merge(&[], &all, DuplicatePolicy::Skip).unwrap();
        assert_eq!((skip.len(), a, r, s), (1, 1, 0, 1));
        let (replace, a, r, s) = merge(&[], &all, DuplicatePolicy::Replace).unwrap();
        assert_eq!((replace.len(), a, r, s), (1, 1, 1, 0));
        assert_eq!(replace[0].name, "Other alias");
    }
    #[test]
    fn export_writes_a_complete_private_file_without_temporary_leftovers() {
        let dir = std::env::temp_dir().join(format!("ultron-transfer-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("connections.json");
        let bytes = export_bytes(&[profile("host")], None).unwrap();
        write_export(&path, &bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn persisted_import_is_atomic_and_rejects_a_stale_preview_without_overwriting() {
        let dir = std::env::temp_dir().join(format!("ultron-import-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("profiles.json");
        let old = vec![profile("existing-host")];
        ssh::write(&path, &old).unwrap();
        let revision = serde_json::to_string(&old).unwrap();
        let transfer = file(&[profile("new-host")]);
        let result = apply_import(&path, &transfer, &revision, DuplicatePolicy::Skip).unwrap();
        assert_eq!(result.added, 1);
        assert_eq!(ssh::read(&path).unwrap(), result.profiles);
        let bytes = fs::read(&path).unwrap();
        assert!(apply_import(&path, &transfer, &revision, DuplicatePolicy::Replace).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        let mut invalid = transfer.clone();
        invalid.connections[0].port = 0;
        let current = serde_json::to_string(&result.profiles).unwrap();
        assert!(apply_import(&path, &invalid, &current, DuplicatePolicy::Skip).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_dir_all(dir).unwrap();
    }
    #[derive(Default)]
    struct FakeCredentials {
        values: std::collections::HashMap<String, String>,
        reads: usize,
        writes: usize,
        fail_at: Option<usize>,
        fail_from: Option<usize>,
        deny_reads: bool,
    }
    impl CredentialStore for FakeCredentials {
        fn read(&mut self, p: &Profile) -> Result<Option<String>, String> {
            self.reads += 1;
            if self.deny_reads {
                return Err("Read denied".into());
            }
            Ok(self.values.get(&crate::credentials::account(p)).cloned())
        }
        fn set(&mut self, p: &Profile, value: &str) -> Result<(), String> {
            self.writes += 1;
            self.values
                .insert(crate::credentials::account(p), value.into());
            if self.fail_at == Some(self.writes) || self.fail_from.is_some_and(|n| self.writes >= n)
            {
                return Err("Simulated write failure".into());
            }
            Ok(())
        }
        fn forget(&mut self, p: &Profile) -> Result<(), String> {
            self.values.remove(&crate::credentials::account(p));
            Ok(())
        }
    }
    #[test]
    fn encrypted_export_reads_only_saved_passwords_in_selected_folder() {
        let mut first = profile("host-a");
        first.group = "A".into();
        let mut other = profile("host-b");
        other.group = "B".into();
        let mut unsaved = profile("host-c");
        unsaved.group = "A".into();
        unsaved.remember_password = false;
        let mut store = FakeCredentials::default();
        store.values.insert(
            crate::credentials::account(&first),
            "fixture-password".into(),
        );
        let result = collect_encrypted(&[first, other, unsaved], Some("A"), &mut store).unwrap();
        assert_eq!(store.reads, 1);
        assert_eq!(store.writes, 0);
        assert_eq!(result.passwords.len(), 1);
        assert_eq!(result.transfer.connections.len(), 2);
        assert!(collect_encrypted(&[profile("missing")], None, &mut store).is_err());
    }
    #[test]
    fn failed_keychain_or_profile_writes_restore_all_affected_passwords() {
        let a = profile("a");
        let b = profile("b");
        let mut store = FakeCredentials::default();
        let key = crate::credentials::account(&a);
        store.values.insert(key.clone(), "original".into());
        let original = store.values.clone();
        store.fail_at = Some(2);
        let updates = vec![(a.clone(), "new-a"), (b.clone(), "new-b")];
        assert!(commit_passwords(&[], &updates, &mut store, |_| panic!(
            "must not persist after credential failure"
        ))
        .is_err());
        assert_eq!(store.values, original);
        store.fail_at = None;
        assert!(commit_passwords(&[], &updates, &mut store, |_| Err(
            "Disk write failed".into()
        ))
        .is_err());
        assert_eq!(store.values, original);
        let writes = store.writes;
        store.deny_reads = true;
        assert!(commit_passwords(&[], &updates, &mut store, |_| panic!(
            "must not persist on denied reads"
        ))
        .is_err());
        assert_eq!(store.writes, writes);
        assert_eq!(store.values, original);
    }
    #[test]
    fn encrypted_import_skips_passwords_for_skipped_rows_and_stores_only_approved_entries() {
        let dir =
            std::env::temp_dir().join(format!("ultron-secure-import-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        let path = dir.join("profiles.json");
        let existing = profile("existing");
        let new = profile("new");
        ssh::write(&path, std::slice::from_ref(&existing)).unwrap();
        let contents = Contents {
            transfer: file(&[existing.clone(), new]),
            passwords: vec![
                PasswordRecord {
                    index: 0,
                    password: "replacement".into(),
                },
                PasswordRecord {
                    index: 1,
                    password: "new-password".into(),
                },
            ],
        };
        let mut store = FakeCredentials::default();
        let account = crate::credentials::account(&existing);
        store.values.insert(account.clone(), "original".into());
        let revision = serde_json::to_string(&vec![existing]).unwrap();
        let result = apply_secure_import(
            &path,
            &contents,
            &revision,
            DuplicatePolicy::Skip,
            &mut store,
        )
        .unwrap();
        assert_eq!(result.passwords_imported, 1);
        assert_eq!(result.skipped, 1);
        assert_eq!(store.values[&account], "original");
        let imported = result.profiles.iter().find(|p| p.host == "new").unwrap();
        assert!(imported.remember_password);
        assert_eq!(
            store.values[&crate::credentials::account(imported)],
            "new-password"
        );
        let revision = serde_json::to_string(&result.profiles).unwrap();
        let result = apply_secure_import(
            &path,
            &contents,
            &revision,
            DuplicatePolicy::Replace,
            &mut store,
        )
        .unwrap();
        assert_eq!(result.passwords_imported, 2);
        assert_eq!(store.values[&account], "replacement");
        let writes = store.writes;
        assert!(apply_secure_import(
            &path,
            &contents,
            "stale",
            DuplicatePolicy::Replace,
            &mut store
        )
        .is_err());
        assert_eq!(store.writes, writes);
        let json = fs::read_to_string(&path).unwrap();
        assert!(!json.contains("new-password"));
        assert!(!json.contains("replacement"));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn incomplete_rollback_is_reported_instead_of_claiming_success() {
        let target = profile("rollback-target");
        let mut credentials = FakeCredentials::default();
        credentials
            .values
            .insert(crate::credentials::account(&target), "original".into());
        credentials.fail_from = Some(1);
        let error = commit_passwords(&[], &[(target, "replacement")], &mut credentials, |_| {
            panic!("must not persist on credential failure")
        })
        .unwrap_err();
        assert!(error.contains("could not be rolled back"));
    }
}
