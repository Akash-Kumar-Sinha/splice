use std::collections::VecDeque;

use splice_commit::{CommitId, CommitStore};

use crate::error::SyncError;
use crate::store::RemoteCommitStore;

#[derive(Debug, Default, Clone)]
pub struct SyncQueue {
    pending: VecDeque<CommitId>,
}

impl SyncQueue {
    pub fn new() -> Self {
        Self {
            pending: VecDeque::new(),
        }
    }

    pub fn enqueue(&mut self, id: CommitId) {
        // INFO: Deduplicate entries so repeated notifications don't cause duplicate network pushes
        if !self.pending.contains(&id) {
            self.pending.push_back(id);
        }
    }

    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    pub fn peek(&self) -> Option<&CommitId> {
        self.pending.front()
    }

    pub fn clear(&mut self) {
        self.pending.clear();
    }

    pub async fn drain(
        &mut self,
        remote: &dyn RemoteCommitStore,
        store: &dyn CommitStore,
    ) -> Result<usize, SyncError> {
        if self.pending.is_empty() {
            return Ok(0);
        }

        // CRITICAL: Outbox pattern: drain queued commit IDs into remote store in FIFO order
        let mut commits_to_push = Vec::new();
        for id in &self.pending {
            match store.get(id) {
                Ok(commit) => commits_to_push.push(commit),
                Err(e) => {
                    tracing::warn!(
                        "SyncQueue: Commit {} could not be loaded from local store: {}",
                        id,
                        e
                    );
                }
            }
        }

        if !commits_to_push.is_empty() {
            remote.push(&commits_to_push).await?;
        }

        let drained_count = self.pending.len();
        self.pending.clear();
        Ok(drained_count)
    }
}
