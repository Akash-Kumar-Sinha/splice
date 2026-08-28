use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RetentionPolicy {
    pub keep_starred_forever: bool,
    #[serde(with = "splice_commit::timeline::duration_seconds")]
    pub prune_after: Duration,
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        Self {
            keep_starred_forever: true,
            prune_after: Duration::from_secs(30 * 24 * 60 * 60),
        }
    }
}
