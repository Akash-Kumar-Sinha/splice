use serde::{Deserialize, Serialize};
use splice_sdk::{
    Clip as SdkClip, Commit, CommitId, MediaHash, MediaStore, Timeline as SdkTimeline,
    Track as SdkTrack,
};
use time::OffsetDateTime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RevertMode {
    #[default]
    Preview,
    Restore,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimelineClip {
    pub id: String,
    pub name: String,
    pub media_hash: MediaHash,
    pub start_time: f64,
    pub duration: f64,
    pub track_index: usize,
    #[serde(default)]
    pub in_point: f64,
    #[serde(default)]
    pub out_point: f64,
}


#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimelineTrack {
    pub id: String,
    pub name: String,
    pub track_type: String,
    pub clips: Vec<TimelineClip>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawEditorClip {
    pub id: String,
    pub media: String,
    pub in_point: f64,
    pub out_point: f64,
    pub position: f64,
    pub name: String,
    #[serde(default)]
    pub original_duration: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawEditorTrack {
    pub id: String,
    pub clips: Vec<RawEditorClip>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawEditorState {
    pub tracks: Vec<RawEditorTrack>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Timeline {
    pub commit_id: CommitId,
    pub parent_id: Option<CommitId>,
    pub timeline_hash: MediaHash,
    pub message: String,
    pub author: String,
    #[serde(with = "time::serde::rfc3339")]
    pub timestamp: OffsetDateTime,
    pub tracks: Vec<TimelineTrack>,
    pub media_refs: Vec<MediaHash>,
    pub mode: RevertMode,
    pub is_head: bool,
    pub total_duration: f64,
}

impl Timeline {
    pub fn from_raw_state(
        commit: &Commit,
        raw_state: &RawEditorState,
        mode: RevertMode,
        is_head: bool,
    ) -> Self {
        let mut total_duration = 0.0;
        let mut tracks = Vec::new();

        for (t_idx, raw_track) in raw_state.tracks.iter().enumerate() {
            let mut clips = Vec::new();
            for raw_clip in &raw_track.clips {
                let duration = (raw_clip.out_point - raw_clip.in_point).max(0.1);
                let media_hash = MediaHash::from_hex(&raw_clip.media)
                    .unwrap_or_else(|_| MediaHash::compute(raw_clip.media.as_bytes()));

                clips.push(TimelineClip {
                    id: raw_clip.id.clone(),
                    name: raw_clip.name.clone(),
                    media_hash,
                    start_time: raw_clip.position,
                    duration,
                    track_index: t_idx,
                    in_point: raw_clip.in_point,
                    out_point: raw_clip.out_point,
                });

                if raw_clip.position + duration > total_duration {
                    total_duration = raw_clip.position + duration;
                }
            }

            tracks.push(TimelineTrack {
                id: raw_track.id.clone(),
                name: format!("Video Track {}", t_idx + 1),
                track_type: "video".to_string(),
                clips,
            });
        }

        Self {
            commit_id: commit.id,
            parent_id: commit.parent,
            timeline_hash: commit.timeline_hash,
            message: commit.message.clone(),
            author: commit.author.clone(),
            timestamp: commit.timestamp,
            tracks,
            media_refs: commit.media_refs.clone(),
            mode,
            is_head,
            total_duration: total_duration.max(0.1),
        }
    }

    pub fn to_splice_commit_timeline(&self) -> SdkTimeline {
        let mut tracks = Vec::new();
        for t in &self.tracks {
            let mut clips = Vec::new();
            for c in &t.clips {
                clips.push(SdkClip::new(
                    c.media_hash,
                    std::time::Duration::from_secs_f64(c.in_point),
                    std::time::Duration::from_secs_f64(c.out_point),
                    std::time::Duration::from_secs_f64(c.start_time),
                ));
            }
            tracks.push(SdkTrack::new(clips));
        }
        SdkTimeline::new(tracks)
    }

    pub fn reconstruct(
        commit: &Commit,
        mode: RevertMode,
        is_head: bool,
        media_store: Option<&dyn MediaStore>,
    ) -> Self {
        let mut video_clips = Vec::new();
        let mut current_video_time = 0.0;

        for (idx, media_hash) in commit.media_refs.iter().enumerate() {
            let clip_duration = if let Some(store) = media_store {
                if let Some(path) = store.resolve(media_hash) {
                    crate::probe_duration(&path)
                } else {
                    10.0
                }
            } else {
                10.0
            };

            video_clips.push(TimelineClip {
                id: format!("clip-v-{}", idx + 1),
                name: format!("Video Clip #{}", idx + 1),
                media_hash: *media_hash,
                start_time: current_video_time,
                duration: clip_duration,
                track_index: 0,
                in_point: 0.0,
                out_point: clip_duration,
            });
            current_video_time += clip_duration;
        }

        if commit.media_refs.is_empty() {
            video_clips.push(TimelineClip {
                id: "clip-v-root".to_string(),
                name: "Primary Composition".to_string(),
                media_hash: commit.timeline_hash,
                start_time: 0.0,
                duration: 10.0,
                track_index: 0,
                in_point: 0.0,
                out_point: 10.0,
            });
            current_video_time = 10.0;
        }


        let total_duration = current_video_time.max(0.1);

        let tracks = vec![TimelineTrack {
            id: "track-v1".to_string(),
            name: "Video 1 (Primary Track)".to_string(),
            track_type: "video".to_string(),
            clips: video_clips,
        }];

        Self {
            commit_id: commit.id,
            parent_id: commit.parent,
            timeline_hash: commit.timeline_hash,
            message: commit.message.clone(),
            author: commit.author.clone(),
            timestamp: commit.timestamp,
            tracks,
            media_refs: commit.media_refs.clone(),
            mode,
            is_head,
            total_duration,
        }
    }
}
