use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RenderError {
    #[error("I/O error during rendering: {0}")]
    Io(#[from] std::io::Error),

    #[error("FFmpeg execution failed: {0}")]
    FfmpegFailed(String),

    #[error("Invalid media path: {0}")]
    InvalidPath(PathBuf),

    #[error("Media store error: {0}")]
    Media(#[from] splice_media::StoreError),

    #[error("Empty timeline - no clips to render")]
    EmptyTimeline,

    #[error("Media not found: {0}")]
    MediaNotFound(String),
}

pub type ThumbError = RenderError;
