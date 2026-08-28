use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::CommitId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    pub updated_at: OffsetDateTime,
    pub head_commit_id: Option<CommitId>,
}

impl Repository {
    pub fn new(id: impl Into<String>, name: impl Into<String>, description: Option<String>) -> Self {
        let now = OffsetDateTime::now_utc();
        Self {
            id: id.into(),
            name: name.into(),
            description,
            created_at: now,
            updated_at: now,
            head_commit_id: None,
        }
    }
}
