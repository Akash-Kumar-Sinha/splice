use std::collections::HashSet;

use splice_commit::Track;

use crate::types::{ClipRef, TimeRange, TimelineDiff};

pub trait TrackDiffStrategy: Send + Sync {
    fn can_handle(&self, track_type: &str) -> bool;
    fn diff_track(
        &self,
        track_a: Option<&Track>,
        track_b: Option<&Track>,
        track_index: usize,
    ) -> TimelineDiff;
}

#[derive(Debug, Default, Clone)]
pub struct StandardTrackDiffStrategy;

impl StandardTrackDiffStrategy {
    pub fn new() -> Self {
        Self
    }
}

impl TrackDiffStrategy for StandardTrackDiffStrategy {
    fn can_handle(&self, _track_type: &str) -> bool {
        true
    }

    fn diff_track(
        &self,
        track_a: Option<&Track>,
        track_b: Option<&Track>,
        track_index: usize,
    ) -> TimelineDiff {
        let mut diff = TimelineDiff::default();

        match (track_a, track_b) {
            (None, None) => diff,
            (None, Some(b)) => {
                // INFO: Entire track added in version B
                for (clip_idx, clip) in b.clips.iter().enumerate() {
                    diff.added
                        .push(ClipRef::new(clip.media, track_index, clip_idx));
                }
                diff
            }
            (Some(a), None) => {
                // INFO: Entire track removed from version A
                for (clip_idx, clip) in a.clips.iter().enumerate() {
                    diff.removed
                        .push(ClipRef::new(clip.media, track_index, clip_idx));
                }
                diff
            }
            (Some(a), Some(b)) => {
                // CRITICAL: Diff clips between track A (base) and track B (target)
                let mut matched_a = HashSet::new();
                let mut matched_b = HashSet::new();

                // First pass: match exact media and position
                for (b_idx, clip_b) in b.clips.iter().enumerate() {
                    for (a_idx, clip_a) in a.clips.iter().enumerate() {
                        if !matched_a.contains(&a_idx) && clip_a.media == clip_b.media {
                            matched_a.insert(a_idx);
                            matched_b.insert(b_idx);

                            let range_a =
                                TimeRange::new(clip_a.in_point, clip_a.out_point, clip_a.position);
                            let range_b =
                                TimeRange::new(clip_b.in_point, clip_b.out_point, clip_b.position);

                            if range_a != range_b {
                                diff.moved.push((
                                    ClipRef::new(clip_b.media, track_index, b_idx),
                                    range_a,
                                    range_b,
                                ));
                            }
                            break;
                        }
                    }
                }

                // Unmatched in B are added
                for (b_idx, clip_b) in b.clips.iter().enumerate() {
                    if !matched_b.contains(&b_idx) {
                        diff.added
                            .push(ClipRef::new(clip_b.media, track_index, b_idx));
                    }
                }

                // Unmatched in A are removed
                for (a_idx, clip_a) in a.clips.iter().enumerate() {
                    if !matched_a.contains(&a_idx) {
                        diff.removed
                            .push(ClipRef::new(clip_a.media, track_index, a_idx));
                    }
                }

                diff
            }
        }
    }
}
