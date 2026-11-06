//! Password-protected backup format v1. Never write decrypted bytes to disk.
use crate::connection_transfer::{self, Transfer};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, Payload},
    KeyInit, XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};
pub const FILE_LIMIT: usize = 4 * 1024 * 1024;
const PAYLOAD_LIMIT: usize = 2 * 1024 * 1024;
const FORMAT: &str = "ultron-encrypted-connections";
const AAD: &[u8] =
    b"Ultron encrypted connections v1;argon2id-v19;m=65536;t=3;p=4;xchacha20poly1305";
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(deny_unknown_fields)]
pub struct PasswordRecord {
    pub index: usize,
    pub password: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Contents {
    pub transfer: Transfer,
    pub passwords: Vec<PasswordRecord>,
}
impl Contents {
    pub fn validate(&self) -> Result<(), String> {
        connection_transfer::validate(&self.transfer)?;
        if self.passwords.len() > self.transfer.connections.len() {
            return Err("Invalid encrypted backup contents.".into());
        }
        let mut seen = HashSet::new();
        for record in &self.passwords {
            if record.index >= self.transfer.connections.len()
                || !seen.insert(record.index)
                || record.password.is_empty()
                || record.password.len() > 8192
                || record.password.contains(['\n', '\r', '\0'])
            {
                return Err("Invalid encrypted backup contents.".into());
            }
            if self.transfer.connections[record.index]
                .profile()
                .auth_method
                == crate::ssh::AuthMethod::Key
            {
                return Err("SSH key passwords are not supported in backups.".into());
            }
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Kdf {
    algorithm: String,
    memory_ki_b: u32,
    iterations: u32,
    parallelism: u32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    version: u32,
    kdf: Kdf,
    cipher: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}
fn envelope(bytes: &[u8]) -> Result<Envelope, String> {
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    if bytes.len() > FILE_LIMIT {
        return Err("Encrypted backup is too large (maximum 4 MB).".into());
    }
    let e: Envelope = serde_json::from_slice(bytes).map_err(|_| "Invalid encrypted backup.")?;
    if e.format != FORMAT
        || e.version != 1
        || e.kdf.algorithm != "argon2id"
        || e.kdf.memory_ki_b != 65536
        || e.kdf.iterations != 3
        || e.kdf.parallelism != 4
        || e.cipher != "xchacha20poly1305"
    {
        return Err("Unsupported encrypted backup format or parameters.".into());
    }
    let salt = STANDARD
        .decode(&e.salt)
        .map_err(|_| "Invalid encrypted backup.")?;
    let nonce = STANDARD
        .decode(&e.nonce)
        .map_err(|_| "Invalid encrypted backup.")?;
    let ciphertext = STANDARD
        .decode(&e.ciphertext)
        .map_err(|_| "Invalid encrypted backup.")?;
    if salt.len() != 16
        || nonce.len() != 24
        || ciphertext.len() < 16
        || ciphertext.len() > PAYLOAD_LIMIT + 16
    {
        return Err("Invalid encrypted backup.".into());
    }
    Ok(e)
}
pub fn is_encrypted(bytes: &[u8]) -> Result<bool, String> {
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    if bytes.len() > FILE_LIMIT {
        return Err("Backup file is too large (maximum 4 MB).".into());
    }
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| "Invalid JSON backup file.")?;
    if value.get("format").and_then(|v| v.as_str()) == Some(FORMAT) {
        envelope(bytes)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
pub fn validate_export_password(password: &str) -> Result<(), String> {
    if password.chars().count() < 12 || password.len() > 1024 || password.trim().is_empty() {
        return Err(
            "Use a backup password with at least 12 characters (maximum 1024 bytes).".into(),
        );
    }
    Ok(())
}
fn key(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    if password.is_empty() || password.len() > 1024 {
        return Err("Enter the backup password.".into());
    }
    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|_| "Unable to initialize backup encryption.")?;
    let mut key = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, &mut key[..])
        .map_err(|_| "Unable to derive backup encryption key.")?;
    Ok(key)
}
pub fn encrypt(contents: &Contents, password: &str) -> Result<Vec<u8>, String> {
    validate_export_password(password)?;
    contents.validate()?;
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 24];
    getrandom::getrandom(&mut salt)
        .and_then(|_| getrandom::getrandom(&mut nonce))
        .map_err(|_| "Unable to generate secure backup randomness.")?;
    let key = key(password, &salt)?;
    let plain = Zeroizing::new(
        serde_json::to_vec(contents).map_err(|_| "Unable to prepare encrypted backup.")?,
    );
    if plain.len() > PAYLOAD_LIMIT {
        return Err("Backup contents are too large.".into());
    }
    let cipher = XChaCha20Poly1305::new_from_slice(&key[..])
        .map_err(|_| "Unable to initialize backup encryption.")?;
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: &plain,
                aad: AAD,
            },
        )
        .map_err(|_| "Unable to encrypt backup.")?;
    serde_json::to_vec_pretty(&Envelope {
        format: FORMAT.into(),
        version: 1,
        kdf: Kdf {
            algorithm: "argon2id".into(),
            memory_ki_b: 65536,
            iterations: 3,
            parallelism: 4,
        },
        cipher: "xchacha20poly1305".into(),
        salt: STANDARD.encode(salt),
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(ciphertext),
    })
    .map_err(|_| "Unable to encode encrypted backup.".into())
}
pub fn decrypt(bytes: &[u8], password: &str) -> Result<Contents, String> {
    let e = envelope(bytes)?;
    let salt = STANDARD
        .decode(e.salt)
        .map_err(|_| "Invalid encrypted backup.")?;
    let nonce = STANDARD
        .decode(e.nonce)
        .map_err(|_| "Invalid encrypted backup.")?;
    let ciphertext = STANDARD
        .decode(e.ciphertext)
        .map_err(|_| "Invalid encrypted backup.")?;
    let key = key(password, &salt)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key[..])
        .map_err(|_| "Unable to initialize backup encryption.")?;
    let plain = Zeroizing::new(
        cipher
            .decrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: AAD,
                },
            )
            .map_err(|_| {
                "Unable to unlock backup. The password is incorrect or the file has been changed."
                    .to_string()
            })?,
    );
    let contents: Contents =
        serde_json::from_slice(&plain).map_err(|_| "Invalid encrypted backup contents.")?;
    contents.validate()?;
    Ok(contents)
}
pub fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    const PASS: &str = "fixture-long-backup-passphrase";
    fn contents() -> Contents {
        Contents { transfer:connection_transfer::parse(br#"{"format":"ultron-connections","version":1,"connections":[{"name":"Fixture server","host":"fixture.example","port":22,"username":"fixture","group":"Test","authMethod":"password"}]}"#).unwrap(), passwords:vec![PasswordRecord {index:0,password:"fixture-secret-never-in-export-plaintext".into()}] }
    }
    #[test]
    fn authenticated_encryption_roundtrip_randomness_wrong_password_and_tampering() {
        let contents = contents();
        let first = encrypt(&contents, PASS).unwrap();
        let second = encrypt(&contents, PASS).unwrap();
        assert_ne!(first, second);
        assert!(is_encrypted(&first).unwrap());
        let encoded = std::str::from_utf8(&first).unwrap();
        for hidden in [
            "Fixture server",
            "fixture.example",
            "fixture-secret-never-in-export-plaintext",
            PASS,
        ] {
            assert!(!encoded.contains(hidden));
        }
        let restored = decrypt(&first, PASS).unwrap();
        assert_eq!(
            restored.passwords[0].password,
            contents.passwords[0].password
        );
        assert_eq!(
            restored.transfer.connections[0].profile().host,
            "fixture.example"
        );
        assert!(decrypt(&first, "incorrect-backup-password").is_err());
        let mut envelope: serde_json::Value = serde_json::from_slice(&first).unwrap();
        let mut ciphertext = STANDARD
            .decode(envelope["ciphertext"].as_str().unwrap())
            .unwrap();
        ciphertext[0] ^= 1;
        envelope["ciphertext"] = STANDARD.encode(ciphertext).into();
        assert!(decrypt(&serde_json::to_vec(&envelope).unwrap(), PASS).is_err());
        for (field, value) in [
            ("version", serde_json::json!(2)),
            ("cipher", serde_json::json!("unknown")),
            ("nonce", serde_json::json!("short")),
            ("salt", serde_json::json!("short")),
        ] {
            let mut invalid: serde_json::Value = serde_json::from_slice(&first).unwrap();
            invalid[field] = value;
            assert!(is_encrypted(&serde_json::to_vec(&invalid).unwrap()).is_err());
        }
        let mut invalid: serde_json::Value = serde_json::from_slice(&first).unwrap();
        invalid["kdf"]["memoryKiB"] = serde_json::json!(u32::MAX);
        assert!(decrypt(&serde_json::to_vec(&invalid).unwrap(), PASS).is_err());
    }
    #[test]
    fn rejects_short_passwords_and_invalid_secret_records_before_crypto() {
        for weak in ["", "123456", "           "] {
            assert!(validate_export_password(weak).is_err());
        }
        assert!(validate_export_password(&"a".repeat(1025)).is_err());
        assert!(validate_export_password(PASS).is_ok());
        let mut payload = contents();
        payload.passwords.push(PasswordRecord {
            index: 0,
            password: "duplicate".into(),
        });
        assert!(payload.validate().is_err());
        payload.passwords.pop();
        payload.passwords[0].index = 99;
        assert!(payload.validate().is_err());
        payload.passwords[0].index = 0;
        payload.passwords[0].password = "bad\npassword".into();
        assert!(payload.validate().is_err());
        assert!(is_encrypted(&vec![b' '; FILE_LIMIT + 1]).is_err());
        assert!(
            !is_encrypted(br#"{"format":"ultron-connections","version":1,"connections":[]}"#)
                .unwrap()
        );
    }
}
