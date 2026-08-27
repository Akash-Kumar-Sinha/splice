use serde::{Deserialize, Serialize};
use splice_commit::{Commit, CommitId};
use splice_media::MediaHash;
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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimelineTrack {
    pub id: String,
    pub name: String,
    pub track_type: String,
    pub clips: Vec<TimelineClip>,
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
    pub fn reconstruct(commit: &Commit, mode: RevertMode, is_head: bool) -> Self {
        let mut video_clips = Vec::new();
        let mut audio_clips = Vec::new();

        let mut current_video_time = 0.0;
        let mut current_audio_time = 0.0;

        for (idx, media_hash) in commit.media_refs.iter().enumerate() {
            let clip_duration = 5.0 + ((media_hash.as_bytes()[0] % 10) as f64);
            if idx % 2 == 0 {
                video_clips.push(TimelineClip {
                    id: format!("clip-v-{}", idx + 1),
                    name: format!("Video Segment #{}", idx + 1),
                    media_hash: *media_hash,
                    start_time: current_video_time,
                    duration: clip_duration,
                    track_index: 0,
                });
                current_video_time += clip_duration;
            } else {
                audio_clips.push(TimelineClip {
                    id: format!("clip-a-{}", idx + 1),
                    name: format!("Audio Track #{}", idx + 1),
                    media_hash: *media_hash,
                    start_time: current_audio_time,
                    duration: clip_duration,
                    track_index: 1,
                });
                current_audio_time += clip_duration;
            }
        }

        if commit.media_refs.is_empty() {
            video_clips.push(TimelineClip {
                id: "clip-v-root".to_string(),
                name: "Primary Timeline Composition".to_string(),
                media_hash: commit.timeline_hash,
                start_time: 0.0,
                duration: 10.0,
                track_index: 0,
            });
            current_video_time = 10.0;
        }

        let total_duration = current_video_time.max(current_audio_time).max(10.0);

        let tracks = vec![
            TimelineTrack {
                id: "track-v1".to_string(),
                name: "Video 1 (Primary)".to_string(),
                track_type: "video".to_string(),
                clips: video_clips,
            },
            TimelineTrack {
                id: "track-a1".to_string(),
                name: "Audio 1 (Master Stereo)".to_string(),
                track_type: "audio".to_string(),
                clips: audio_clips,
            },
        ];

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
