use std::path::PathBuf;
use thiserror::Error;

use crate::hash::MediaHash;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid media hash: {0}")]
    InvalidHash(String),

    #[error("Media not found: {0}")]
    NotFound(MediaHash),

    #[error("Path is not a regular file: {0}")]
    NotAFile(PathBuf),

    #[error("Failed to parse media hash: {0}")]
    Parse(#[from] ParseMediaHashError),
}

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum ParseMediaHashError {
    #[error("Invalid hash length: expected 64 hex characters, got {0}")]
    InvalidLength(usize),

    #[error("Invalid hexadecimal encoding")]
    InvalidHex,
}
