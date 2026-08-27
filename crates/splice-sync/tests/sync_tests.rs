use std::sync::Arc;

use object_store::memory::InMemory;
use splice_commit::{Commit, CommitId, CommitStore, SqliteCommitStore};
use splice_media::MediaHash;

use splice_sync::{RemoteCommitStore, S3RemoteStore, SyncEngine, SyncQueue, SyncState};
use time::OffsetDateTime;

#[tokio::test]
async fn test_remote_store_push_and_pull_since() {
    let mem_store = Arc::new(InMemory::new());
    let remote = S3RemoteStore::new(mem_store);

    let id1 = CommitId::new();
    let id2 = CommitId::new();
    let id3 = CommitId::new();

    let commit1 = Commit::new(
        id1,
        None,
        OffsetDateTime::now_utc(),
        "alice",
        "Commit 1",
        MediaHash::compute(b"tl1"),
        vec![],
    );
    let commit2 = Commit::new(
        id2,
        Some(id1),
        OffsetDateTime::now_utc(),
        "alice",
        "Commit 2",
        MediaHash::compute(b"tl2"),
        vec![],
    );
    let commit3 = Commit::new(
        id3,
        Some(id2),
        OffsetDateTime::now_utc(),
        "alice",
        "Commit 3",
        MediaHash::compute(b"tl3"),
        vec![],
    );

    remote
        .push(&[commit1.clone(), commit2.clone(), commit3.clone()])
        .await
        .expect("push commits");

    // Pull all commits
    let all = remote.pull_since(None).await.expect("pull all");
    assert_eq!(all.len(), 3);
    assert_eq!(all[0].id, id1);
    assert_eq!(all[1].id, id2);
    assert_eq!(all[2].id, id3);

    // Pull since id1
    let since_id1 = remote.pull_since(Some(id1)).await.expect("pull since id1");
    assert_eq!(since_id1.len(), 2);
    assert_eq!(since_id1[0].id, id2);
    assert_eq!(since_id1[1].id, id3);

    // Pull since id3 (nothing new)
    let since_id3 = remote.pull_since(Some(id3)).await.expect("pull since id3");
    assert!(since_id3.is_empty());
}

#[tokio::test]
async fn test_sync_queue_outbox_drain() {
    let local_store = Arc::new(SqliteCommitStore::open_in_memory().expect("local db"));
    let mem_store = Arc::new(InMemory::new());
    let remote = S3RemoteStore::new(mem_store);

    let id1 = CommitId::new();
    let id2 = CommitId::new();

    let c1 = Commit::new(
        id1,
        None,
        OffsetDateTime::now_utc(),
        "alice",
        "C1",
        MediaHash::compute(b"1"),
        vec![],
    );
    let c2 = Commit::new(
        id2,
        Some(id1),
        OffsetDateTime::now_utc(),
        "alice",
        "C2",
        MediaHash::compute(b"2"),
        vec![],
    );

    local_store.append(c1).expect("append c1");
    local_store.append(c2).expect("append c2");

    let mut queue = SyncQueue::new();
    assert!(queue.is_empty());

    queue.enqueue(id1);
    queue.enqueue(id2);
    queue.enqueue(id1); // duplicate should be ignored

    assert_eq!(queue.pending_count(), 2);

    let drained = queue
        .drain(&remote, local_store.as_ref())
        .await
        .expect("drain queue");
    assert_eq!(drained, 2);
    assert!(queue.is_empty());

    // Verify remote received both commits
    let remote_commits = remote.pull_since(None).await.expect("pull");
    assert_eq!(remote_commits.len(), 2);
}

#[tokio::test]
async fn test_sync_engine_offline_and_drain() {
    let local_store = Arc::new(SqliteCommitStore::open_in_memory().expect("local db"));
    let mem_store = Arc::new(InMemory::new());
    let remote = Arc::new(S3RemoteStore::new(mem_store));

    let engine = SyncEngine::new(
        remote.clone(),
        local_store.clone(),
        "s3://splice-cloud-backups",
    );

    // Initially synced
    let status = engine.status().await;
    assert_eq!(status.state, SyncState::Synced);
    assert_eq!(status.pending_count, 0);

    // Go offline
    engine.set_offline(true);
    let status = engine.status().await;
    assert_eq!(status.state, SyncState::Offline);

    // Enqueue commit while offline
    let id1 = CommitId::new();
    let c1 = Commit::new(
        id1,
        None,
        OffsetDateTime::now_utc(),
        "alice",
        "Offline save",
        MediaHash::compute(b"offline"),
        vec![],
    );
    local_store.append(c1).expect("append c1");
    engine.enqueue(id1).await;

    let status = engine.status().await;
    assert_eq!(status.state, SyncState::Offline);
    assert_eq!(status.pending_count, 1);

    // Go back online
    engine.set_offline(false);

    // Trigger sync
    let drained = engine.trigger_sync_now().await.expect("sync now");
    assert_eq!(drained, 1);

    let status = engine.status().await;
    assert_eq!(status.state, SyncState::Synced);
    assert_eq!(status.pending_count, 0);
    assert!(status.last_synced_at.is_some());
}

#[tokio::test]
async fn test_lazy_media_sync() {
    let mem_store = Arc::new(InMemory::new());
    let remote = S3RemoteStore::new(mem_store);

    let hash = MediaHash::compute(b"test video raw data");
    let data = bytes::Bytes::from_static(b"video chunk binary payload");

    assert!(!remote.has_media(&hash).await.expect("has media"));

    remote
        .push_media(&hash, data.clone())
        .await
        .expect("push media");

    assert!(remote.has_media(&hash).await.expect("has media"));

    let pulled = remote.pull_media(&hash).await.expect("pull media");
    assert_eq!(pulled, Some(data));
}
