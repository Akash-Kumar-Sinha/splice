use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use std::time::Duration;

use splice_commit::{Clip, Timeline, Track};
use splice_media::MediaHash;
use splice_render::{FsProxyCache, LowResProxyRenderer, ProxyRenderer};
use tempfile::tempdir;

#[test]
fn test_proxy_renderer_fallback_and_cache() {
    let media_dir = tempdir().unwrap();
    let cache_dir = tempdir().unwrap();

    let media_hash = MediaHash::compute(b"test_video_data");
    let media_file_path = media_dir.path().join(media_hash.to_hex());
    let mut f = File::create(&media_file_path).unwrap();
    f.write_all(b"RIFF....AVI....TEST_MEDIA").unwrap();

    let clip = Clip::new(
        media_hash,
        Duration::from_secs(0),
        Duration::from_secs(5),
        Duration::from_secs(0),
    );

    let timeline = Timeline::new(vec![Track::new(vec![clip])]);

    let renderer = LowResProxyRenderer::new(media_dir.path(), cache_dir.path());
    let rendered_path = renderer.render(&timeline).unwrap();

    assert!(rendered_path.exists());
    assert_eq!(rendered_path.parent().unwrap(), cache_dir.path());

    // Second render must return cached path
    let second_path = renderer.render(&timeline).unwrap();
    assert_eq!(rendered_path, second_path);

    // Test proxy cache wrapper
    let cache = FsProxyCache::new(cache_dir.path(), Arc::new(renderer));
    assert!(cache.get(&timeline).is_some());
}

#[test]
fn test_proxy_renderer_empty_timeline_fails() {
    let media_dir = tempdir().unwrap();
    let cache_dir = tempdir().unwrap();

    let empty_timeline = Timeline::new(vec![]);
    let renderer = LowResProxyRenderer::new(media_dir.path(), cache_dir.path());
    let err = renderer.render(&empty_timeline);
    assert!(err.is_err());
}
