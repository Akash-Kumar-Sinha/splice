use std::fs;
use std::path::PathBuf;

use crate::error::ThumbError;

#[derive(Debug, Clone)]
pub struct FsThumbnailCache {
    root: PathBuf,
}

impl FsThumbnailCache {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn init(root: impl Into<PathBuf>) -> Result<Self, ThumbError> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    pub fn thumbnail_path(&self, id: &str) -> PathBuf {
        self.root.join(format!("{id}.jpg"))
    }

    pub fn get(&self, id: &str) -> Option<Vec<u8>> {
        let path = self.thumbnail_path(id);
        if path.is_file() {
            fs::read(&path).ok()
        } else {
            None
        }
    }

    pub fn put(&self, id: &str, data: &[u8]) -> Result<PathBuf, ThumbError> {
        let path = self.thumbnail_path(id);
        fs::write(&path, data)?;
        Ok(path)
    }

    pub fn contains(&self, id: &str) -> bool {
        self.thumbnail_path(id).is_file()
    }
}
