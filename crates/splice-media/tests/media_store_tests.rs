use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use splice_media::{FsMediaStore, MediaHash, MediaStore, StoreError};
use tempfile::tempdir;

#[test]
fn test_media_hash_sha256_computation() {
    let data = b"video track data 001";
    let hash = MediaHash::compute(data);
    let hex = hash.to_hex();
    assert_eq!(hex.len(), 64);
    assert_eq!(hash.prefix(), &hex[..2]);
    assert_eq!(hash.to_string(), hex);

    let parsed: MediaHash = hex.parse().expect("parse hex to MediaHash");
    assert_eq!(parsed, hash);
}

#[test]
fn test_media_hash_serde_roundtrip() {
    let hash = MediaHash::compute(b"media stream bytes");
    let serialized = serde_json::to_string(&hash).expect("serialize hash");
    let deserialized: MediaHash = serde_json::from_str(&serialized).expect("deserialize hash");
    assert_eq!(hash, deserialized);
}

#[test]
fn test_ingest_single_file() {
    let dir = tempdir().expect("create temp dir");
    let store_root = dir.path().join(".media_store");
    let store = FsMediaStore::init(&store_root).expect("init store");

    let source_path = dir.path().join("clip1.mp4");
    let mut file = File::create(&source_path).expect("create source file");
    file.write_all(b"sample video bytes 1")
        .expect("write bytes");
    file.flush().expect("flush");

    let hash = store.ingest(&source_path).expect("ingest file");
    let resolved_path = store.resolve(&hash).expect("resolve path");

    assert!(resolved_path.exists());
    assert!(resolved_path.is_file());
    assert!(store.contains(&hash));

    // INFO: Verify structure is .media_store/<prefix>/<hash>
    let expected_dir = store_root.join(hash.prefix());
    let expected_file = expected_dir.join(hash.to_hex());
    assert_eq!(resolved_path, expected_file);
}

// CRITICAL: Ship condition: Import the same file twice -> one copy on disk.
#[test]
fn test_ship_condition_deduplication_import_same_file_twice() {
    let dir = tempdir().expect("create temp dir");
    let store_root = dir.path().join(".media_store");
    let store = FsMediaStore::init(&store_root).expect("init store");

    let source_path = dir.path().join("clip_duplicate.mp4");
    let mut file = File::create(&source_path).expect("create source file");
    file.write_all(b"identical media payload content")
        .expect("write bytes");
    file.flush().expect("flush");

    let hash_first = store.ingest(&source_path).expect("first ingest");
    let path_first = store.resolve(&hash_first).expect("resolve first");

    let hash_second = store.ingest(&source_path).expect("second ingest");
    let path_second = store.resolve(&hash_second).expect("resolve second");

    assert_eq!(hash_first, hash_second);
    assert_eq!(path_first, path_second);

    let prefix_dir = store_root.join(hash_first.prefix());
    let count = count_files_in_dir(&prefix_dir);
    assert_eq!(count, 1);
}

#[test]
fn test_deduplication_different_files_same_content() {
    let dir = tempdir().expect("create temp dir");
    let store_root = dir.path().join(".media_store");
    let store = FsMediaStore::init(&store_root).expect("init store");

    let source_a = dir.path().join("source_a.mov");
    let source_b = dir.path().join("source_b.mov");

    let content = b"same raw frames content";
    fs::write(&source_a, content).expect("write source a");
    fs::write(&source_b, content).expect("write source b");

    let hash_a = store.ingest(&source_a).expect("ingest source a");
    let hash_b = store.ingest(&source_b).expect("ingest source b");

    assert_eq!(hash_a, hash_b);
    let resolved = store.resolve(&hash_a).expect("resolve hash");
    assert!(resolved.exists());

    let prefix_dir = store_root.join(hash_a.prefix());
    let count = count_files_in_dir(&prefix_dir);
    assert_eq!(count, 1);
}

#[test]
fn test_ingest_multiple_distinct_files() {
    let dir = tempdir().expect("create temp dir");
    let store_root = dir.path().join(".media_store");
    let store = FsMediaStore::init(&store_root).expect("init store");

    let hashes: Vec<MediaHash> = (0..10)
        .map(|i| {
            let file_path = dir.path().join(format!("file_{i}.mp4"));
            fs::write(&file_path, format!("media content index {i}")).expect("write file");
            store.ingest(&file_path).expect("ingest")
        })
        .collect();

    for (i, hash) in hashes.iter().enumerate() {
        assert!(store.contains(hash));
        let path = store.resolve(hash).expect("resolve");
        assert!(path.is_file());
        let read_bytes = fs::read(path).expect("read bytes");
        assert_eq!(read_bytes, format!("media content index {i}").as_bytes());
    }
}

#[test]
fn test_resolve_missing_media() {
    let dir = tempdir().expect("create temp dir");
    let store = FsMediaStore::new(dir.path().join(".media_store"));
    let unknown_hash = MediaHash::compute(b"random unknown data");

    assert_eq!(store.resolve(&unknown_hash), None);
    assert!(!store.contains(&unknown_hash));
}

#[test]
fn test_ingest_non_existent_file() {
    let dir = tempdir().expect("create temp dir");
    let store = FsMediaStore::new(dir.path().join(".media_store"));
    let non_existent = dir.path().join("missing.mp4");

    let result = store.ingest(&non_existent);
    assert!(result.is_err());
}

#[test]
fn test_ingest_directory_fails() {
    let dir = tempdir().expect("create temp dir");
    let store = FsMediaStore::new(dir.path().join(".media_store"));
    let folder = dir.path().join("nested_folder");
    fs::create_dir_all(&folder).expect("create folder");

    let result = store.ingest(&folder);
    match result {
        Err(StoreError::NotAFile(p)) => assert_eq!(p, folder),
        other => panic!("expected NotAFile error, got {other:?}"),
    }
}

fn count_files_in_dir(path: &Path) -> usize {
    if !path.exists() {
        return 0;
    }
    fs::read_dir(path)
        .expect("read dir")
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file())
        .count()
}
