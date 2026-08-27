use std::fmt;
use std::io::Read;
use std::str::FromStr;

use crate::ParseMediaHashError;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct MediaHash(pub [u8; 32]);

impl MediaHash {
    pub const fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    pub fn compute(data: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(data);
        Self(hasher.finalize().into())
    }

    pub fn from_reader<R: Read>(mut reader: R) -> Result<Self, std::io::Error> {
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = reader.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            hasher.update(&buffer[..count]);
        }
        Ok(Self(hasher.finalize().into()))
    }

    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    pub const fn into_bytes(self) -> [u8; 32] {
        self.0
    }

    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }

    // INFO: Git-style 2-character hex prefix derived from the first byte of SHA-256
    pub fn prefix(&self) -> String {
        hex::encode(&self.0[..1])
    }

    pub fn from_hex(s: &str) -> Result<Self, ParseMediaHashError> {
        if s.len() != 64 {
            return Err(ParseMediaHashError::InvalidLength(s.len()));
        }
        let mut bytes = [0u8; 32];
        hex::decode_to_slice(s, &mut bytes).map_err(|_| ParseMediaHashError::InvalidHex)?;
        Ok(Self(bytes))
    }
}

impl fmt::Display for MediaHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_hex())
    }
}

impl fmt::Debug for MediaHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "MediaHash({})", self.to_hex())
    }
}

impl FromStr for MediaHash {
    type Err = ParseMediaHashError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_hex(s)
    }
}

impl From<[u8; 32]> for MediaHash {
    fn from(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
}

impl From<MediaHash> for [u8; 32] {
    fn from(hash: MediaHash) -> Self {
        hash.0
    }
}

impl AsRef<[u8]> for MediaHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

impl AsRef<[u8; 32]> for MediaHash {
    fn as_ref(&self) -> &[u8; 32] {
        &self.0
    }
}

impl Serialize for MediaHash {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for MediaHash {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct MediaHashVisitor;

        impl serde::de::Visitor<'_> for MediaHashVisitor {
            type Value = MediaHash;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a 64-character hexadecimal SHA-256 string")
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                MediaHash::from_hex(v).map_err(serde::de::Error::custom)
            }
        }

        deserializer.deserialize_str(MediaHashVisitor)
    }
}
