use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use splice_api::seed::seed_if_empty;
use splice_api::{
    CommitResponse, NewCommitRequest, RevertMode, RevertPayload, TagRequest, Timeline,
    UploadResponse, router,
};
use splice_commit::{CommitId, CommitStore, SqliteCommitStore, Tag};
use splice_media::{FsMediaStore, MediaHash};
use splice_render::{FfmpegThumbnailer, FsThumbnailCache};
use tempfile::tempdir;
use tower::ServiceExt;

#[tokio::test]
async fn test_api_empty_commits() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let commit_store = Arc::new(SqliteCommitStore::open_in_memory().expect("open memory db"));
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/commits")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .expect("response");

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let commits: Vec<CommitResponse> = serde_json::from_slice(&body).expect("deserialize commits");
    assert!(commits.is_empty());
}

#[tokio::test]
async fn test_api_create_and_list_commits() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let commit_store = Arc::new(SqliteCommitStore::open_in_memory().expect("open memory db"));
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    let req_body = NewCommitRequest {
        parent: None,
        author: "alice".to_string(),
        message: "First commit via API".to_string(),
        timeline_hash: MediaHash::compute(b"timeline_api_1"),
        media_refs: vec![MediaHash::compute(b"clip_api_1")],
        timeline_raw: None,
    };

    let post_req = Request::builder()
        .method("POST")
        .uri("/commits")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&req_body).unwrap()))
        .unwrap();

    let post_res = app.clone().oneshot(post_req).await.expect("post response");
    assert_eq!(post_res.status(), StatusCode::CREATED);

    let post_body = to_bytes(post_res.into_body(), usize::MAX).await.unwrap();
    let created_id: CommitId = serde_json::from_slice(&post_body).expect("parse commit id");

    let get_req = Request::builder()
        .uri("/commits")
        .body(Body::empty())
        .unwrap();

    let get_res = app.oneshot(get_req).await.expect("get response");
    assert_eq!(get_res.status(), StatusCode::OK);

    let get_body = to_bytes(get_res.into_body(), usize::MAX).await.unwrap();
    let commits: Vec<CommitResponse> =
        serde_json::from_slice(&get_body).expect("parse commits list");
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].id, created_id);
    assert_eq!(commits[0].message, "First commit via API");
    assert_eq!(commits[0].tags, Vec::<String>::new());
}

#[tokio::test]
async fn test_api_seed_and_list_50_commits() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");
    let seeded = seed_if_empty(&store_raw).expect("seed commits");
    assert_eq!(seeded, 50);

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    let get_req = Request::builder()
        .uri("/commits")
        .body(Body::empty())
        .unwrap();

    let get_res = app.oneshot(get_req).await.expect("get response");
    assert_eq!(get_res.status(), StatusCode::OK);

    let get_body = to_bytes(get_res.into_body(), usize::MAX).await.unwrap();
    let commits: Vec<CommitResponse> =
        serde_json::from_slice(&get_body).expect("parse commits list");
    assert_eq!(commits.len(), 50);
    assert_eq!(commits[0].message, "Final master render export");
    assert_eq!(commits[49].message, "Initial timeline creation");
}

#[tokio::test]
async fn test_api_revert_preview_mode() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");
    seed_if_empty(&store_raw).expect("seed commits");
    let commits = store_raw.chain_from_head().expect("get commits");
    let target_commit = &commits[25];
    let head_commit_before = store_raw.head_id().expect("head id").unwrap();

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store.clone(), media_store, thumb_cache, thumbnailer);

    let revert_req = Request::builder()
        .method("POST")
        .uri(format!("/commits/{}/revert?mode=preview", target_commit.id))
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(revert_req).await.expect("revert response");
    assert_eq!(res.status(), StatusCode::OK);

    let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let timeline: Timeline = serde_json::from_slice(&body).expect("parse timeline json");

    assert_eq!(timeline.commit_id, target_commit.id);
    assert_eq!(timeline.message, target_commit.message);
    assert_eq!(timeline.mode, RevertMode::Preview);
    assert!(!timeline.is_head);

    // INFO: Verify HEAD was not modified in preview mode
    let head_commit_after = commit_store.head_id().expect("head id").unwrap();
    assert_eq!(head_commit_before, head_commit_after);
}

#[tokio::test]
async fn test_api_revert_restore_mode() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");
    seed_if_empty(&store_raw).expect("seed commits");
    let commits = store_raw.chain_from_head().expect("get commits");
    let target_commit = &commits[10];

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store.clone(), media_store, thumb_cache, thumbnailer);

    let revert_req = Request::builder()
        .method("POST")
        .uri(format!("/commits/{}/revert?mode=restore", target_commit.id))
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(revert_req).await.expect("revert response");
    assert_eq!(res.status(), StatusCode::OK);

    let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    let timeline: Timeline = serde_json::from_slice(&body).expect("parse timeline json");

    assert_eq!(timeline.commit_id, target_commit.id);
    assert_eq!(timeline.mode, RevertMode::Restore);
    assert!(timeline.is_head);

    // INFO: Verify HEAD was updated to the restored commit
    let head_commit_after = commit_store.head_id().expect("head id").unwrap();
    assert_eq!(head_commit_after, target_commit.id);
}

#[tokio::test]
async fn test_api_stash_before_revert() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");
    seed_if_empty(&store_raw).expect("seed commits");
    let initial_count = store_raw.chain_from_head().expect("chain").len();

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store.clone(), media_store, thumb_cache, thumbnailer);

    let commits = commit_store.chain_from_head().expect("chain");
    let target_commit_id = commits[5].id;

    let payload = RevertPayload {
        mode: Some(RevertMode::Restore),
        uncommitted_changes: Some(NewCommitRequest {
            parent: None,
            author: "editor".to_string(),
            message: "Unsaved local color tweaks".to_string(),
            timeline_hash: MediaHash::compute(b"dirty timeline state"),
            media_refs: vec![],
            timeline_raw: None,
        }),
    };

    let req = Request::builder()
        .method("POST")
        .uri(format!("/commits/{target_commit_id}/revert"))
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&payload).unwrap()))
        .unwrap();

    let res = app.oneshot(req).await.expect("revert response");
    assert_eq!(res.status(), StatusCode::OK);

    let head = commit_store.head_id().expect("head id").unwrap();
    assert_eq!(head, target_commit_id);

    let all_commits = commit_store.chain_from_head().expect("chain");
    assert_eq!(all_commits.len(), initial_count - 5);
}

#[tokio::test]
async fn test_api_upload_and_serve_media() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let commit_store = Arc::new(SqliteCommitStore::open_in_memory().expect("open memory db"));
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    let boundary = "---------------------------1234567890";
    let body_content = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"video.mp4\"\r\nContent-Type: video/mp4\r\n\r\nfake video stream content\r\n--{boundary}--\r\n"
    );

    let upload_req = Request::builder()
        .method("POST")
        .uri("/media")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(Body::from(body_content))
        .unwrap();

    let upload_res = app
        .clone()
        .oneshot(upload_req)
        .await
        .expect("upload response");
    assert_eq!(upload_res.status(), StatusCode::OK);

    let upload_body = to_bytes(upload_res.into_body(), usize::MAX).await.unwrap();
    let upload_resp: UploadResponse =
        serde_json::from_slice(&upload_body).expect("parse upload json");

    assert_eq!(
        upload_resp.hash,
        MediaHash::compute(b"fake video stream content")
    );
    assert!(upload_resp.duration > 0.0);

    // Now test GET /media/{hash} to stream back the uploaded file
    let serve_req = Request::builder()
        .method("GET")
        .uri(format!("/media/{}", upload_resp.hash))
        .body(Body::empty())
        .unwrap();

    let serve_res = app.oneshot(serve_req).await.expect("serve response");
    assert_eq!(serve_res.status(), StatusCode::OK);

    let served_bytes = to_bytes(serve_res.into_body(), usize::MAX).await.unwrap();
    assert_eq!(served_bytes.as_ref(), b"fake video stream content");
}

#[tokio::test]
async fn test_api_thumbnails_and_tags() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");
    seed_if_empty(&store_raw).expect("seed");
    let commits = store_raw.chain_from_head().expect("commits");
    let target_id = commits[0].id;

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    // Test thumbnail endpoint
    let thumb_req = Request::builder()
        .method("GET")
        .uri(format!("/commits/{target_id}/thumbnail"))
        .body(Body::empty())
        .unwrap();

    let thumb_res = app
        .clone()
        .oneshot(thumb_req)
        .await
        .expect("thumb response");
    assert_eq!(thumb_res.status(), StatusCode::OK);
    assert_eq!(
        thumb_res.headers().get("content-type").unwrap(),
        "image/jpeg"
    );

    // Test adding tag "Picture Lock"
    let tag_req = Request::builder()
        .method("POST")
        .uri(format!("/commits/{target_id}/tags"))
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_vec(&TagRequest {
                label: "Picture Lock".to_string(),
            })
            .unwrap(),
        ))
        .unwrap();

    let tag_res = app.clone().oneshot(tag_req).await.expect("tag res");
    assert_eq!(tag_res.status(), StatusCode::CREATED);

    // List all tags
    let all_tags_req = Request::builder()
        .method("GET")
        .uri("/tags")
        .body(Body::empty())
        .unwrap();

    let all_tags_res = app
        .clone()
        .oneshot(all_tags_req)
        .await
        .expect("all tags res");
    assert_eq!(all_tags_res.status(), StatusCode::OK);

    let all_tags_body = to_bytes(all_tags_res.into_body(), usize::MAX)
        .await
        .unwrap();
    let tags: Vec<Tag> = serde_json::from_slice(&all_tags_body).expect("parse tags");
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].label, "Picture Lock");

    // Delete tag
    let del_tag_req = Request::builder()
        .method("DELETE")
        .uri(format!("/commits/{target_id}/tags/Picture%20Lock"))
        .body(Body::empty())
        .unwrap();

    let del_res = app.oneshot(del_tag_req).await.expect("del tag");
    assert_eq!(del_res.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn test_api_diff_between_commits() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");

    let hash1 = MediaHash::compute(b"clip_1");
    let hash2 = MediaHash::compute(b"clip_2");

    let commit_a = splice_commit::Commit::create(
        None,
        "editor",
        "Base commit with clip 1",
        MediaHash::compute(b"t_a"),
        vec![hash1],
    );
    let id_a = store_raw.append(commit_a).expect("append a");

    let commit_b = splice_commit::Commit::create(
        Some(id_a),
        "editor",
        "Added clip 2 and kept clip 1",
        MediaHash::compute(b"t_b"),
        vec![hash1, hash2],
    );
    let id_b = store_raw.append(commit_b).expect("append b");

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    let diff_req = Request::builder()
        .method("GET")
        .uri(format!("/commits/diff?from={id_a}&to={id_b}"))
        .body(Body::empty())
        .unwrap();

    let diff_res = app.oneshot(diff_req).await.expect("diff response");
    assert_eq!(diff_res.status(), StatusCode::OK);

    let body = to_bytes(diff_res.into_body(), usize::MAX).await.unwrap();
    let diff_result: splice_diff::TimelineDiff =
        serde_json::from_slice(&body).expect("parse diff json");

    assert_eq!(diff_result.added.len(), 1);
    assert_eq!(diff_result.removed.len(), 0);
    assert!(diff_result.summary.contains("Added 1 clip"));
}

#[tokio::test]
async fn test_api_save_as_new_version_and_tree_endpoint() {
    let dir = tempdir().expect("tempdir");
    let media_store = Arc::new(FsMediaStore::init(dir.path().join("media")).expect("media store"));
    let thumb_cache = FsThumbnailCache::init(dir.path().join("thumbs")).expect("thumb cache");
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());
    let store_raw = SqliteCommitStore::open_in_memory().expect("open memory db");

    let root_commit = splice_commit::Commit::create(
        None,
        "director",
        "Root v1.0",
        MediaHash::compute(b"t_root"),
        vec![],
    );
    let root_id = store_raw.append(root_commit).expect("append root");

    let commit_store = Arc::new(store_raw);
    let app = router(commit_store, media_store, thumb_cache, thumbnailer);

    // Save as new version (branching off root_id)
    let save_as_payload = splice_api::SaveAsRequest {
        from: root_id,
        message: "Director's Cut Alternate Version".to_string(),
        author: Some("director@splice.dev".to_string()),
        timeline_hash: None,
        media_refs: None,
        timeline_raw: None,
    };

    let save_as_req = Request::builder()
        .method("POST")
        .uri("/commits/save-as")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&save_as_payload).unwrap()))
        .unwrap();

    let save_as_res = app.clone().oneshot(save_as_req).await.expect("save-as res");
    assert_eq!(save_as_res.status(), StatusCode::CREATED);

    let save_as_body = to_bytes(save_as_res.into_body(), usize::MAX).await.unwrap();
    let new_branch_id: splice_commit::CommitId =
        serde_json::from_slice(&save_as_body).expect("parse id");

    // Fetch tree
    let tree_req = Request::builder()
        .method("GET")
        .uri("/commits/tree")
        .body(Body::empty())
        .unwrap();

    let tree_res = app.oneshot(tree_req).await.expect("tree res");
    assert_eq!(tree_res.status(), StatusCode::OK);

    let tree_body = to_bytes(tree_res.into_body(), usize::MAX).await.unwrap();
    let tree: Vec<splice_commit::CommitTreeNode> =
        serde_json::from_slice(&tree_body).expect("parse tree");

    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].commit.id, root_id);
    assert_eq!(tree[0].children.len(), 1);
    assert_eq!(tree[0].children[0].commit.id, new_branch_id);
}
