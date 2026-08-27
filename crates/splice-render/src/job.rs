use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use splice_commit::{CommitId, Timeline};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::export::ExportFormat;
use crate::proxy::FullResExportRenderer;

pub type JobId = Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    Processing,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportJob {
    pub id: JobId,
    pub commit_id: CommitId,
    pub status: JobStatus,
    pub progress: f32,
    pub format: ExportFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct ExportJobManager {
    jobs: Arc<RwLock<HashMap<JobId, ExportJob>>>,
    renderer: Arc<FullResExportRenderer>,
}

impl ExportJobManager {
    pub fn new(renderer: Arc<FullResExportRenderer>) -> Self {
        Self {
            jobs: Arc::new(RwLock::new(HashMap::new())),
            renderer,
        }
    }

    pub async fn submit_job(
        &self,
        commit_id: CommitId,
        timeline: Timeline,
        format: ExportFormat,
    ) -> JobId {
        let job_id = Uuid::new_v4();
        let job = ExportJob {
            id: job_id,
            commit_id,
            status: JobStatus::Queued,
            progress: 0.0,
            format,
            output_path: None,
            error: None,
        };

        {
            let mut w = self.jobs.write().await;
            w.insert(job_id, job);
        }

        let jobs_map = self.jobs.clone();
        let renderer = self.renderer.clone();

        tokio::spawn(async move {
            // INFO: Update job to processing state
            {
                let mut w = jobs_map.write().await;
                if let Some(j) = w.get_mut(&job_id) {
                    j.status = JobStatus::Processing;
                    j.progress = 0.25;
                }
            }

            let render_timeline = timeline.clone();
            let render_format = format;
            let render_result = tokio::task::spawn_blocking(move || {
                renderer.render_with_format(&render_timeline, render_format)
            })
            .await;

            let mut w = jobs_map.write().await;
            if let Some(j) = w.get_mut(&job_id) {
                match render_result {
                    Ok(Ok(out_path)) => {
                        j.status = JobStatus::Completed;
                        j.progress = 1.0;
                        j.output_path = Some(out_path);
                    }
                    Ok(Err(err)) => {
                        let err_msg = err.to_string();
                        j.status = JobStatus::Failed(err_msg.clone());
                        j.error = Some(err_msg);
                    }
                    Err(join_err) => {
                        let err_msg = join_err.to_string();
                        j.status = JobStatus::Failed(err_msg.clone());
                        j.error = Some(err_msg);
                    }
                }
            }
        });

        job_id
    }

    pub async fn get_job(&self, id: &JobId) -> Option<ExportJob> {
        let r = self.jobs.read().await;
        r.get(id).cloned()
    }

    pub async fn list_jobs(&self) -> Vec<ExportJob> {
        let r = self.jobs.read().await;
        r.values().cloned().collect()
    }
}
