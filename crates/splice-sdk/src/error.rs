use splice_adapter::SerializeError;
use splice_commit::{CommitId, StoreError};
use splice_gc::GcError;
use splice_media::{ParseMediaHashError, StoreError as MediaStoreError};
use splice_render::RenderError;
use splice_sync::SyncError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SpliceError {
    #[error("Commit store error: {0}")]
    Store(#[from] StoreError),

    #[error("Media store error: {0}")]
    Media(#[from] MediaStoreError),

    #[error("Media hash parse error: {0}")]
    MediaHashParse(#[from] ParseMediaHashError),

    #[error("Render error: {0}")]
    Render(#[from] RenderError),

    #[error("Sync error: {0}")]
    Sync(#[from] SyncError),

    #[error("Garbage collection error: {0}")]
    Gc(#[from] GcError),

    #[error("Serialization adapter error: {0}")]
    Serialize(#[from] SerializeError),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Commit not found: {0}")]
    CommitNotFound(CommitId),

    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),

    #[error("No HEAD commit found in repository")]
    NoHead,

    #[error("Export failed: {0}")]
    ExportFailed(String),

    #[error("Sync is not configured on this instance")]
    SyncNotConfigured,
}
