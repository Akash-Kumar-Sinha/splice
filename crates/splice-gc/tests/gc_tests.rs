use std::fs::File;
use std::io::Write;
use std::sync::Arc;
use std::time::Duration;

use splice_commit::{Commit, CommitStore, SqliteCommitStore, Tag};
use splice_gc::{RetentionPolicy, collect_garbage, estimate_reclaimable};
use splice_media::{FsMediaStore, MediaHash, MediaStore};
use tempfile::tempdir;
use time::OffsetDateTime;

#[test]
fn test_gc_pruning_and_media_ref_counting() {
    let dir = tempdir().unwrap();
    let commit_store = Arc::new(SqliteCommitStore::open_in_memory().unwrap());
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).unwrap());

    // 1. Ingest 3 media files
    let file1 = dir.path().join("f1.mp4");
    let mut f = File::create(&file1).unwrap();
    f.write_all(b"MEDIA_CONTENT_1_ABCDEF").unwrap();
    let hash1 = media_store.ingest(&file1).unwrap();

    let file2 = dir.path().join("f2.mp4");
    let mut f = File::create(&file2).unwrap();
    f.write_all(b"MEDIA_CONTENT_2_GHIJKL").unwrap();
    let hash2 = media_store.ingest(&file2).unwrap();

    let file3 = dir.path().join("f3.mp4");
    let mut f = File::create(&file3).unwrap();
    f.write_all(b"MEDIA_CONTENT_3_MNOPQR").unwrap();
    let hash3 = media_store.ingest(&file3).unwrap();

    // 2. Create an old commit (60 days ago) with hash1 and hash3
    let sixty_days_ago = OffsetDateTime::now_utc() - time::Duration::days(60);
    let mut old_commit = Commit::create(
        None,
        "editor".to_string(),
        "Old transient cut".to_string(),
        MediaHash::compute(b"tl_old"),
        vec![hash1, hash3],
    );
    old_commit.timestamp = sixty_days_ago;
    let old_id = commit_store.append(old_commit).unwrap();

    // 3. Create a recent commit (now) with hash1 and hash2 (as child of old_commit)
    let recent_commit = Commit::create(
        Some(old_id),
        "editor".to_string(),
        "Active latest cut".to_string(),
        MediaHash::compute(b"tl_recent"),
        vec![hash1, hash2],
    );
    let recent_id = commit_store.append(recent_commit).unwrap();

    // 4. Create an old starred commit (45 days ago) with hash3
    let forty_five_days_ago = OffsetDateTime::now_utc() - time::Duration::days(45);
    let mut starred_commit = Commit::create(
        Some(old_id),
        "director".to_string(),
        "Starred milestone".to_string(),
        MediaHash::compute(b"tl_starred"),
        vec![hash3],
    );
    starred_commit.timestamp = forty_five_days_ago;
    let starred_id = commit_store.append(starred_commit).unwrap();
    commit_store
        .add_tag(Tag::new(starred_id, "starred"))
        .unwrap();

    // Set HEAD to recent commit
    commit_store.set_head(&recent_id).unwrap();

    let policy = RetentionPolicy {
        keep_starred_forever: true,
        prune_after: Duration::from_secs(30 * 24 * 60 * 60), // 30 days
    };

    // Estimate first
    let estimate =
        estimate_reclaimable(commit_store.as_ref(), media_store.as_ref(), &policy).unwrap();
    assert_eq!(estimate.commits_scanned, 3);
    // All 3 commits are retained: recent is HEAD, starred is Tagged, old is Ancestor of recent!
    assert_eq!(estimate.commits_retained, 3);
    assert_eq!(estimate.commits_pruned, 0);
    assert_eq!(estimate.media_pruned, 0);

    // Now create an unlinked detached stale commit (70 days ago) with a standalone media hash4
    let file4 = dir.path().join("f4.mp4");
    let mut f = File::create(&file4).unwrap();
    f.write_all(b"MEDIA_CONTENT_4_STALE_TRASH").unwrap();
    let hash4 = media_store.ingest(&file4).unwrap();

    let mut stale_commit = Commit::create(
        None,
        "editor".to_string(),
        "Stale isolated cut".to_string(),
        MediaHash::compute(b"tl_stale"),
        vec![hash4],
    );
    stale_commit.timestamp = OffsetDateTime::now_utc() - time::Duration::days(70);
    let stale_id = commit_store.append(stale_commit).unwrap();
    // restore HEAD back to recent
    commit_store.set_head(&recent_id).unwrap();

    let estimate2 =
        estimate_reclaimable(commit_store.as_ref(), media_store.as_ref(), &policy).unwrap();
    assert_eq!(estimate2.commits_scanned, 4);
    assert_eq!(estimate2.commits_retained, 3);
    assert_eq!(estimate2.commits_pruned, 1);
    assert_eq!(estimate2.media_pruned, 1);
    assert!(estimate2.bytes_freed > 0);

    // Run actual GC
    let report = collect_garbage(commit_store.as_ref(), media_store.as_ref(), &policy).unwrap();
    assert_eq!(report.commits_pruned, 1);
    assert_eq!(report.media_pruned, 1);
    assert!(!report.dry_run);

    // Stale commit should be gone
    assert!(commit_store.get(&stale_id).is_err());
    // Stale media should be gone
    assert!(!media_store.contains(&hash4));

    // Retained commits and media should still exist
    assert!(commit_store.get(&recent_id).is_ok());
    assert!(commit_store.get(&starred_id).is_ok());
    assert!(commit_store.get(&old_id).is_ok()); // ancestor retained
    assert!(media_store.contains(&hash1));
    assert!(media_store.contains(&hash2));
    assert!(media_store.contains(&hash3));
}
