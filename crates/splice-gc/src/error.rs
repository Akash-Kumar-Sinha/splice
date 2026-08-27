use thiserror::Error;

#[derive(Error, Debug)]
pub enum GcError {
    #[error("Commit store error: {0}")]
    CommitStore(#[from] splice_commit::StoreError),

    #[error("Media store error: {0}")]
    MediaStore(#[from] splice_media::StoreError),

    #[error("GC internal error: {0}")]
    Internal(String),
}
