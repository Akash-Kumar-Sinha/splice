use splice_sdk::{Commit, CommitId, CommitStore, MediaHash, StoreError};
use time::OffsetDateTime;

pub fn seed_if_empty(store: &dyn CommitStore) -> Result<usize, StoreError> {
    let existing = store.chain_from_head()?;
    if !existing.is_empty() {
        return Ok(0);
    }

    let mut parent = None;
    let mut count = 0;

    for i in 0..50 {
        let timeline_hash = MediaHash::compute(format!("timeline_state_snapshot_{i}").as_bytes());
        let media_refs = vec![
            MediaHash::compute(format!("video_clip_primary_{i}").as_bytes()),
            MediaHash::compute(format!("audio_track_stereo_{i}").as_bytes()),
        ];

        let message = match i {
            0 => "Initial timeline creation".to_string(),
            1 => "Import 4K source footage".to_string(),
            2 => "Rough cut assembly".to_string(),
            3 => "Add intro sequence".to_string(),
            4 => "Color grade scene 1".to_string(),
            49 => "Final master render export".to_string(),
            _ => format!("Edit iteration #{i}: adjustments and cuts"),
        };

        let commit = Commit::new(
            CommitId::new(),
            parent,
            OffsetDateTime::now_utc(),
            "aks.krsinha@gmail.com",
            message,
            timeline_hash,
            media_refs,
        );

        let id = store.append(commit)?;
        parent = Some(id);
        count += 1;
    }

    Ok(count)
}
