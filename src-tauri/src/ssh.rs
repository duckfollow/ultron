use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct ProfileStore(pub Mutex<()>);
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    #[default]
    Auto,
    Password,
    Key,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub identity_file: String,
    #[serde(default)]
    pub auth_method: AuthMethod,
}
impl Profile {
    pub fn validate(&self) -> Result<(), String> {
        if !self.id.is_empty() && uuid::Uuid::parse_str(&self.id).is_err() {
            return Err("Invalid connection ID".into());
        }
        if self.name.trim().is_empty()
            || self.name.chars().count() > 80
            || self.name.chars().any(char::is_control)
        {
            return Err("Enter a connection name (up to 80 characters)".into());
        }
        if self.host.is_empty()
            || self.host.len() > 253
            || self.host.starts_with('-')
            || !self
                .host
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-_:".contains(&b))
        {
            return Err(
                "Enter a hostname, SSH alias, or IP address without spaces or a URL prefix".into(),
            );
        }
        if self.port == 0 {
            return Err("Port must be between 1 and 65535".into());
        }
        if self.username.is_empty()
            || self.username.len() > 128
            || self.username.starts_with('-')
            || !self
                .username
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        {
            return Err(
                "Enter a username using letters, numbers, dots, underscores or hyphens".into(),
            );
        }
        if self.identity_file.len() > 4096 || self.identity_file.chars().any(char::is_control) {
            return Err("Invalid SSH key path".into());
        }
        if self.auth_method == AuthMethod::Key && self.identity_file.is_empty() {
            return Err("Choose an SSH private key for key authentication".into());
        }
        if self.auth_method != AuthMethod::Password
            && !self.identity_file.is_empty()
            && !self.identity_file.starts_with('/')
            && !self.identity_file.starts_with("~/")
        {
            return Err("Choose an absolute SSH key path or a path starting with ~/".into());
        }
        Ok(())
    }
}
pub fn arguments(profile: &Profile, home: &Path) -> Result<Vec<String>, String> {
    profile.validate()?;
    let mut args = vec![
        "-tt".into(),
        "-p".into(),
        profile.port.to_string(),
        "-l".into(),
        profile.username.clone(),
        "-o".into(),
        "StrictHostKeyChecking=ask".into(),
        "-o".into(),
        "ForwardAgent=no".into(),
        "-o".into(),
        "PermitLocalCommand=no".into(),
        "-o".into(),
        "ConnectTimeout=15".into(),
        "-o".into(),
        "ConnectionAttempts=1".into(),
    ];
    let settings: &[&str] = match profile.auth_method {
        AuthMethod::Auto => &[
            "PreferredAuthentications=publickey,keyboard-interactive,password",
            "PubkeyAuthentication=yes",
            "PasswordAuthentication=yes",
            "KbdInteractiveAuthentication=yes",
        ],
        AuthMethod::Password => &[
            "PreferredAuthentications=keyboard-interactive,password",
            "PubkeyAuthentication=no",
            "PasswordAuthentication=yes",
            "KbdInteractiveAuthentication=yes",
        ],
        AuthMethod::Key => &[
            "PreferredAuthentications=publickey",
            "PubkeyAuthentication=yes",
            "PasswordAuthentication=no",
            "KbdInteractiveAuthentication=no",
        ],
    };
    for setting in
        settings
            .iter()
            .copied()
            .chain(["BatchMode=no", "ControlMaster=no", "ControlPath=none"])
    {
        args.extend(["-o".into(), setting.into()]);
    }
    if profile.auth_method != AuthMethod::Password && !profile.identity_file.is_empty() {
        let path = profile
            .identity_file
            .strip_prefix("~/")
            .map(|tail| home.join(tail))
            .unwrap_or_else(|| PathBuf::from(&profile.identity_file));
        if !path.is_file() {
            return Err(
                "SSH key file was not found. Edit this connection to select it again.".into(),
            );
        }
        args.extend([
            "-i".into(),
            path.to_string_lossy().replace('%', "%%"),
            "-o".into(),
            "IdentitiesOnly=yes".into(),
        ]);
    }
    args.push("--".into());
    args.push(profile.host.clone());
    Ok(args)
}
fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("ssh-profiles.json"))
}
pub fn read(path: &Path) -> Result<Vec<Profile>, String> {
    if !path.exists() {
        return Ok(vec![]);
    }
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 1024 * 1024 {
        return Err("SSH profiles file is too large".into());
    }
    let profiles: Vec<Profile> =
        serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Unable to read SSH profiles: {e}"))?;
    if profiles.len() > 100 {
        return Err("Too many SSH profiles".into());
    }
    let mut ids = std::collections::HashSet::new();
    for profile in &profiles {
        profile.validate()?;
        if profile.id.is_empty() || !ids.insert(&profile.id) {
            return Err("SSH profiles contain duplicate or missing IDs".into());
        }
    }
    Ok(profiles)
}
fn write(path: &Path, profiles: &[Profile]) -> Result<(), String> {
    let dir = path.parent().ok_or("Invalid profiles directory")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temporary = dir.join(format!("ssh-profiles-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(profiles).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
fn save(path: &Path, mut profile: Profile) -> Result<Vec<Profile>, String> {
    profile.name = profile.name.trim().into();
    profile.validate()?;
    let mut profiles = read(path)?;
    if profile.id.is_empty() {
        if profiles.len() >= 100 {
            return Err("You can save up to 100 SSH connections".into());
        }
        profile.id = uuid::Uuid::new_v4().to_string();
        profiles.push(profile);
    } else {
        let old = profiles
            .iter_mut()
            .find(|p| p.id == profile.id)
            .ok_or("Connection no longer exists. Reload the app before saving.")?;
        *old = profile;
    }
    write(path, &profiles)?;
    Ok(profiles)
}
#[tauri::command]
pub fn list_ssh_profiles(
    app: AppHandle,
    store: State<'_, ProfileStore>,
) -> Result<Vec<Profile>, String> {
    let _guard = store.0.lock().unwrap();
    read(&path(&app)?)
}
#[tauri::command]
pub fn save_ssh_profile(
    app: AppHandle,
    store: State<'_, ProfileStore>,
    profile: Profile,
) -> Result<Vec<Profile>, String> {
    let _guard = store.0.lock().unwrap();
    save(&path(&app)?, profile)
}
#[tauri::command]
pub fn delete_ssh_profile(
    app: AppHandle,
    store: State<'_, ProfileStore>,
    id: String,
) -> Result<Vec<Profile>, String> {
    let _guard = store.0.lock().unwrap();
    let path = path(&app)?;
    let mut profiles = read(&path)?;
    profiles.retain(|p| p.id != id);
    write(&path, &profiles)?;
    Ok(profiles)
}
pub fn get(app: &AppHandle, store: &ProfileStore, id: &str) -> Result<Profile, String> {
    let _guard = store.0.lock().unwrap();
    read(&path(app)?)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "SSH connection no longer exists".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn profile() -> Profile {
        Profile {
            id: String::new(),
            name: "Development".into(),
            host: "127.0.0.1".into(),
            port: 2222,
            username: "tester".into(),
            identity_file: String::new(),
            auth_method: AuthMethod::Auto,
        }
    }
    #[test]
    fn ssh_profiles_roundtrip_update_and_fail_closed_on_corruption() {
        let dir = std::env::temp_dir().join(format!("ultron-profiles-{}", uuid::Uuid::new_v4()));
        let path = dir.join("ssh-profiles.json");
        assert!(read(&path).unwrap().is_empty());
        let saved = save(&path, profile()).unwrap();
        assert_eq!(saved.len(), 1);
        let mut edited = saved[0].clone();
        edited.name = "Renamed".into();
        edited.auth_method = AuthMethod::Password;
        let updated = save(&path, edited).unwrap();
        assert_eq!(updated[0].name, "Renamed");
        assert_eq!(read(&path).unwrap()[0].auth_method, AuthMethod::Password);
        assert_eq!(updated[0].id, saved[0].id);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let bytes = fs::read_to_string(&path).unwrap();
        let stored: serde_json::Value = serde_json::from_str(&bytes).unwrap();
        assert!(stored[0].get("password").is_none());
        assert!(stored[0].get("passphrase").is_none());
        fs::write(&path, "invalid").unwrap();
        assert!(save(&path, profile()).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "invalid");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn authentication_modes_are_saved_and_legacy_profiles_default_to_auto() {
        let mut legacy = serde_json::to_value(profile()).unwrap();
        legacy.as_object_mut().unwrap().remove("authMethod");
        let parsed: Profile = serde_json::from_value(legacy).unwrap();
        assert_eq!(parsed.auth_method, AuthMethod::Auto);
        let mut password = profile();
        password.auth_method = AuthMethod::Password;
        password.identity_file = "/missing/ignored-key".into();
        let args = arguments(&password, Path::new("/")).unwrap();
        assert!(args.contains(&"PubkeyAuthentication=no".into()));
        assert!(!args.contains(&"-i".into()));
        let saved = serde_json::to_value(&password).unwrap();
        assert_eq!(saved["authMethod"], "password");
        assert!(saved.get("password").is_none());
        let mut key = profile();
        key.auth_method = AuthMethod::Key;
        assert!(arguments(&key, Path::new("/")).is_err());
        key.identity_file = "/missing/key".into();
        assert!(arguments(&key, Path::new("/")).is_err());
    }
    #[test]
    fn ssh_uses_separate_arguments_and_keeps_host_verification() {
        let p = profile();
        let args = arguments(&p, Path::new("/")).unwrap();
        assert_eq!(&args[args.len() - 2..], ["--", "127.0.0.1"]);
        assert!(args.contains(&"StrictHostKeyChecking=ask".into()));
        for host in [
            "-oProxyCommand=bad",
            "host; touch /tmp/bad",
            "user@host",
            "ssh://host",
            "host\nother",
        ] {
            let mut bad = p.clone();
            bad.host = host.into();
            assert!(arguments(&bad, Path::new("/")).is_err());
        }
        let mut ipv6 = p.clone();
        ipv6.host = "::1".into();
        assert!(arguments(&ipv6, Path::new("/")).is_ok());
        let mut bad = p.clone();
        bad.username = "user$(bad)".into();
        assert!(bad.validate().is_err());
    }
    #[test]
    fn key_paths_are_literal_and_missing_keys_do_not_fall_back() {
        let dir = std::env::temp_dir().join(format!("ultron-key-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("key with space;literal%");
        fs::write(&path, "test-only-not-a-key").unwrap();
        let mut p = profile();
        p.identity_file = path.to_string_lossy().into();
        let args = arguments(&p, &dir).unwrap();
        let index = args.iter().position(|a| a == "-i").unwrap();
        assert_eq!(args[index + 1], p.identity_file.replace('%', "%%"));
        p.identity_file = dir.join("missing").to_string_lossy().into();
        assert!(arguments(&p, &dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    #[ignore = "requires isolated SSH fixture; run npm run test:ssh"]
    fn ssh_real_local_fixture() {
        use std::io::Read;
        use std::time::Duration;
        let dir = PathBuf::from(std::env::var("ULTRON_TEST_SSH_DIR").unwrap());
        let mut base = profile();
        base.username = "ultron-test".into();
        base.port = std::env::var("ULTRON_TEST_SSH_PORT")
            .unwrap()
            .parse()
            .unwrap();
        base.identity_file = dir.join("client").to_string_lossy().into();
        let fixture_args = |profile: &Profile, hosts: &str| {
            let mut args = vec![
                "-F".into(),
                "/dev/null".into(),
                "-o".into(),
                format!("UserKnownHostsFile={}", dir.join(hosts).display()),
                "-o".into(),
                "GlobalKnownHostsFile=/dev/null".into(),
            ];
            args.extend(arguments(profile, &dir).unwrap());
            args
        };
        let connect = |profile: &Profile| {
            let pair = portable_pty::native_pty_system()
                .openpty(portable_pty::PtySize {
                    rows: 24,
                    cols: 80,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .unwrap();
            let mut command = portable_pty::CommandBuilder::new("/usr/bin/ssh");
            command.args(fixture_args(profile, "known_hosts"));
            command.env("TERM", "xterm-256color");
            let mut child = pair.slave.spawn_command(command).unwrap();
            drop(pair.slave);
            let mut reader = pair.master.try_clone_reader().unwrap();
            let mut writer = pair.master.take_writer().unwrap();
            let mut killer = child.clone_killer();
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                if rx.recv_timeout(Duration::from_secs(15)).is_err() {
                    let _ = killer.kill();
                }
            });
            let mut output = Vec::new();
            let mut bytes = [0; 4096];
            let mut sent_password = false;
            let mut sent_command = false;
            loop {
                match reader.read(&mut bytes) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        output.extend_from_slice(&bytes[..n]);
                        let text = String::from_utf8_lossy(&output);
                        if !sent_password && text.to_ascii_lowercase().contains("password:") {
                            assert_ne!(
                                profile.auth_method,
                                AuthMethod::Key,
                                "Key mode must not ask for a login password"
                            );
                            writer.write_all(b"ultron-fixture-password\n").unwrap();
                            writer.flush().unwrap();
                            sent_password = true;
                        }
                        if !sent_command && text.contains("ULTRON_SSH_READY") {
                            writer.write_all(b"ultron-ping\nexit\n").unwrap();
                            writer.flush().unwrap();
                            sent_command = true;
                        }
                    }
                }
            }
            let status = child.wait().unwrap();
            let _ = tx.send(());
            let text = String::from_utf8_lossy(&output).into_owned();
            assert!(
                !text.contains("ultron-fixture-password"),
                "Passwords must not echo into scrollback"
            );
            (status.success(), text)
        };
        for (mode, user, expected) in [
            (AuthMethod::Auto, "ultron-test", "publickey"),
            (AuthMethod::Key, "ultron-test", "publickey"),
            (AuthMethod::Password, "ultron-test", "password"),
            (AuthMethod::Auto, "ultron-password", "password"),
            (
                AuthMethod::Password,
                "ultron-interactive",
                "keyboard-interactive",
            ),
        ] {
            let mut profile = base.clone();
            profile.auth_method = mode.clone();
            profile.username = user.into();
            if mode == AuthMethod::Password {
                profile.identity_file = "/missing/ignored-key".into();
            }
            let (success, text) = connect(&profile);
            assert!(success, "{mode:?}: {text}");
            assert!(text.contains("ULTRON_SSH_PONG"), "{text}");
            assert!(text.contains(&format!("AUTH={expected}")), "{text}");
        }
        let mut key_only = base.clone();
        key_only.auth_method = AuthMethod::Key;
        key_only.username = "ultron-password".into();
        let (success, text) = connect(&key_only);
        assert!(!success);
        assert!(!text.to_ascii_lowercase().contains("password:"));
        let rejected = std::process::Command::new("/usr/bin/ssh")
            .args(fixture_args(&base, "wrong_hosts"))
            .output()
            .unwrap();
        assert!(!rejected.status.success());
        assert!(String::from_utf8_lossy(&rejected.stderr)
            .contains("REMOTE HOST IDENTIFICATION HAS CHANGED"));
    }
}
