use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};

use crate::error::StoreError;
use crate::hash::MediaHash;

pub trait MediaStore: Send + Sync {
    fn ingest(&self, path: &Path) -> Result<MediaHash, StoreError>;
    fn resolve(&self, hash: &MediaHash) -> Option<PathBuf>;
    fn contains(&self, hash: &MediaHash) -> bool;
    fn delete(&self, hash: &MediaHash) -> Result<bool, StoreError>;
    fn list_all_hashes(&self) -> Result<Vec<MediaHash>, StoreError>;
    fn size_bytes(&self, hash: &MediaHash) -> Option<u64>;
    fn total_size_bytes(&self) -> u64;
    fn root_path(&self) -> Option<PathBuf> {
        None
    }
}

#[derive(Debug, Clone)]
pub struct FsMediaStore {
    root: PathBuf,
}

impl FsMediaStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn init(root: impl Into<PathBuf>) -> Result<Self, StoreError> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn object_path(&self, hash: &MediaHash) -> PathBuf {
        self.root.join(hash.prefix()).join(hash.to_hex())
    }
}

impl MediaStore for FsMediaStore {
    fn ingest(&self, path: &Path) -> Result<MediaHash, StoreError> {
        if !path.is_file() {
            return Err(StoreError::NotAFile(path.to_path_buf()));
        }

        let file = File::open(path)?;
        let reader = BufReader::new(file);
        let hash = MediaHash::from_reader(reader)?;

        // CRITICAL: Refuse to re-copy an existing hash to satisfy content-addressable deduplication
        if self.contains(&hash) {
            return Ok(hash);
        }

        let target_dir = self.root.join(hash.prefix());
        fs::create_dir_all(&target_dir)?;

        let target_path = target_dir.join(hash.to_hex());
        let temp_path = target_dir.join(format!(".tmp-{}", hash.to_hex()));

        fs::copy(path, &temp_path)?;

        // CRITICAL: Atomic rename ensures readers never see partially written files
        match fs::rename(&temp_path, &target_path) {
            Ok(()) => Ok(hash),
            Err(e) => {
                let _ = fs::remove_file(&temp_path);
                if target_path.is_file() {
                    Ok(hash)
                } else {
                    Err(StoreError::Io(e))
                }
            }
        }
    }

    fn resolve(&self, hash: &MediaHash) -> Option<PathBuf> {
        let path = self.object_path(hash);
        if path.is_file() { Some(path) } else { None }
    }

    fn contains(&self, hash: &MediaHash) -> bool {
        self.resolve(hash).is_some()
    }

    fn delete(&self, hash: &MediaHash) -> Result<bool, StoreError> {
        let path = self.object_path(hash);
        if path.is_file() {
            fs::remove_file(&path)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    fn list_all_hashes(&self) -> Result<Vec<MediaHash>, StoreError> {
        let mut hashes = Vec::new();
        if !self.root.exists() {
            return Ok(hashes);
        }

        for prefix_entry in fs::read_dir(&self.root)? {
            let prefix_entry = prefix_entry?;
            if prefix_entry.file_type()?.is_dir() {
                for file_entry in fs::read_dir(prefix_entry.path())? {
                    let file_entry = file_entry?;
                    let file_name = file_entry.file_name().to_string_lossy().to_string();
                    if !file_name.starts_with('.')
                        && file_entry.file_type()?.is_file()
                        && let Ok(hash) = MediaHash::from_hex(&file_name)
                    {
                        hashes.push(hash);
                    }
                }
            }
        }

        Ok(hashes)
    }

    fn size_bytes(&self, hash: &MediaHash) -> Option<u64> {
        let path = self.object_path(hash);
        fs::metadata(path).ok().map(|m| m.len())
    }

    fn total_size_bytes(&self) -> u64 {
        let mut total = 0;
        if let Ok(hashes) = self.list_all_hashes() {
            for h in hashes {
                total += self.size_bytes(&h).unwrap_or(0);
            }
        }
        total
    }

    fn root_path(&self) -> Option<PathBuf> {
        Some(self.root.clone())
    }
}
