use std::time::Duration;

use serde::{Deserialize, Serialize};
use splice_commit::timeline::duration_seconds;
use splice_media::MediaHash;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ClipRef {
    pub media: MediaHash,
    pub track_index: usize,
    pub clip_index: usize,
}

impl ClipRef {
    pub fn new(media: MediaHash, track_index: usize, clip_index: usize) -> Self {
        Self {
            media,
            track_index,
            clip_index,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimeRange {
    #[serde(with = "duration_seconds")]
    pub in_point: Duration,
    #[serde(with = "duration_seconds")]
    pub out_point: Duration,
    #[serde(with = "duration_seconds")]
    pub position: Duration,
}

impl TimeRange {
    pub fn new(in_point: Duration, out_point: Duration, position: Duration) -> Self {
        Self {
            in_point,
            out_point,
            position,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TimelineDiff {
    pub added: Vec<ClipRef>,
    pub removed: Vec<ClipRef>,
    pub moved: Vec<(ClipRef, TimeRange, TimeRange)>,
    pub effects_changed: Vec<ClipRef>,
    pub summary: String,
}

impl TimelineDiff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty()
            && self.removed.is_empty()
            && self.moved.is_empty()
            && self.effects_changed.is_empty()
    }
}
