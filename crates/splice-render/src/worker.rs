use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc::{self, Sender};

use crate::cache::FsThumbnailCache;
use crate::thumbnail::ThumbnailGenerator;

#[derive(Debug, Clone)]
pub struct ThumbnailJob {
    pub commit_id: String,
    pub media_path: PathBuf,
    pub at: Duration,
}

#[derive(Clone)]
pub struct ThumbnailQueue {
    sender: Sender<ThumbnailJob>,
}

impl ThumbnailQueue {
    pub fn new(
        cache: FsThumbnailCache,
        generator: Arc<dyn ThumbnailGenerator>,
        buffer_size: usize,
    ) -> Self {
        let (tx, mut rx) = mpsc::channel::<ThumbnailJob>(buffer_size);

        // CRITICAL: Spawn asynchronous background worker to process thumbnail jobs without blocking the save path
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                while let Some(job) = rx.recv().await {
                    let cache_ref = cache.clone();
                    let gen_ref = generator.clone();

                    let _ = tokio::task::spawn_blocking(move || {
                        if cache_ref.contains(&job.commit_id) {
                            return;
                        }
                        match gen_ref.generate(&job.media_path, job.at) {
                            Ok(bytes) => {
                                if let Err(e) = cache_ref.put(&job.commit_id, &bytes) {
                                    tracing::warn!(
                                        "Failed to cache thumbnail for commit {}: {e}",
                                        job.commit_id
                                    );
                                } else {
                                    tracing::info!(
                                        "Generated and cached thumbnail for commit {}",
                                        job.commit_id
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to generate thumbnail for commit {}: {e}",
                                    job.commit_id
                                );
                            }
                        }
                    })
                    .await;
                }
            });
        }

        Self { sender: tx }
    }

    pub fn submit(&self, job: ThumbnailJob) -> bool {
        self.sender.try_send(job).is_ok()
    }
}
