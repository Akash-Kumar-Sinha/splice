use thiserror::Error;

#[derive(Error, Debug)]
pub enum SerializeError {
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid timeline data: {0}")]
    InvalidData(String),

    #[error("Unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}
