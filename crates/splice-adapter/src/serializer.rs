use splice_commit::Timeline;

use crate::error::SerializeError;

#[allow(clippy::wrong_self_convention)]
pub trait TimelineSerializer {
    fn to_timeline(&self, native_project: &[u8]) -> Result<Timeline, SerializeError>;
    fn from_timeline(&self, timeline: &Timeline) -> Result<Vec<u8>, SerializeError>;
}
