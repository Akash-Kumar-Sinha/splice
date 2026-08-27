use thiserror::Error;

use crate::id::CommitId;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("Commit not found: {0}")]
    CommitNotFound(CommitId),

    #[error("Parent commit not found: {0}")]
    ParentNotFound(CommitId),

    #[error("Duplicate commit: {0}")]
    DuplicateCommit(CommitId),

    #[error("Invalid media hash: {0}")]
    InvalidHash(String),

    #[error("Media hash parsing error: {0}")]
    MediaHash(#[from] splice_media::ParseMediaHashError),

    #[error("Cycle detected in commit chain at {0}")]
    CycleDetected(CommitId),

    #[error("SQLite database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Time formatting/parsing error: {0}")]
    Time(String),

    #[error("Media store error: {0}")]
    Media(#[from] splice_media::StoreError),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Store lock poisoned")]
    LockPoisoned,
}
