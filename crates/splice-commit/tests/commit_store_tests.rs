use splice_commit::{Commit, CommitId, CommitStore, SqliteCommitStore, StoreError};
use splice_media::{FsMediaStore, MediaHash, MediaStore};
use std::fs;
use tempfile::tempdir;
use time::OffsetDateTime;

#[test]
fn test_append_and_get_single_commit() {
    let store = SqliteCommitStore::open_in_memory().expect("open memory db");
    assert!(store.is_empty().expect("is_empty"));

    let timeline_hash = MediaHash::compute(b"timeline v1");
    let clip_hash = MediaHash::compute(b"clip v1");

    let commit = Commit::create(
        None,
        "aks.krsinha@gmail.com",
        "Initial project creation",
        timeline_hash,
        vec![clip_hash],
    );
    let commit_id = commit.id;

    let appended_id = store.append(commit.clone()).expect("append commit");
    assert_eq!(appended_id, commit_id);
    assert_eq!(store.len().expect("len"), 1);
    assert_eq!(store.head_id().expect("head_id"), Some(commit_id));

    let fetched = store.get(&commit_id).expect("get commit");
    assert_eq!(fetched.id, commit_id);
    assert_eq!(fetched.parent, None);
    assert_eq!(fetched.author, "aks.krsinha@gmail.com");
    assert_eq!(fetched.message, "Initial project creation");
    assert_eq!(fetched.timeline_hash, timeline_hash);
    assert_eq!(fetched.media_refs, vec![clip_hash]);
}

#[test]
fn test_append_linear_history() {
    let store = SqliteCommitStore::open_in_memory().expect("open memory db");

    let c0 = Commit::create(None, "author", "c0", MediaHash::compute(b"t0"), vec![]);
    let id0 = store.append(c0).expect("append c0");

    let c1 = Commit::create(Some(id0), "author", "c1", MediaHash::compute(b"t1"), vec![]);
    let id1 = store.append(c1).expect("append c1");

    let c2 = Commit::create(Some(id1), "author", "c2", MediaHash::compute(b"t2"), vec![]);
    let id2 = store.append(c2).expect("append c2");

    let chain = store.chain_from_head().expect("chain_from_head");
    assert_eq!(chain.len(), 3);
    assert_eq!(chain[0].id, id2);
    assert_eq!(chain[1].id, id1);
    assert_eq!(chain[2].id, id0);

    assert_eq!(chain[0].parent, Some(id1));
    assert_eq!(chain[1].parent, Some(id0));
    assert_eq!(chain[2].parent, None);
}

#[test]
fn test_append_rejects_missing_parent() {
    let store = SqliteCommitStore::open_in_memory().expect("open memory db");
    let missing_parent_id = CommitId::new();

    let commit = Commit::create(
        Some(missing_parent_id),
        "author",
        "orphan commit",
        MediaHash::compute(b"timeline"),
        vec![],
    );

    let result = store.append(commit);
    match result {
        Err(StoreError::ParentNotFound(id)) => assert_eq!(id, missing_parent_id),
        other => panic!("expected ParentNotFound, got {other:?}"),
    }
}

#[test]
fn test_append_rejects_duplicate_commit_id() {
    let store = SqliteCommitStore::open_in_memory().expect("open memory db");
    let commit = Commit::create(
        None,
        "author",
        "root commit",
        MediaHash::compute(b"timeline"),
        vec![],
    );

    store.append(commit.clone()).expect("first append");
    let result = store.append(commit);
    match result {
        Err(StoreError::DuplicateCommit(_)) => (),
        other => panic!("expected DuplicateCommit, got {other:?}"),
    }
}

// CRITICAL: Ship condition: Save 50 times, restart, chain_from_head() returns all 50 in order.
#[test]
fn test_ship_condition_save_50_times_restart_and_chain_from_head() {
    let dir = tempdir().expect("create temp dir");
    let db_path = dir.path().join("splice_commits.db");

    let total_commits = 50;
    let mut expected_commits = Vec::with_capacity(total_commits);

    // INFO: Step 1: Open fresh store, commit 50 times in a parent-linked chain
    {
        let store = SqliteCommitStore::open(&db_path).expect("open sqlite commit store");
        let mut parent_id: Option<CommitId> = None;

        for i in 0..total_commits {
            let timeline_hash = MediaHash::compute(format!("timeline_state_{i}").as_bytes());
            let media_ref = MediaHash::compute(format!("media_clip_{i}").as_bytes());

            let commit = Commit::new(
                CommitId::new(),
                parent_id,
                OffsetDateTime::now_utc(),
                format!("author_{i}"),
                format!("Save snapshot #{i}"),
                timeline_hash,
                vec![media_ref],
            );

            let commit_id = commit.id;
            store.append(commit.clone()).expect("append to store");
            expected_commits.push(commit);
            parent_id = Some(commit_id);
        }

        assert_eq!(store.len().expect("len before restart"), 50);
    }

    // INFO: Step 2: Restart the engine by opening a brand new instance on the persisted database
    let restarted_store = SqliteCommitStore::open(&db_path).expect("reopen sqlite commit store");

    assert_eq!(restarted_store.len().expect("len after restart"), 50);

    // INFO: Step 3: Walk chain_from_head() and verify all 50 commits are returned in exact chain order
    let chain = restarted_store
        .chain_from_head()
        .expect("chain_from_head after restart");

    assert_eq!(chain.len(), 50);

    // INFO: The head is the latest commit (#49), walking backwards down to root commit (#0)
    for (i, commit) in chain.iter().enumerate() {
        let expected_index = total_commits - 1 - i;
        let expected = &expected_commits[expected_index];

        assert_eq!(commit.id, expected.id);
        assert_eq!(commit.parent, expected.parent);
        assert_eq!(commit.author, expected.author);
        assert_eq!(commit.message, expected.message);
        assert_eq!(commit.timeline_hash, expected.timeline_hash);
        assert_eq!(commit.media_refs, expected.media_refs);
    }

    // INFO: Verify parent linkage invariants across the returned chain
    for i in 0..chain.len() - 1 {
        assert_eq!(chain[i].parent, Some(chain[i + 1].id));
    }
    assert_eq!(chain.last().expect("last element").parent, None);
}

// CRITICAL: Integration test: Content-addressable media store + parent-linked commit engine
#[test]
fn test_media_store_and_commit_engine_integration() {
    let dir = tempdir().expect("create temp dir");
    let media_root = dir.path().join(".media_store");
    let db_path = dir.path().join("splice.db");

    let media_store = FsMediaStore::init(&media_root).expect("init media store");
    let commit_store = SqliteCommitStore::open(&db_path).expect("open commit store");

    // Ingest media files
    let clip1_path = dir.path().join("clip1.mp4");
    let clip2_path = dir.path().join("clip2.mp4");
    fs::write(&clip1_path, b"video 1 data").expect("write clip 1");
    fs::write(&clip2_path, b"video 2 data").expect("write clip 2");

    let hash1 = media_store.ingest(&clip1_path).expect("ingest clip 1");
    let hash2 = media_store.ingest(&clip2_path).expect("ingest clip 2");

    // Commit 1: with clip 1
    let commit1 = Commit::create(
        None,
        "editor",
        "Add first clip",
        MediaHash::compute(b"timeline with clip 1"),
        vec![hash1],
    );
    let id1 = commit_store.append(commit1).expect("append commit 1");

    // Commit 2: with clip 1 and clip 2
    let commit2 = Commit::create(
        Some(id1),
        "editor",
        "Add second clip",
        MediaHash::compute(b"timeline with clip 1 and 2"),
        vec![hash1, hash2],
    );
    let id2 = commit_store.append(commit2).expect("append commit 2");

    // Walk chain and resolve media
    let chain = commit_store.chain_from_head().expect("chain from head");
    assert_eq!(chain.len(), 2);
    assert_eq!(chain[0].id, id2);
    assert_eq!(chain[1].id, id1);

    for commit in &chain {
        for media_ref in &commit.media_refs {
            let path = media_store.resolve(media_ref).expect("resolve media");
            assert!(path.exists());
        }
    }
}

#[test]
fn test_tags_add_remove_get() {
    let store = SqliteCommitStore::open_in_memory().expect("open memory store");
    let c0 = Commit::create(
        None,
        "director",
        "v1.0 cut",
        MediaHash::compute(b"t0"),
        vec![],
    );
    let id0 = store.append(c0).expect("append");

    assert_eq!(
        store.get_tags(&id0).expect("get_tags"),
        Vec::<String>::new()
    );

    // Add tags
    store
        .add_tag(splice_commit::Tag::new(id0, "Picture Lock"))
        .expect("add tag");
    store
        .add_tag(splice_commit::Tag::new(id0, "Director's Cut"))
        .expect("add tag");

    let tags = store.get_tags(&id0).expect("get_tags");
    assert_eq!(tags, vec!["Director's Cut", "Picture Lock"]);

    // List all
    let all = store.list_all_tags().expect("list all");
    assert_eq!(all.len(), 2);

    // Remove one tag
    let removed = store
        .remove_tag(&id0, "Director's Cut")
        .expect("remove tag");
    assert!(removed);

    let tags_after = store.get_tags(&id0).expect("get_tags");
    assert_eq!(tags_after, vec!["Picture Lock"]);
}

#[test]
fn test_branching_dag_and_tree_construction() {
    let store = SqliteCommitStore::open_in_memory().expect("open memory store");

    // Root commit C0
    let c0 = Commit::create(
        None,
        "editor",
        "Root commit",
        MediaHash::compute(b"t0"),
        vec![],
    );
    let id0 = store.append(c0).expect("append c0");

    // Branch 1: C0 -> C1 -> C2
    let c1 = Commit::create(
        Some(id0),
        "editor",
        "Feature A",
        MediaHash::compute(b"t1"),
        vec![],
    );
    let id1 = store.append(c1).expect("append c1");
    let c2 = Commit::create(
        Some(id1),
        "editor",
        "Feature A final",
        MediaHash::compute(b"t2"),
        vec![],
    );
    let _id2 = store.append(c2).expect("append c2");

    // Branch 2 (Save As New Version branching off C0): C0 -> C3
    let c3 = Commit::create(
        Some(id0),
        "editor",
        "Branch B (Alt Version)",
        MediaHash::compute(b"t3"),
        vec![],
    );
    let id3 = store.append(c3).expect("append c3");

    let all_commits = store.list_all_commits().expect("list all");
    assert_eq!(all_commits.len(), 4);

    let tree =
        splice_commit::build_commit_tree(&all_commits, |id| store.get_tags(id).unwrap_or_default());
    assert_eq!(tree.len(), 1); // 1 root (C0)
    assert_eq!(tree[0].commit.id, id0);
    assert_eq!(tree[0].children.len(), 2); // 2 branches diverging from C0: C1 and C3

    let child_ids: Vec<splice_commit::CommitId> =
        tree[0].children.iter().map(|c| c.commit.id).collect();
    assert!(child_ids.contains(&id1));
    assert!(child_ids.contains(&id3));
}
