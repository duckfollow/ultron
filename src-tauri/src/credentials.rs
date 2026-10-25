//! Secrets live in Keychain. Askpass responses go only to OpenSSH's private pipe.
use crate::ssh::Profile;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
const SERVICE: &str = "com.duckfollow.ultron.ssh";
pub fn account(profile: &Profile) -> String {
    serde_json::to_string(&(&profile.id, &profile.host, profile.port, &profile.username)).unwrap()
}
fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|_| "Unable to access macOS Keychain".into())
}
pub fn set(profile: &Profile, password: &str) -> Result<(), String> {
    if password.is_empty() || password.len() > 8192 || password.contains(['\n', '\r', '\0']) {
        return Err("Enter a valid password".into());
    }
    entry(&account(profile))?
        .set_password(password)
        .map_err(|_| "Unable to save the password in macOS Keychain".into())
}
pub fn forget(profile: &Profile) -> Result<(), String> {
    forget_account(&account(profile))
}
fn forget_account(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Unable to remove the password from macOS Keychain".into()),
    }
}
pub fn has(profile: &Profile) -> Result<bool, String> {
    match entry(&account(profile))?.get_password() {
        Ok(value) => Ok(!value.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("Unable to access the saved password in macOS Keychain".into()),
    }
}
fn prompt_matches(prompt: &str, expected: &str, hint: &str) -> bool {
    hint != "confirm" && prompt.trim() == expected && !expected.is_empty()
}
pub struct Askpass {
    directory: PathBuf,
    executable: PathBuf,
    account: String,
    prompt: String,
    tty: PathBuf,
}
impl Askpass {
    pub fn prepare(profile: &Profile, executable: &Path, tty: &Path) -> Result<Self, String> {
        let directory =
            std::env::temp_dir().join(format!("ultron-askpass-{}", uuid::Uuid::new_v4()));
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder
            .create(&directory)
            .map_err(|_| "Unable to prepare SSH authentication".to_string())?;
        Ok(Self {
            directory,
            executable: executable.into(),
            tty: tty.into(),
            account: account(profile),
            prompt: format!("{}@{}'s password:", profile.username, profile.host),
        })
    }
    pub fn cancel(&self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
    pub fn apply(&self, command: &mut portable_pty::CommandBuilder) {
        command.env("SSH_ASKPASS", &self.executable);
        command.env("SSH_ASKPASS_REQUIRE", "force");
        command.env("ULTRON_ASKPASS_HELPER", "1");
        command.env("ULTRON_ASKPASS_TTY", &self.tty);
        command.env("ULTRON_ASKPASS_ACCOUNT", &self.account);
        command.env("ULTRON_ASKPASS_PASSWORD_PROMPT", &self.prompt);
        command.env("ULTRON_ASKPASS_DIRECTORY", &self.directory);
    }
}
impl Drop for Askpass {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}
#[cfg(unix)]
fn read_tty(prompt: &str, confirm: bool) -> Result<String, ()> {
    use std::os::fd::AsRawFd;
    let mut tty = OpenOptions::new()
        .read(true)
        .write(true)
        .open(std::env::var("ULTRON_ASKPASS_TTY").unwrap_or_else(|_| "/dev/tty".into()))
        .map_err(|_| ())?;
    let fd = tty.as_raw_fd();
    let mut original = std::mem::MaybeUninit::<libc::termios>::uninit();
    if unsafe { libc::tcgetattr(fd, original.as_mut_ptr()) } != 0 {
        return Err(());
    }
    let original = unsafe { original.assume_init() };
    struct Restore(i32, libc::termios);
    impl Drop for Restore {
        fn drop(&mut self) {
            unsafe {
                libc::tcsetattr(self.0, libc::TCSANOW, &self.1);
            }
        }
    }
    let _restore = Restore(fd, original);
    // Askpass is detached from its controlling tty. Poll its private tty handle
    // so closing a pane cancels the helper instead of leaving an orphan reader.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(());
    }
    let mut mode = original;
    mode.c_lflag |= libc::ICANON | libc::ISIG;
    mode.c_iflag |= libc::ICRNL;
    if confirm {
        mode.c_lflag |= libc::ECHO;
    } else {
        mode.c_lflag &= !(libc::ECHO | libc::ECHONL);
    }
    if unsafe { libc::tcsetattr(fd, libc::TCSANOW, &mode) } != 0 {
        return Err(());
    }
    tty.write_all(prompt.as_bytes()).map_err(|_| ())?;
    tty.flush().map_err(|_| ())?;
    let mut answer = Vec::new();
    let mut byte = [0];
    loop {
        if !helper_active() {
            return Err(());
        }
        match tty.read(&mut byte) {
            Err(error)
                if error.kind() == std::io::ErrorKind::WouldBlock
                    || error.kind() == std::io::ErrorKind::Interrupted =>
            {
                std::thread::sleep(std::time::Duration::from_millis(20));
                continue;
            }
            Ok(0) | Err(_) => return Err(()),
            Ok(_) => {
                if byte[0] == b'\n' || byte[0] == b'\r' {
                    break;
                }
                if answer.len() >= 8192 {
                    return Err(());
                }
                answer.push(byte[0]);
            }
        }
    }
    if !confirm {
        let _ = tty.write_all(b"\r\n");
    }
    String::from_utf8(answer).map_err(|_| ())
}
#[cfg(not(unix))]
fn read_tty(_prompt: &str, _confirm: bool) -> Result<String, ()> {
    Err(())
}
fn helper_active() -> bool {
    std::env::var_os("ULTRON_ASKPASS_DIRECTORY").is_some_and(|dir| PathBuf::from(dir).is_dir())
}
pub fn run_askpass() -> i32 {
    let prompt = std::env::args().nth(1).unwrap_or_default();
    let expected = std::env::var("ULTRON_ASKPASS_PASSWORD_PROMPT").unwrap_or_default();
    let hint = std::env::var("SSH_ASKPASS_PROMPT").unwrap_or_default();
    if prompt_matches(&prompt, &expected, &hint) {
        if let (Ok(account), Ok(directory)) = (
            std::env::var("ULTRON_ASKPASS_ACCOUNT"),
            std::env::var("ULTRON_ASKPASS_DIRECTORY"),
        ) {
            let marker = PathBuf::from(directory).join("attempted");
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            match options.open(&marker) {
                Ok(_) => {
                    if let Ok(password) = entry(&account).and_then(|entry| {
                        entry
                            .get_password()
                            .map_err(|_| "Keychain unavailable".into())
                    }) {
                        if !helper_active() {
                            return 1;
                        }
                        if !password.is_empty() && !password.contains(['\n', '\r', '\0']) {
                            let _ = fs::write(marker.with_file_name("used"), b"1");
                            return if writeln!(std::io::stdout(), "{password}").is_ok() {
                                0
                            } else {
                                1
                            };
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    if marker.with_file_name("used").exists() {
                        let _ = forget_account(&account);
                        let _ = fs::remove_file(marker.with_file_name("used"));
                    }
                }
                Err(_) => {}
            }
        }
    }
    // OTP / passphrase / host confirmation are never looked up or saved.
    match read_tty(&prompt, hint == "confirm") {
        Ok(answer) => {
            if writeln!(std::io::stdout(), "{answer}").is_ok() {
                0
            } else {
                1
            }
        }
        Err(()) => 1,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_exact_login_password_prompts_can_use_keychain() {
        let expected = "dev@127.0.0.1's password:";
        assert!(prompt_matches("dev@127.0.0.1's password: ", expected, ""));
        for prompt in [
            "Password:",
            "Verification code:",
            "OTP:",
            "Enter passphrase for key '/test':",
            "other@127.0.0.1's password:",
        ] {
            assert!(!prompt_matches(prompt, expected, ""));
        }
        assert!(!prompt_matches(expected, expected, "confirm"));
    }
}
