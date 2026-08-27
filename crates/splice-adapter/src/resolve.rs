use std::time::Duration;

use serde::{Deserialize, Serialize};
use splice_commit::{Clip, Timeline, Track};
use splice_media::MediaHash;

use crate::error::SerializeError;
use crate::serializer::TimelineSerializer;

const DEFAULT_RESOLVE_FPS: f64 = 24.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolveProject {
    #[serde(default = "default_schema_version")]
    pub schema_version: String,
    #[serde(default = "default_app_name")]
    pub application: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeline_name: Option<String>,
    #[serde(default = "default_frame_rate")]
    pub frame_rate: f64,
    #[serde(default)]
    pub tracks: Vec<ResolveTrack>,
}

fn default_schema_version() -> String {
    "davinci-resolve-timeline-v1".to_string()
}

fn default_app_name() -> String {
    "DaVinci Resolve".to_string()
}

fn default_frame_rate() -> f64 {
    DEFAULT_RESOLVE_FPS
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolveTrack {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub items: Vec<ResolveItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResolveItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub media_identifier: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_in_frame: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_out_frame: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_in_frame: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_out_frame: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_in_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_out_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_in_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_out_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_frames: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ResolveSerializer {
    pub default_fps: f64,
}

impl Default for ResolveSerializer {
    fn default() -> Self {
        Self {
            default_fps: DEFAULT_RESOLVE_FPS,
        }
    }
}

impl ResolveSerializer {
    pub const fn new() -> Self {
        Self {
            default_fps: DEFAULT_RESOLVE_FPS,
        }
    }

    pub const fn with_fps(fps: f64) -> Self {
        Self { default_fps: fps }
    }

    fn parse_media_hash(identifier: &str) -> MediaHash {
        // INFO: parse 64-char hex media hash or hash arbitrary string identifier
        MediaHash::from_hex(identifier)
            .unwrap_or_else(|_| MediaHash::compute(identifier.as_bytes()))
    }
}

impl TimelineSerializer for ResolveSerializer {
    fn to_timeline(&self, native_project: &[u8]) -> Result<Timeline, SerializeError> {
        let resolve_proj: ResolveProject = serde_json::from_slice(native_project)?;
        let fps = if resolve_proj.frame_rate > 0.0 {
            resolve_proj.frame_rate
        } else {
            self.default_fps
        };

        let mut tracks = Vec::with_capacity(resolve_proj.tracks.len());

        for r_track in resolve_proj.tracks {
            let mut clips = Vec::with_capacity(r_track.items.len());

            for item in r_track.items {
                let media = Self::parse_media_hash(&item.media_identifier);

                let in_point_secs = item.source_in_seconds.unwrap_or_else(|| {
                    item.source_in_frame
                        .map(|f| (f as f64) / fps)
                        .unwrap_or(0.0)
                });
                let in_point = Duration::from_secs_f64(in_point_secs.max(0.0));

                let out_point_secs = item.source_out_seconds.unwrap_or_else(|| {
                    if let Some(f) = item.source_out_frame {
                        (f as f64) / fps
                    } else if let Some(dur_s) = item.duration_seconds {
                        in_point_secs + dur_s
                    } else if let Some(dur_f) = item.duration_frames {
                        in_point_secs + (dur_f as f64) / fps
                    } else {
                        in_point_secs + 5.0
                    }
                });
                let out_point = Duration::from_secs_f64(out_point_secs.max(in_point_secs));

                let position_secs = item.record_in_seconds.unwrap_or_else(|| {
                    item.record_in_frame
                        .map(|f| (f as f64) / fps)
                        .unwrap_or(0.0)
                });
                let position = Duration::from_secs_f64(position_secs.max(0.0));

                clips.push(Clip::new(media, in_point, out_point, position));
            }

            tracks.push(Track::new(clips));
        }

        Ok(Timeline::new(tracks))
    }

    fn from_timeline(&self, timeline: &Timeline) -> Result<Vec<u8>, SerializeError> {
        let fps = if self.default_fps > 0.0 {
            self.default_fps
        } else {
            DEFAULT_RESOLVE_FPS
        };

        let mut resolve_tracks = Vec::with_capacity(timeline.tracks.len());

        for (track_idx, track) in timeline.tracks.iter().enumerate() {
            let mut items = Vec::with_capacity(track.clips.len());

            for (clip_idx, clip) in track.clips.iter().enumerate() {
                let media_identifier = clip.media.to_hex();
                let in_secs = clip.in_point.as_secs_f64();
                let out_secs = clip.out_point.as_secs_f64();
                let pos_secs = clip.position.as_secs_f64();
                let dur_secs = clip.duration().as_secs_f64();

                let source_in_frame = (in_secs * fps).round() as i64;
                let source_out_frame = (out_secs * fps).round() as i64;
                let record_in_frame = (pos_secs * fps).round() as i64;
                let record_out_frame = ((pos_secs + dur_secs) * fps).round() as i64;
                let duration_frames = (dur_secs * fps).round() as i64;

                items.push(ResolveItem {
                    name: Some(format!("Clip_{}_{}", track_idx + 1, clip_idx + 1)),
                    media_identifier,
                    record_in_frame: Some(record_in_frame),
                    record_out_frame: Some(record_out_frame),
                    source_in_frame: Some(source_in_frame),
                    source_out_frame: Some(source_out_frame),
                    record_in_seconds: Some(pos_secs),
                    record_out_seconds: Some(pos_secs + dur_secs),
                    source_in_seconds: Some(in_secs),
                    source_out_seconds: Some(out_secs),
                    duration_frames: Some(duration_frames),
                    duration_seconds: Some(dur_secs),
                });
            }

            resolve_tracks.push(ResolveTrack {
                track_type: Some("video".to_string()),
                track_index: Some(track_idx + 1),
                name: Some(format!("Track {}", track_idx + 1)),
                items,
            });
        }

        let resolve_project = ResolveProject {
            schema_version: default_schema_version(),
            application: default_app_name(),
            project_name: Some("Splice Export".to_string()),
            timeline_name: Some("Main Timeline".to_string()),
            frame_rate: fps,
            tracks: resolve_tracks,
        };

        let bytes = serde_json::to_vec_pretty(&resolve_project)?;
        Ok(bytes)
    }
}
