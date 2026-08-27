use serde::{Deserialize, Serialize};

use crate::id::CommitId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tag {
    pub commit_id: CommitId,
    pub label: String,
}

impl Tag {
    pub fn new(commit_id: CommitId, label: impl Into<String>) -> Self {
        Self {
            commit_id,
            label: label.into(),
        }
    }
}
