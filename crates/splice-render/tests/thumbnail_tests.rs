use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use std::time::Duration;

use splice_render::{FfmpegThumbnailer, FsThumbnailCache, ThumbnailJob, ThumbnailQueue};

use tempfile::tempdir;

#[test]
fn test_fallback_jpeg_generation() {
    let bytes = FfmpegThumbnailer::generate_fallback_jpeg("test");
    assert!(!bytes.is_empty());
    assert_eq!(&bytes[0..2], &[0xFF, 0xD8]); // JPEG magic header
}

#[test]
fn test_thumbnail_cache_put_and_get() {
    let dir = tempdir().expect("tempdir");
    let cache = FsThumbnailCache::init(dir.path()).expect("init cache");

    let id = "test-commit-123";
    let data = b"fake-jpeg-data";

    assert!(!cache.contains(id));
    cache.put(id, data).expect("put");
    assert!(cache.contains(id));

    let retrieved = cache.get(id).expect("get");
    assert_eq!(retrieved, data);
}

#[tokio::test]
async fn test_async_thumbnail_worker_queue() {
    let dir = tempdir().expect("tempdir");
    let cache = FsThumbnailCache::init(dir.path().join("cache")).expect("init cache");
    let generator = Arc::new(FfmpegThumbnailer::new());

    let queue = ThumbnailQueue::new(cache.clone(), generator, 16);

    let dummy_video = dir.path().join("dummy.mp4");
    {
        let mut f = File::create(&dummy_video).expect("create file");
        f.write_all(b"dummy media content").expect("write");
    }

    let job = ThumbnailJob {
        commit_id: "commit-async-test".to_string(),
        media_path: dummy_video,
        at: Duration::from_secs(1),
    };

    assert!(queue.submit(job));

    // Wait for background async task to process
    tokio::time::sleep(Duration::from_millis(200)).await;

    assert!(cache.contains("commit-async-test"));
    let thumb = cache.get("commit-async-test").expect("thumbnail");
    assert!(!thumb.is_empty());
}

#[test]
fn test_render_export_empty_fails() {
    let dir = tempdir().expect("tempdir");
    let out = dir.path().join("out.mp4");
    let res = splice_render::render_export_mp4(&[], &out);
    assert!(res.is_err());
}
