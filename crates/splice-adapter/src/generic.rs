use splice_commit::Timeline;

use crate::error::SerializeError;
use crate::serializer::TimelineSerializer;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct GenericSerializer;

impl GenericSerializer {
    pub const fn new() -> Self {
        Self
    }
}

impl TimelineSerializer for GenericSerializer {
    fn to_timeline(&self, native_project: &[u8]) -> Result<Timeline, SerializeError> {
        let timeline: Timeline = serde_json::from_slice(native_project)?;
        Ok(timeline)
    }

    fn from_timeline(&self, timeline: &Timeline) -> Result<Vec<u8>, SerializeError> {
        let bytes = serde_json::to_vec_pretty(timeline)?;
        Ok(bytes)
    }
}
