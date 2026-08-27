use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ThumbError {
    #[error("I/O error during thumbnail generation: {0}")]
    Io(#[from] std::io::Error),

    #[error("FFmpeg execution failed: {0}")]
    FfmpegFailed(String),

    #[error("Invalid media path: {0}")]
    InvalidPath(PathBuf),

    #[error("Media store error: {0}")]
    Media(#[from] splice_media::StoreError),
}
