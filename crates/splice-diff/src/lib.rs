pub mod engine;
pub mod strategy;
pub mod types;

pub use engine::{TimelineDiffEngine, diff, generate_auto_note};
pub use strategy::{StandardTrackDiffStrategy, TrackDiffStrategy};
pub use types::{ClipRef, TimeRange, TimelineDiff};
