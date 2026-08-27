use std::time::Duration;

use splice_commit::{Clip, Timeline, Track};
use splice_diff::diff;
use splice_media::MediaHash;

#[test]
fn test_diff_empty_timelines() {
    let a = Timeline::default();
    let b = Timeline::default();
    let d = diff(&a, &b);
    assert!(d.is_empty());
    assert_eq!(d.summary, "No timeline changes");
}

#[test]
fn test_diff_added_clip() {
    let hash1 = MediaHash::compute(b"clip1");
    let clip1 = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(0),
    );

    let a = Timeline::default();
    let b = Timeline::new(vec![Track::new(vec![clip1])]);

    let d = diff(&a, &b);
    assert_eq!(d.added.len(), 1);
    assert_eq!(d.removed.len(), 0);
    assert_eq!(d.moved.len(), 0);
    assert_eq!(d.summary, "Added 1 clip");
}

#[test]
fn test_diff_removed_clip() {
    let hash1 = MediaHash::compute(b"clip1");
    let clip1 = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(0),
    );

    let a = Timeline::new(vec![Track::new(vec![clip1])]);
    let b = Timeline::default();

    let d = diff(&a, &b);
    assert_eq!(d.added.len(), 0);
    assert_eq!(d.removed.len(), 1);
    assert_eq!(d.moved.len(), 0);
    assert_eq!(d.summary, "Removed 1 clip");
}

#[test]
fn test_diff_trimmed_clip() {
    let hash1 = MediaHash::compute(b"clip1");
    let clip_a = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(0),
    );
    let clip_b = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs_f64(7.7), // Trimmed by 2.3s
        Duration::from_secs(0),
    );

    let a = Timeline::new(vec![Track::new(vec![clip_a])]);
    let b = Timeline::new(vec![Track::new(vec![clip_b])]);

    let d = diff(&a, &b);
    assert_eq!(d.added.len(), 0);
    assert_eq!(d.removed.len(), 0);
    assert_eq!(d.moved.len(), 1);
    assert_eq!(d.summary, "Trimmed clip by 2.3s");
}

#[test]
fn test_diff_repositioned_and_added_clips() {
    let hash1 = MediaHash::compute(b"clip1");
    let hash2 = MediaHash::compute(b"clip2");

    let clip1_a = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(0),
    );
    let clip1_b = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(5), // Repositioned
    );
    let clip2 = Clip::new(
        hash2,
        Duration::from_secs(0),
        Duration::from_secs(5),
        Duration::from_secs(0),
    );

    let a = Timeline::new(vec![Track::new(vec![clip1_a])]);
    let b = Timeline::new(vec![Track::new(vec![clip2, clip1_b])]);

    let d = diff(&a, &b);
    assert_eq!(d.added.len(), 1);
    assert_eq!(d.moved.len(), 1);
    assert!(d.summary.contains("Added 1 clip"));
}
