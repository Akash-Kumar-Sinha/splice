use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use splice_commit::{CommitId, CommitStore};
use time::OffsetDateTime;
use tokio::sync::{Mutex, Notify};

use crate::error::SyncError;
use crate::queue::SyncQueue;
use crate::store::RemoteCommitStore;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncState {
    Synced,
    Pending,
    Syncing,
    Offline,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusReport {
    pub state: SyncState,
    pub pending_count: usize,
    #[serde(with = "time::serde::rfc3339::option")]
    pub last_synced_at: Option<OffsetDateTime>,
    pub remote_target: String,
    pub error_message: Option<String>,
}

pub struct SyncEngine {
    queue: Mutex<SyncQueue>,
    remote: Arc<dyn RemoteCommitStore>,
    local_store: Arc<dyn CommitStore>,
    is_offline: AtomicBool,
    is_syncing: AtomicBool,
    last_synced_at: Mutex<Option<OffsetDateTime>>,
    last_error: Mutex<Option<String>>,
    remote_target: String,
    notify: Arc<Notify>,
}

impl SyncEngine {
    pub fn new(
        remote: Arc<dyn RemoteCommitStore>,
        local_store: Arc<dyn CommitStore>,
        remote_target: impl Into<String>,
    ) -> Arc<Self> {
        let engine = Arc::new(Self {
            queue: Mutex::new(SyncQueue::new()),
            remote,
            local_store,
            is_offline: AtomicBool::new(false),
            is_syncing: AtomicBool::new(false),
            last_synced_at: Mutex::new(None),
            last_error: Mutex::new(None),
            remote_target: remote_target.into(),
            notify: Arc::new(Notify::new()),
        });

        // CRITICAL: Spawn background sync outbox worker loop
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            let worker_engine = engine.clone();
            handle.spawn(async move {
                worker_engine.run_background_loop().await;
            });
        }

        engine
    }

    pub async fn enqueue(&self, commit_id: CommitId) {
        // INFO: Non-blocking enqueue into outbox queue
        let mut q = self.queue.lock().await;
        q.enqueue(commit_id);
        drop(q);
        self.notify.notify_one();
    }

    pub fn set_offline(&self, offline: bool) {
        self.is_offline.store(offline, Ordering::SeqCst);
        if !offline {
            self.notify.notify_one();
        }
    }

    pub fn is_offline(&self) -> bool {
        self.is_offline.load(Ordering::SeqCst)
    }

    pub async fn status(&self) -> SyncStatusReport {
        let is_offline = self.is_offline.load(Ordering::SeqCst);
        let is_syncing = self.is_syncing.load(Ordering::SeqCst);
        let pending_count = self.queue.lock().await.pending_count();
        let last_synced_at = *self.last_synced_at.lock().await;
        let error_message = self.last_error.lock().await.clone();

        let state = if is_offline {
            SyncState::Offline
        } else if is_syncing {
            SyncState::Syncing
        } else if error_message.is_some() {
            SyncState::Error
        } else if pending_count > 0 {
            SyncState::Pending
        } else {
            SyncState::Synced
        };

        SyncStatusReport {
            state,
            pending_count,
            last_synced_at,
            remote_target: self.remote_target.clone(),
            error_message,
        }
    }

    pub async fn trigger_sync_now(&self) -> Result<usize, SyncError> {
        if self.is_offline.load(Ordering::SeqCst) {
            return Err(SyncError::Network("Device is in offline mode".to_string()));
        }

        self.is_syncing.store(true, Ordering::SeqCst);

        let mut q = self.queue.lock().await;
        let res = q
            .drain(self.remote.as_ref(), self.local_store.as_ref())
            .await;
        drop(q);

        self.is_syncing.store(false, Ordering::SeqCst);

        match res {
            Ok(count) => {
                let mut t = self.last_synced_at.lock().await;
                *t = Some(OffsetDateTime::now_utc());
                let mut err = self.last_error.lock().await;
                *err = None;
                Ok(count)
            }
            Err(e) => {
                let mut err = self.last_error.lock().await;
                *err = Some(e.to_string());
                Err(e)
            }
        }
    }

    async fn run_background_loop(&self) {
        loop {
            // INFO: Wait for either explicit notify or periodic 3-second heartbeat
            tokio::select! {
                _ = self.notify.notified() => {},
                _ = tokio::time::sleep(Duration::from_secs(3)) => {},
            }

            if self.is_offline.load(Ordering::SeqCst) {
                continue;
            }

            let has_pending = !self.queue.lock().await.is_empty();

            if has_pending {
                let _ = self.trigger_sync_now().await;
            }
        }
    }
}
