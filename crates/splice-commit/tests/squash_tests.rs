use splice_commit::{Commit, CommitId, squash};
use splice_media::MediaHash;
use time::OffsetDateTime;

#[test]
fn test_squash_empty_commits() {
    let empty: Vec<Commit> = vec![];
    let squashed = squash(&empty);
    assert_eq!(squashed.author, "system");
    assert_eq!(squashed.parent, None);
}

#[test]
fn test_squash_single_commit() {
    let c1 = Commit::new(
        CommitId::new(),
        None,
        OffsetDateTime::now_utc(),
        "alice",
        "initial",
        MediaHash::compute(b"tl1"),
        vec![MediaHash::compute(b"m1")],
    );
    let squashed = squash(&[c1.clone()]);
    assert_eq!(squashed.parent, None);
    assert_eq!(squashed.author, "alice");
    assert_eq!(squashed.message, "initial");
    assert_eq!(squashed.timeline_hash, c1.timeline_hash);
    assert_eq!(squashed.media_refs, c1.media_refs);
}

#[test]
fn test_squash_chain_of_commits() {
    let parent_id = CommitId::new();
    let m1 = MediaHash::compute(b"media_1");
    let m2 = MediaHash::compute(b"media_2");
    let m3 = MediaHash::compute(b"media_3");

    let c1 = Commit::new(
        CommitId::new(),
        Some(parent_id),
        OffsetDateTime::now_utc(),
        "alice",
        "Add drum track",
        MediaHash::compute(b"tl1"),
        vec![m1],
    );

    let c2 = Commit::new(
        CommitId::new(),
        Some(c1.id),
        OffsetDateTime::now_utc(),
        "bob",
        "Trim intro",
        MediaHash::compute(b"tl2"),
        vec![m1, m2],
    );

    let c3 = Commit::new(
        CommitId::new(),
        Some(c2.id),
        OffsetDateTime::now_utc(),
        "charlie",
        "Final mix master",
        MediaHash::compute(b"tl3"),
        vec![m2, m3],
    );

    let squashed = squash(&[c1, c2, c3]);

    // CRITICAL: Parent must point to earliest commit's parent
    assert_eq!(squashed.parent, Some(parent_id));

    // CRITICAL: Timeline hash must match latest commit
    assert_eq!(squashed.timeline_hash, MediaHash::compute(b"tl3"));

    // CRITICAL: Author comes from latest committer
    assert_eq!(squashed.author, "charlie");

    // CRITICAL: Deduplicated union of all media references
    assert_eq!(squashed.media_refs.len(), 3);
    assert!(squashed.media_refs.contains(&m1));
    assert!(squashed.media_refs.contains(&m2));
    assert!(squashed.media_refs.contains(&m3));

    // CRITICAL: Combined summary message
    assert!(squashed.message.contains("Squashed 3 commits"));
    assert!(squashed.message.contains("Add drum track"));
    assert!(squashed.message.contains("Trim intro"));
    assert!(squashed.message.contains("Final mix master"));
}
