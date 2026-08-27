use splice_commit::Timeline;

use crate::strategy::{StandardTrackDiffStrategy, TrackDiffStrategy};
use crate::types::TimelineDiff;

pub struct TimelineDiffEngine {
    strategy: Box<dyn TrackDiffStrategy>,
}

impl Default for TimelineDiffEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl TimelineDiffEngine {
    pub fn new() -> Self {
        Self {
            strategy: Box::new(StandardTrackDiffStrategy::new()),
        }
    }

    pub fn with_strategy(strategy: Box<dyn TrackDiffStrategy>) -> Self {
        Self { strategy }
    }

    pub fn diff(&self, a: &Timeline, b: &Timeline) -> TimelineDiff {
        let max_tracks = a.tracks.len().max(b.tracks.len());
        let mut overall_diff = TimelineDiff::default();

        for i in 0..max_tracks {
            let track_a = a.tracks.get(i);
            let track_b = b.tracks.get(i);
            let track_diff = self.strategy.diff_track(track_a, track_b, i);

            overall_diff.added.extend(track_diff.added);
            overall_diff.removed.extend(track_diff.removed);
            overall_diff.moved.extend(track_diff.moved);
            overall_diff
                .effects_changed
                .extend(track_diff.effects_changed);
        }

        overall_diff.summary = generate_auto_note(&overall_diff);
        overall_diff
    }
}

pub fn diff(a: &Timeline, b: &Timeline) -> TimelineDiff {
    let engine = TimelineDiffEngine::new();
    engine.diff(a, b)
}

pub fn generate_auto_note(diff: &TimelineDiff) -> String {
    if diff.is_empty() {
        return "No timeline changes".to_string();
    }

    let mut parts = Vec::new();

    if !diff.added.is_empty() {
        let count = diff.added.len();
        parts.push(format!(
            "Added {} clip{}",
            count,
            if count == 1 { "" } else { "s" }
        ));
    }

    if !diff.removed.is_empty() {
        let count = diff.removed.len();
        parts.push(format!(
            "Removed {} clip{}",
            count,
            if count == 1 { "" } else { "s" }
        ));
    }

    if !diff.moved.is_empty() {
        let count = diff.moved.len();
        if count == 1 {
            let (_, a, b) = &diff.moved[0];
            let delta_in = b.in_point.as_secs_f64() - a.in_point.as_secs_f64();
            let delta_out = b.out_point.as_secs_f64() - a.out_point.as_secs_f64();
            let delta_pos = b.position.as_secs_f64() - a.position.as_secs_f64();

            if delta_in.abs() > 0.05 || delta_out.abs() > 0.05 {
                let total_trim = (delta_out - delta_in).abs();
                parts.push(format!("Trimmed clip by {total_trim:.1}s"));
            } else if delta_pos.abs() > 0.05 {
                parts.push(format!("Moved clip position by {delta_pos:+.1}s"));
            } else {
                parts.push("Modified 1 clip".to_string());
            }
        } else {
            parts.push(format!("Trimmed/repositioned {count} clips"));
        }
    }

    if !diff.effects_changed.is_empty() {
        let count = diff.effects_changed.len();
        parts.push(format!(
            "Updated effects on {} clip{}",
            count,
            if count == 1 { "" } else { "s" }
        ));
    }

    parts.join(", ")
}
