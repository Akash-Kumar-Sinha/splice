use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct CommitId(pub Uuid);

impl CommitId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub const fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }

    pub const fn as_uuid(&self) -> &Uuid {
        &self.0
    }

    pub const fn into_uuid(self) -> Uuid {
        self.0
    }

    pub const fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(Uuid::from_bytes(bytes))
    }

    pub const fn as_bytes(&self) -> &[u8; 16] {
        self.0.as_bytes()
    }

    pub const fn from_u128(v: u128) -> Self {
        Self(Uuid::from_u128(v))
    }

    pub const fn as_u128(&self) -> u128 {
        self.0.as_u128()
    }
}

impl Default for CommitId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for CommitId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl fmt::Debug for CommitId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "CommitId({})", self.0)
    }
}

impl FromStr for CommitId {
    type Err = uuid::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Uuid::parse_str(s).map(Self)
    }
}

impl From<Uuid> for CommitId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl From<CommitId> for Uuid {
    fn from(id: CommitId) -> Self {
        id.0
    }
}

impl AsRef<Uuid> for CommitId {
    fn as_ref(&self) -> &Uuid {
        &self.0
    }
}
