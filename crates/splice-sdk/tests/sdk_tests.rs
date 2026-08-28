use std::fs;
use std::time::Duration;

use splice_sdk::{
    Clip, ExportFormat, MediaHash, ResolveSerializer, RetentionPolicy, RevertMode, Splice,
    SpliceConfig, Timeline, Track,
};
use tempfile::tempdir;

#[test]
fn test_sdk_in_memory_and_save_workflow() {
    let splice = Splice::in_memory().expect("in-memory splice initialization");

    let h1 = MediaHash::compute(b"media_content_1");
    let clip1 = Clip::new(
        h1,
        Duration::from_secs(0),
        Duration::from_secs(5),
        Duration::from_secs(0),
    );
    let track1 = Track::new(vec![clip1]);
    let timeline1 = Timeline::new(vec![track1]);

    let cid1 = splice
        .save(timeline1.clone(), "Initial commit")
        .expect("save commit 1");

    let head = splice.head().expect("head").expect("head exists");
    assert_eq!(head.id, cid1);
    assert_eq!(head.message, "Initial commit");

    let history = splice.history().expect("history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, cid1);

    let h2 = MediaHash::compute(b"media_content_2");
    let clip2 = Clip::new(
        h2,
        Duration::from_secs(5),
        Duration::from_secs(10),
        Duration::from_secs(5),
    );
    let track2 = Track::new(vec![clip2]);
    let timeline2 = Timeline::new(vec![track2]);

    let cid2 = splice
        .save(timeline2.clone(), "Second commit")
        .expect("save commit 2");

    let head2 = splice.head().expect("head").expect("head exists");
    assert_eq!(head2.id, cid2);
    assert_eq!(head2.parent, Some(cid1));

    let history2 = splice.history().expect("history");
    assert_eq!(history2.len(), 2);
    assert_eq!(history2[0].id, cid2);
    assert_eq!(history2[1].id, cid1);
}

#[test]
fn test_sdk_diff_and_revert() {
    let splice = Splice::in_memory().expect("in-memory splice initialization");

    let h1 = MediaHash::compute(b"media_a");
    let c1 = Clip::new(
        h1,
        Duration::from_secs(0),
        Duration::from_secs(4),
        Duration::from_secs(0),
    );
    let tl1 = Timeline::new(vec![Track::new(vec![c1.clone()])]);
    let cid1 = splice.save(tl1, "Version 1").expect("save v1");

    let c2 = Clip::new(
        h1,
        Duration::from_secs(4),
        Duration::from_secs(8),
        Duration::from_secs(4),
    );
    let tl2 = Timeline::new(vec![Track::new(vec![c1, c2])]);
    let cid2 = splice.save(tl2, "Version 2").expect("save v2");

    let diff_result = splice.diff(cid1, cid2).expect("diff");
    assert_eq!(diff_result.added.len(), 1);
    assert_eq!(diff_result.added[0].media, h1);
    assert_eq!(diff_result.removed.len(), 0);

    let preview_tl = splice
        .revert(cid1, RevertMode::Preview)
        .expect("revert preview");
    assert_eq!(preview_tl.tracks[0].clips.len(), 1);

    let current_head = splice.head().expect("head").expect("head exists");
    assert_eq!(current_head.id, cid2);

    let restored_tl = splice
        .revert(cid1, RevertMode::Restore)
        .expect("revert restore");
    assert_eq!(restored_tl.tracks[0].clips.len(), 1);

    let restored_head = splice.head().expect("head").expect("head exists");
    assert_eq!(restored_head.id, cid1);
}

#[test]
fn test_sdk_tags_and_tree() {
    let splice = Splice::in_memory().expect("in-memory splice initialization");

    let h1 = MediaHash::compute(b"media_x");
    let tl = Timeline::new(vec![Track::new(vec![Clip::new(
        h1,
        Duration::from_secs(0),
        Duration::from_secs(2),
        Duration::from_secs(0),
    )])]);

    let cid = splice.save(tl, "Tagged commit").expect("save");

    splice.tag(cid, "v1.0.0").expect("add tag v1.0.0");
    splice.tag(cid, "release").expect("add tag release");

    let tags = splice.get_tags(&cid).expect("get tags");
    assert_eq!(tags.len(), 2);
    assert!(tags.contains(&"v1.0.0".to_string()));
    assert!(tags.contains(&"release".to_string()));

    let all_tags = splice.list_tags().expect("list tags");
    assert_eq!(all_tags.len(), 2);

    let tree = splice.tree().expect("tree");
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].commit.id, cid);
    assert_eq!(tree[0].tags.len(), 2);

    splice.remove_tag(cid, "v1.0.0").expect("remove tag");
    let remaining_tags = splice.get_tags(&cid).expect("get tags");
    assert_eq!(remaining_tags.len(), 1);
    assert_eq!(remaining_tags[0], "release");
}

#[test]
fn test_sdk_export_and_proxy() {
    let tmp = tempdir().expect("tempdir");
    let config = SpliceConfig::new(tmp.path().join("splice_repo")).with_author("Export Tester");

    let splice = Splice::new(config).expect("splice new");

    let media_file = tmp.path().join("sample.mp4");
    fs::write(&media_file, b"fake video stream").expect("write fake media");

    let media_hash = splice.ingest_media(&media_file).expect("ingest media");
    let resolved_path = splice.get_media_path(&media_hash);
    assert!(resolved_path.is_some());

    let clip = Clip::new(
        media_hash,
        Duration::from_secs(0),
        Duration::from_secs(3),
        Duration::from_secs(0),
    );
    let timeline = Timeline::new(vec![Track::new(vec![clip])]);

    let cid = splice
        .save(timeline.clone(), "Exportable commit")
        .expect("save");

    let proxy_path = splice.render_proxy(&timeline).expect("render proxy");
    assert!(proxy_path.exists());

    let export_path = splice
        .export(cid, ExportFormat::H264)
        .expect("export commit");
    assert!(export_path.exists());

    let direct_export = splice
        .export_timeline(&timeline, ExportFormat::ProRes)
        .expect("export direct timeline");
    assert!(direct_export.exists());
}

#[test]
fn test_sdk_gc_and_squash() {
    let splice = Splice::in_memory().expect("in-memory splice initialization");

    let h1 = MediaHash::compute(b"gc_media_1");
    let tl1 = Timeline::new(vec![Track::new(vec![Clip::new(
        h1,
        Duration::from_secs(0),
        Duration::from_secs(1),
        Duration::from_secs(0),
    )])]);
    let cid1 = splice.save(tl1, "Commit 1").expect("save 1");

    let h2 = MediaHash::compute(b"gc_media_2");
    let tl2 = Timeline::new(vec![Track::new(vec![Clip::new(
        h2,
        Duration::from_secs(0),
        Duration::from_secs(1),
        Duration::from_secs(0),
    )])]);
    let cid2 = splice.save(tl2, "Commit 2").expect("save 2");

    let squashed_id = splice
        .squash(&[cid1, cid2], "Squashed release")
        .expect("squash commits");

    let squashed_commit = splice.get_commit(&squashed_id).expect("get squashed");
    assert_eq!(squashed_commit.message, "Squashed release");

    let policy = RetentionPolicy {
        keep_starred_forever: true,
        prune_after: Duration::from_secs(0),
    };

    let estimate = splice.estimate_gc(&policy).expect("estimate gc");
    assert!(estimate.commits_scanned >= 1);

    let report = splice.gc(&policy).expect("gc");
    assert!(report.commits_scanned >= 1);
}

#[test]
fn test_sdk_adapter_and_custom_serializer() {
    let resolve_adapter = ResolveSerializer::with_fps(24.0);
    let tmp = tempdir().expect("tempdir");
    let config = SpliceConfig::new(tmp.path().join("splice_resolve")).with_adapter(resolve_adapter);

    let splice = Splice::new(config).expect("splice new");

    let h = MediaHash::compute(b"resolve_media");
    let clip = Clip::new(
        h,
        Duration::from_secs(0),
        Duration::from_secs(5),
        Duration::from_secs(0),
    );
    let timeline = Timeline::new(vec![Track::new(vec![clip])]);

    let project_bytes = splice
        .to_native_project(&timeline)
        .expect("to resolve project");
    assert!(!project_bytes.is_empty());

    let parsed_timeline = splice
        .from_native_project(&project_bytes)
        .expect("from resolve project");
    assert_eq!(parsed_timeline.tracks.len(), 1);
    assert_eq!(parsed_timeline.tracks[0].clips.len(), 1);
}

#[test]
fn test_ship_condition_clean_blackbox_surface_only_splice_sdk() {
    // CRITICAL: This test imports ONLY from splice_sdk::* to verify that
    // external callers never need internal crates like splice-commit, splice-media, etc.
    let tmp = tempdir().expect("tempdir");
    let config =
        SpliceConfig::new(tmp.path().join("blackbox_repo")).with_author("Blackbox Integrator");

    let splice = Splice::new(config).expect("create blackbox splice");

    let sample_file = tmp.path().join("clip.mp4");
    fs::write(&sample_file, b"blackbox video data").expect("write sample");
    let hash = splice.ingest_media(&sample_file).expect("ingest");

    let clip = Clip::new(
        hash,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(0),
    );
    let track = Track::new(vec![clip]);
    let timeline = Timeline::new(vec![track]);

    let commit_id = splice
        .save(timeline.clone(), "Blackbox commit")
        .expect("save");

    let history = splice.history().expect("history");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, commit_id);

    let exported = splice
        .export(commit_id, ExportFormat::H264)
        .expect("export");
    assert!(exported.exists());

    let diff_same = splice.diff(commit_id, commit_id).expect("diff same");
    assert!(diff_same.is_empty());
}
