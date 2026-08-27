use splice_commit::{CommitId, StoreError};
use splice_media::MediaHash;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SyncError {
    #[error("Object store error: {0}")]
    ObjectStore(#[from] object_store::Error),

    #[error("Commit store error: {0}")]
    CommitStore(#[from] StoreError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Commit not found: {0}")]
    CommitNotFound(CommitId),

    #[error("Media not found: {0}")]
    MediaNotFound(MediaHash),

    #[error("Network / Offline error: {0}")]
    Network(String),

    #[error("Sync lock poisoned")]
    LockPoisoned,
}
