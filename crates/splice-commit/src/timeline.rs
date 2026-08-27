use std::time::Duration;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use splice_media::MediaHash;

pub mod duration_seconds {
    use super::*;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_f64(duration.as_secs_f64())
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let secs = f64::deserialize(deserializer)?;
        Ok(Duration::from_secs_f64(secs.max(0.0)))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Clip {
    pub media: MediaHash,
    #[serde(with = "duration_seconds")]
    pub in_point: Duration,
    #[serde(with = "duration_seconds")]
    pub out_point: Duration,
    #[serde(with = "duration_seconds")]
    pub position: Duration,
}

impl Clip {
    pub const fn new(
        media: MediaHash,
        in_point: Duration,
        out_point: Duration,
        position: Duration,
    ) -> Self {
        Self {
            media,
            in_point,
            out_point,
            position,
        }
    }

    pub fn duration(&self) -> Duration {
        self.out_point.saturating_sub(self.in_point)
    }

    pub fn end_position(&self) -> Duration {
        self.position + self.duration()
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Track {
    pub clips: Vec<Clip>,
}

impl Track {
    pub const fn new(clips: Vec<Clip>) -> Self {
        Self { clips }
    }

    pub fn total_duration(&self) -> Duration {
        let mut max = Duration::ZERO;
        for clip in &self.clips {
            let end = clip.end_position();
            if end > max {
                max = end;
            }
        }
        max
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Timeline {
    pub tracks: Vec<Track>,
}

impl Timeline {
    pub const fn new(tracks: Vec<Track>) -> Self {
        Self { tracks }
    }

    pub fn compute_hash(&self) -> MediaHash {
        let serialized = serde_json::to_vec(self).unwrap_or_default();
        MediaHash::compute(&serialized)
    }

    pub fn media_refs(&self) -> Vec<MediaHash> {
        let mut refs = Vec::new();
        for track in &self.tracks {
            for clip in &track.clips {
                if !refs.contains(&clip.media) {
                    refs.push(clip.media);
                }
            }
        }
        refs
    }

    pub fn total_duration(&self) -> Duration {
        let mut max = Duration::ZERO;
        for track in &self.tracks {
            let dur = track.total_duration();
            if dur > max {
                max = dur;
            }
        }
        max
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_timeline_serialization_and_hash() {
        let media1 = MediaHash::compute(b"clip_1");
        let media2 = MediaHash::compute(b"clip_2");

        let clip1 = Clip::new(
            media1,
            Duration::from_secs_f64(0.0),
            Duration::from_secs_f64(5.0),
            Duration::from_secs_f64(0.0),
        );
        let clip2 = Clip::new(
            media2,
            Duration::from_secs_f64(1.0),
            Duration::from_secs_f64(6.0),
            Duration::from_secs_f64(5.0),
        );

        let track = Track::new(vec![clip1, clip2]);
        let timeline = Timeline::new(vec![track]);

        assert_eq!(timeline.total_duration(), Duration::from_secs_f64(10.0));
        assert_eq!(timeline.media_refs(), vec![media1, media2]);

        let json = serde_json::to_string(&timeline).expect("serialize timeline");
        let deserialized: Timeline = serde_json::from_str(&json).expect("deserialize timeline");
        assert_eq!(timeline, deserialized);

        let hash = timeline.compute_hash();
        assert_eq!(hash, deserialized.compute_hash());
    }
}
