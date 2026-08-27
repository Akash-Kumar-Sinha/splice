use std::time::Duration;

use splice_adapter::{GenericSerializer, ResolveProject, ResolveSerializer, TimelineSerializer};
use splice_commit::{Clip, Commit, CommitStore, SqliteCommitStore, Timeline, Track};
use splice_diff::diff;
use splice_media::MediaHash;

fn create_sample_timeline() -> Timeline {
    let hash1 = MediaHash::compute(b"video_asset_1");
    let hash2 = MediaHash::compute(b"video_asset_2");

    let clip1 = Clip::new(
        hash1,
        Duration::from_secs(0),
        Duration::from_secs(10),
        Duration::from_secs(0),
    );
    let clip2 = Clip::new(
        hash2,
        Duration::from_secs(2),
        Duration::from_secs(8),
        Duration::from_secs(10),
    );

    let track1 = Track::new(vec![clip1, clip2]);
    Timeline::new(vec![track1])
}

#[test]
fn test_generic_serializer_roundtrip() {
    let serializer = GenericSerializer::new();
    let original_timeline = create_sample_timeline();

    let bytes = serializer
        .from_timeline(&original_timeline)
        .expect("serialize generic timeline");
    assert!(!bytes.is_empty());

    let deserialized_timeline = serializer
        .to_timeline(&bytes)
        .expect("deserialize generic timeline");
    assert_eq!(original_timeline, deserialized_timeline);
    assert_eq!(
        original_timeline.compute_hash(),
        deserialized_timeline.compute_hash()
    );
}

#[test]
fn test_resolve_serializer_roundtrip() {
    let serializer = ResolveSerializer::with_fps(30.0);
    let original_timeline = create_sample_timeline();

    let bytes = serializer
        .from_timeline(&original_timeline)
        .expect("serialize resolve timeline");
    assert!(!bytes.is_empty());

    let resolve_proj: ResolveProject =
        serde_json::from_slice(&bytes).expect("parse resolve project json");
    assert_eq!(resolve_proj.application, "DaVinci Resolve");
    assert_eq!(resolve_proj.frame_rate, 30.0);
    assert_eq!(resolve_proj.tracks.len(), 1);
    assert_eq!(resolve_proj.tracks[0].items.len(), 2);

    let deserialized_timeline = serializer
        .to_timeline(&bytes)
        .expect("deserialize resolve timeline");

    assert_eq!(
        original_timeline.tracks.len(),
        deserialized_timeline.tracks.len()
    );
    assert_eq!(
        original_timeline.total_duration(),
        deserialized_timeline.total_duration()
    );
    assert_eq!(
        original_timeline.media_refs(),
        deserialized_timeline.media_refs()
    );
}

#[test]
fn test_resolve_serializer_from_raw_resolve_json() {
    let raw_resolve_json = r#"{
        "schema_version": "davinci-resolve-timeline-v1",
        "application": "DaVinci Resolve Studio",
        "project_name": "Commercial_Edit",
        "timeline_name": "Cut_v01",
        "frame_rate": 24.0,
        "tracks": [
            {
                "track_type": "video",
                "track_index": 1,
                "name": "V1",
                "items": [
                    {
                        "name": "Interview_A.mov",
                        "media_identifier": "raw_footage_clip_a",
                        "record_in_frame": 0,
                        "record_out_frame": 240,
                        "source_in_frame": 48,
                        "source_out_frame": 288,
                        "duration_frames": 240
                    },
                    {
                        "name": "B_Roll.mov",
                        "media_identifier": "raw_footage_clip_b",
                        "record_in_frame": 240,
                        "record_out_frame": 480,
                        "source_in_frame": 0,
                        "source_out_frame": 240,
                        "duration_frames": 240
                    }
                ]
            }
        ]
    }"#;

    let serializer = ResolveSerializer::default();
    let timeline = serializer
        .to_timeline(raw_resolve_json.as_bytes())
        .expect("parse raw resolve json");

    assert_eq!(timeline.tracks.len(), 1);
    assert_eq!(timeline.tracks[0].clips.len(), 2);
    assert_eq!(timeline.tracks[0].clips[0].position, Duration::from_secs(0));
    assert_eq!(timeline.tracks[0].clips[0].in_point, Duration::from_secs(2));
    assert_eq!(
        timeline.tracks[0].clips[0].out_point,
        Duration::from_secs(12)
    );
    assert_eq!(
        timeline.tracks[0].clips[1].position,
        Duration::from_secs(10)
    );
    assert_eq!(timeline.total_duration(), Duration::from_secs(20));
}

fn process_project_adapter<S: TimelineSerializer>(
    serializer: &S,
    native_project_bytes: &[u8],
) -> Result<Timeline, splice_adapter::SerializeError> {
    serializer.to_timeline(native_project_bytes)
}

#[test]
fn test_ship_condition_adapter_swappability_without_modifying_core_crates() {
    let generic_serializer = GenericSerializer::new();
    let resolve_serializer = ResolveSerializer::new();

    let original_timeline = create_sample_timeline();

    let generic_bytes = generic_serializer
        .from_timeline(&original_timeline)
        .expect("serialize generic");
    let resolve_bytes = resolve_serializer
        .from_timeline(&original_timeline)
        .expect("serialize resolve");

    let timeline_from_generic = process_project_adapter(&generic_serializer, &generic_bytes)
        .expect("process generic adapter");
    let timeline_from_resolve = process_project_adapter(&resolve_serializer, &resolve_bytes)
        .expect("process resolve adapter");

    let diff_result = diff(&timeline_from_generic, &timeline_from_resolve);
    assert!(diff_result.is_empty());

    let store = SqliteCommitStore::open_in_memory().expect("create sqlite store");
    let commit1 = Commit::create(
        None,
        "Editor A".to_string(),
        "Initial commit via GenericSerializer".to_string(),
        timeline_from_generic.compute_hash(),
        timeline_from_generic.media_refs(),
    );
    let commit1_id = store.append(commit1).expect("append commit1");

    let commit2 = Commit::create(
        Some(commit1_id),
        "Editor B".to_string(),
        "Second version via ResolveSerializer".to_string(),
        timeline_from_resolve.compute_hash(),
        timeline_from_resolve.media_refs(),
    );
    let commit2_id = store.append(commit2).expect("append commit2");

    let retrieved = store.get(&commit2_id).expect("get commit2");
    assert_eq!(retrieved.parent, Some(commit1_id));
}

#[test]
fn test_dynamic_dispatch_trait_objects() {
    let original_timeline = create_sample_timeline();

    let adapters: Vec<Box<dyn TimelineSerializer>> = vec![
        Box::new(GenericSerializer::new()),
        Box::new(ResolveSerializer::new()),
    ];

    for adapter in &adapters {
        let bytes = adapter
            .from_timeline(&original_timeline)
            .expect("dynamic export");
        let parsed = adapter.to_timeline(&bytes).expect("dynamic import");
        assert_eq!(parsed.total_duration(), original_timeline.total_duration());
    }
}

#[test]
fn test_invalid_data_error_handling() {
    let serializer = GenericSerializer::new();
    let err = serializer.to_timeline(b"invalid json format");
    assert!(err.is_err());

    let resolve_serializer = ResolveSerializer::new();
    let err_resolve = resolve_serializer.to_timeline(b"{ corrupt data }");
    assert!(err_resolve.is_err());
}
