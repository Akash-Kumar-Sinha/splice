use serde::{Deserialize, Serialize};
use splice_media::MediaHash;
use time::OffsetDateTime;

use crate::id::CommitId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Commit {
    pub id: CommitId,
    pub parent: Option<CommitId>,
    #[serde(with = "time::serde::rfc3339")]
    pub timestamp: OffsetDateTime,
    pub author: String,
    pub message: String,
    pub timeline_hash: MediaHash,
    pub media_refs: Vec<MediaHash>,
}

impl Commit {
    pub fn new(
        id: CommitId,
        parent: Option<CommitId>,
        timestamp: OffsetDateTime,
        author: impl Into<String>,
        message: impl Into<String>,
        timeline_hash: MediaHash,
        media_refs: Vec<MediaHash>,
    ) -> Self {
        Self {
            id,
            parent,
            timestamp,
            author: author.into(),
            message: message.into(),
            timeline_hash,
            media_refs,
        }
    }

    pub fn create(
        parent: Option<CommitId>,
        author: impl Into<String>,
        message: impl Into<String>,
        timeline_hash: MediaHash,
        media_refs: Vec<MediaHash>,
    ) -> Self {
        Self::new(
            CommitId::new(),
            parent,
            OffsetDateTime::now_utc(),
            author,
            message,
            timeline_hash,
            media_refs,
        )
    }

    pub fn parent_id(&self) -> Option<CommitId> {
        self.parent
    }
}
