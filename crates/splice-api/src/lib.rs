pub mod seed;
pub mod timeline;

use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Multipart, Path as AxumPath, Query, State};
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use splice_sdk::{
    Commit, CommitId, CommitStore, CommitTreeNode, ExportClip, ExportFormat, ExportJob,
    ExportJobManager, FfmpegThumbnailer, FsProxyCache, FsThumbnailCache, FullResExportRenderer,
    GcReport, JobId, JobStatus, LowResProxyRenderer, MediaHash, MediaStore, ProxyRenderer,
    Repository, RetentionPolicy, S3RemoteStore, StoreError, SyncEngine, SyncError,
    SyncStatusReport, Tag, ThumbnailGenerator, ThumbnailJob, ThumbnailQueue,
    Timeline as SpliceCommitTimeline, TimelineDiff, build_commit_tree, collect_garbage, diff,
    estimate_reclaimable, render_export_mp4, squash,
};


use tempfile::NamedTempFile;
use time::OffsetDateTime;
use tower::ServiceExt;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeFile;

pub use splice_sdk::{
    ExportFormat as SdkExportFormat, ExportJob as SdkExportJob,
    ExportJobManager as SdkExportJobManager, GcError as SdkGcError, GcReport as SdkGcReport,
    GenericSerializer as SdkGenericSerializer, JobId as SdkJobId, JobStatus as SdkJobStatus,
    ResolveItem as SdkResolveItem, ResolveProject as SdkResolveProject,
    ResolveSerializer as SdkResolveSerializer, ResolveTrack as SdkResolveTrack,
    RetentionPolicy as SdkRetentionPolicy, SerializeError as SdkSerializeError,
    TimelineSerializer as SdkTimelineSerializer, collect_garbage as sdk_collect_garbage,
    estimate_reclaimable as sdk_estimate_reclaimable,
};
pub use timeline::{
    RawEditorClip, RawEditorState, RawEditorTrack, RevertMode, Timeline, TimelineClip,
    TimelineTrack,
};

#[derive(Clone)]
pub struct AppState {
    pub commit_store: Arc<dyn CommitStore>,
    pub media_store: Arc<dyn MediaStore>,
    pub thumbnail_cache: FsThumbnailCache,
    pub thumbnail_generator: Arc<dyn ThumbnailGenerator>,
    pub thumbnail_queue: ThumbnailQueue,
    pub sync_engine: Arc<SyncEngine>,
    pub proxy_cache: FsProxyCache,
    pub proxy_renderer: Arc<dyn ProxyRenderer>,
    pub export_manager: Arc<ExportJobManager>,
}

impl AppState {
    pub fn new(
        commit_store: Arc<dyn CommitStore>,
        media_store: Arc<dyn MediaStore>,
        thumbnail_cache: FsThumbnailCache,
        thumbnail_generator: Arc<dyn ThumbnailGenerator>,
    ) -> Self {
        let mem_store = Arc::new(object_store::memory::InMemory::new());
        let remote_store = Arc::new(S3RemoteStore::new(mem_store));
        let sync_engine = SyncEngine::new(
            remote_store,
            commit_store.clone(),
            "s3://splice-cloud-backups",
        );

        Self::new_with_sync(
            commit_store,
            media_store,
            thumbnail_cache,
            thumbnail_generator,
            sync_engine,
        )
    }

    pub fn new_with_sync(
        commit_store: Arc<dyn CommitStore>,
        media_store: Arc<dyn MediaStore>,
        thumbnail_cache: FsThumbnailCache,
        thumbnail_generator: Arc<dyn ThumbnailGenerator>,
        sync_engine: Arc<SyncEngine>,
    ) -> Self {
        let proxy_renderer: Arc<dyn ProxyRenderer> =
            Arc::new(LowResProxyRenderer::new(".media_store", ".proxy_cache"));
        let proxy_cache = FsProxyCache::new(".proxy_cache", proxy_renderer.clone());

        Self::new_with_all(
            commit_store,
            media_store,
            thumbnail_cache,
            thumbnail_generator,
            sync_engine,
            proxy_cache,
            proxy_renderer,
        )
    }

    pub fn new_with_all(
        commit_store: Arc<dyn CommitStore>,
        media_store: Arc<dyn MediaStore>,
        thumbnail_cache: FsThumbnailCache,
        thumbnail_generator: Arc<dyn ThumbnailGenerator>,
        sync_engine: Arc<SyncEngine>,
        proxy_cache: FsProxyCache,
        proxy_renderer: Arc<dyn ProxyRenderer>,
    ) -> Self {
        let thumbnail_queue =
            ThumbnailQueue::new(thumbnail_cache.clone(), thumbnail_generator.clone(), 64);
        let media_root = media_store
            .root_path()
            .unwrap_or_else(|| std::path::PathBuf::from(".media_store"));
        let export_renderer = Arc::new(FullResExportRenderer::new(media_root, ".exports"));
        let export_manager = Arc::new(ExportJobManager::new(export_renderer));

        Self {
            commit_store,
            media_store,
            thumbnail_cache,
            thumbnail_generator,
            thumbnail_queue,
            sync_engine,
            proxy_cache,
            proxy_renderer,
            export_manager,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new_with_everything(
        commit_store: Arc<dyn CommitStore>,
        media_store: Arc<dyn MediaStore>,
        thumbnail_cache: FsThumbnailCache,
        thumbnail_generator: Arc<dyn ThumbnailGenerator>,
        sync_engine: Arc<SyncEngine>,
        proxy_cache: FsProxyCache,
        proxy_renderer: Arc<dyn ProxyRenderer>,
        export_manager: Arc<ExportJobManager>,
    ) -> Self {
        let thumbnail_queue =
            ThumbnailQueue::new(thumbnail_cache.clone(), thumbnail_generator.clone(), 64);

        Self {
            commit_store,
            media_store,
            thumbnail_cache,
            thumbnail_generator,
            thumbnail_queue,
            sync_engine,
            proxy_cache,
            proxy_renderer,
            export_manager,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NewCommitRequest {
    pub parent: Option<CommitId>,
    pub author: String,
    pub message: String,
    pub timeline_hash: MediaHash,
    #[serde(default)]
    pub media_refs: Vec<MediaHash>,
    #[serde(default)]
    pub timeline_raw: Option<serde_json::Value>,
    #[serde(default)]
    pub repo_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SaveAsRequest {
    pub from: CommitId,
    pub message: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub timeline_hash: Option<MediaHash>,
    #[serde(default)]
    pub media_refs: Option<Vec<MediaHash>>,
    #[serde(default)]
    pub timeline_raw: Option<serde_json::Value>,
    #[serde(default)]
    pub repo_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateRepoRequest {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct RepoCommitsQuery {
    #[serde(default)]
    pub repo_id: Option<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResponse {
    pub id: CommitId,
    pub parent: Option<CommitId>,
    pub timestamp: OffsetDateTime,
    pub author: String,
    pub message: String,
    pub timeline_hash: MediaHash,
    pub media_refs: Vec<MediaHash>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct RevertQuery {
    #[serde(default)]
    pub mode: Option<RevertMode>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub struct RevertPayload {
    #[serde(default)]
    pub mode: Option<RevertMode>,
    #[serde(default)]
    pub uncommitted_changes: Option<NewCommitRequest>,
}

#[derive(Debug, Deserialize)]
pub struct DiffQuery {
    pub from: CommitId,
    pub to: CommitId,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DiffTimelinePayload {
    pub timeline_a: SpliceCommitTimeline,
    pub timeline_b: SpliceCommitTimeline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResponse {
    pub hash: MediaHash,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagRequest {
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineToggleRequest {
    pub offline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SquashRequest {
    pub commit_ids: Vec<CommitId>,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncTriggerResponse {
    pub success: bool,
    pub drained_count: usize,
    pub status: SyncStatusReport,
}

#[derive(thiserror::Error, Debug)]
pub enum ApiError {
    #[error("Commit store error: {0}")]
    Store(#[from] StoreError),

    #[error("Media store error: {0}")]
    Media(#[from] splice_sdk::MediaStoreError),

    #[error("Media not found: {0}")]
    MediaNotFound(MediaHash),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Job not found: {0}")]
    JobNotFound(JobId),

    #[error("Render error: {0}")]
    Render(#[from] splice_sdk::RenderError),

    #[error("GC error: {0}")]
    Gc(#[from] splice_sdk::GcError),

    #[error("Sync error: {0}")]
    Sync(#[from] SyncError),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::Store(StoreError::CommitNotFound(_))
            | Self::MediaNotFound(_)
            | Self::JobNotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            Self::Store(StoreError::ParentNotFound(_)) => {
                (StatusCode::BAD_REQUEST, self.to_string())
            }

            Self::Store(StoreError::DuplicateCommit(_)) => (StatusCode::CONFLICT, self.to_string()),
            Self::Store(StoreError::CycleDetected(_)) => {
                (StatusCode::UNPROCESSABLE_ENTITY, self.to_string())
            }
            Self::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            Self::Sync(SyncError::Network(msg)) => (StatusCode::SERVICE_UNAVAILABLE, msg.clone()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(serde_json::json!({
            "error": message
        }));

        (status, body).into_response()
    }
}

pub fn probe_duration(path: &Path) -> f64 {
    // INFO: Shell out to ffprobe to inspect format duration for uploaded media
    let output = std::process::Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(path)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let str_val = String::from_utf8_lossy(&out.stdout).trim().to_string();
            str_val.parse::<f64>().unwrap_or(5.0)
        }
        _ => 5.0,
    }
}

pub async fn list_repositories_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<Repository>>, ApiError> {
    let repos = state.commit_store.list_repositories()?;
    Ok(Json(repos))
}

pub async fn create_repository_handler(
    State(state): State<AppState>,
    Json(payload): Json<CreateRepoRequest>,
) -> Result<(StatusCode, Json<Repository>), ApiError> {
    let id = payload
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("repo_{}", uuid::Uuid::new_v4().simple()));
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Repository name cannot be empty".to_string()));
    }
    let repo = Repository::new(id, name, payload.description);
    let created = state.commit_store.create_repository(repo)?;
    Ok((StatusCode::CREATED, Json(created)))
}

pub async fn get_repository_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Repository>, ApiError> {
    let repo = state
        .commit_store
        .get_repository(&id)?
        .ok_or_else(|| ApiError::BadRequest(format!("Repository '{id}' not found")))?;
    Ok(Json(repo))
}

pub async fn delete_repository_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<StatusCode, ApiError> {
    state.commit_store.delete_repository(&id)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_repo_commits_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Vec<CommitResponse>>, ApiError> {
    let mut commits = state.commit_store.list_commits_for_repo(&id)?;
    commits.sort_by_key(|b| std::cmp::Reverse(b.timestamp));
    let mut responses = Vec::with_capacity(commits.len());

    for c in commits {
        let tags = state.commit_store.get_tags(&c.id).unwrap_or_default();
        responses.push(CommitResponse {
            id: c.id,
            parent: c.parent,
            timestamp: c.timestamp,
            author: c.author,
            message: c.message,
            timeline_hash: c.timeline_hash,
            media_refs: c.media_refs,
            tags,
        });
    }

    Ok(Json(responses))
}

pub async fn get_repo_commit_tree_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Vec<CommitTreeNode>>, ApiError> {
    let commits = state.commit_store.list_commits_for_repo(&id)?;
    let tree = build_commit_tree(&commits, |cid| {
        state.commit_store.get_tags(cid).unwrap_or_default()
    });
    Ok(Json(tree))
}

pub async fn list_commits(
    State(state): State<AppState>,
    Query(query): Query<RepoCommitsQuery>,
) -> Result<Json<Vec<CommitResponse>>, ApiError> {
    // INFO: List all commits across all branches, or filtered by repository
    let mut commits = if let Some(ref r_id) = query.repo_id {
        state.commit_store.list_commits_for_repo(r_id)?
    } else {
        state.commit_store.list_all_commits()?
    };
    commits.sort_by_key(|b| std::cmp::Reverse(b.timestamp));
    let mut responses = Vec::with_capacity(commits.len());

    for c in commits {
        let tags = state.commit_store.get_tags(&c.id).unwrap_or_default();
        responses.push(CommitResponse {
            id: c.id,
            parent: c.parent,
            timestamp: c.timestamp,
            author: c.author,
            message: c.message,
            timeline_hash: c.timeline_hash,
            media_refs: c.media_refs,
            tags,
        });
    }

    Ok(Json(responses))
}

pub async fn create_commit(
    State(state): State<AppState>,
    Json(req): Json<NewCommitRequest>,
) -> Result<(StatusCode, Json<CommitId>), ApiError> {
    let commit_id = CommitId::new();
    let commit = Commit::new(
        commit_id,
        req.parent,
        OffsetDateTime::now_utc(),
        req.author,
        req.message,
        req.timeline_hash,
        req.media_refs.clone(),
    );

    // CRITICAL: Outbox pattern: write locally first, then queue for async cloud delivery
    let id = if let Some(ref r_id) = req.repo_id {
        state.commit_store.append_to_repo(r_id, commit)?
    } else {
        state.commit_store.append(commit)?
    };

    if let Some(timeline_raw) = req.timeline_raw {
        let _ = state
            .commit_store
            .save_timeline(&id, &timeline_raw.to_string());
    }

    // INFO: Enqueue into background sync engine without blocking caller
    state.sync_engine.enqueue(id).await;

    // CRITICAL: Submit asynchronous background job to generate frame thumbnail without blocking save path
    if let Some(media_path) = req
        .media_refs
        .first()
        .and_then(|m| state.media_store.resolve(m))
    {
        let job = ThumbnailJob {
            commit_id: id.to_string(),
            media_path,
            at: Duration::from_secs(1),
        };
        state.thumbnail_queue.submit(job);
    }

    Ok((StatusCode::CREATED, Json(id)))
}

pub async fn save_as_new_version(
    State(state): State<AppState>,
    Json(req): Json<SaveAsRequest>,
) -> Result<(StatusCode, Json<CommitId>), ApiError> {
    if req.message.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "Commit message cannot be empty".to_string(),
        ));
    }

    let parent_commit = state.commit_store.get(&req.from)?;
    let new_id = CommitId::new();

    let timeline_hash = req.timeline_hash.unwrap_or(parent_commit.timeline_hash);
    let media_refs = req.media_refs.unwrap_or(parent_commit.media_refs);
    let author = req
        .author
        .unwrap_or_else(|| "aks.krsinha@gmail.com".to_string());

    let commit = Commit::new(
        new_id,
        Some(req.from),
        OffsetDateTime::now_utc(),
        author,
        req.message.trim().to_string(),
        timeline_hash,
        media_refs.clone(),
    );

    let id = if let Some(ref r_id) = req.repo_id {
        state.commit_store.append_to_repo(r_id, commit)?
    } else {
        state.commit_store.append(commit)?
    };

    let _ = state
        .commit_store
        .add_tag(Tag::new(id, "Branch".to_string()));

    if let Some(timeline_raw) = req.timeline_raw {
        let _ = state
            .commit_store
            .save_timeline(&id, &timeline_raw.to_string());
    } else if let Ok(Some(parent_tl_json)) = state.commit_store.get_timeline(&req.from) {
        let _ = state.commit_store.save_timeline(&id, &parent_tl_json);
    }

    // INFO: Enqueue branched commit into sync engine
    state.sync_engine.enqueue(id).await;

    if let Some(media_path) = media_refs
        .first()
        .and_then(|m| state.media_store.resolve(m))
    {
        let job = ThumbnailJob {
            commit_id: id.to_string(),
            media_path,
            at: Duration::from_secs(1),
        };
        state.thumbnail_queue.submit(job);
    }

    Ok((StatusCode::CREATED, Json(id)))
}

pub async fn get_commit_tree(
    State(state): State<AppState>,
    Query(query): Query<RepoCommitsQuery>,
) -> Result<Json<Vec<CommitTreeNode>>, ApiError> {
    let all_commits = if let Some(ref r_id) = query.repo_id {
        state.commit_store.list_commits_for_repo(r_id)?
    } else {
        state.commit_store.list_all_commits()?
    };
    let tree = build_commit_tree(&all_commits, |id| {
        state.commit_store.get_tags(id).unwrap_or_default()
    });
    Ok(Json(tree))
}


pub async fn get_commits_diff(
    State(state): State<AppState>,
    Query(query): Query<DiffQuery>,
) -> Result<Json<TimelineDiff>, ApiError> {
    let commit_a = state.commit_store.get(&query.from)?;
    let commit_b = state.commit_store.get(&query.to)?;

    let tl_a = if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&query.from) {
        if let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json) {
            Timeline::from_raw_state(&commit_a, &raw_state, RevertMode::Preview, false)
                .to_splice_commit_timeline()
        } else {
            SpliceCommitTimeline::from_commit(&commit_a)
        }
    } else {
        SpliceCommitTimeline::from_commit(&commit_a)
    };

    let tl_b = if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&query.to) {
        if let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json) {
            Timeline::from_raw_state(&commit_b, &raw_state, RevertMode::Preview, false)
                .to_splice_commit_timeline()
        } else {
            SpliceCommitTimeline::from_commit(&commit_b)
        }
    } else {
        SpliceCommitTimeline::from_commit(&commit_b)
    };

    let diff_res = diff(&tl_a, &tl_b);
    Ok(Json(diff_res))
}

pub async fn compute_timeline_diff(
    Json(payload): Json<DiffTimelinePayload>,
) -> Result<Json<TimelineDiff>, ApiError> {
    let diff_res = diff(&payload.timeline_a, &payload.timeline_b);
    Ok(Json(diff_res))
}

pub async fn revert(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<CommitId>,
    Query(query): Query<RevertQuery>,
    payload: Option<Json<RevertPayload>>,
) -> Result<Json<Timeline>, ApiError> {
    let mode = payload
        .as_ref()
        .and_then(|p| p.mode)
        .or(query.mode)
        .unwrap_or(RevertMode::Preview);

    if let Some(changes) = payload
        .as_ref()
        .and_then(|p| p.uncommitted_changes.as_ref())
        .filter(|_| mode == RevertMode::Restore)
    {
        let stash_commit = Commit::new(
            CommitId::new(),
            state.commit_store.head_id()?,
            OffsetDateTime::now_utc(),
            changes.author.clone(),
            format!("Auto-stash before restore: {}", changes.message),
            changes.timeline_hash,
            changes.media_refs.clone(),
        );
        let stash_id = state.commit_store.append(stash_commit)?;
        if let Some(timeline_raw) = &changes.timeline_raw {
            let _ = state
                .commit_store
                .save_timeline(&stash_id, &timeline_raw.to_string());
        }
        state.sync_engine.enqueue(stash_id).await;
    }

    let target_commit = state.commit_store.get(&id)?;

    let is_head = match mode {
        RevertMode::Preview => {
            let current_head = state.commit_store.head_id()?;
            current_head == Some(id)
        }
        RevertMode::Restore => {
            state.commit_store.set_head(&id)?;
            true
        }
    };

    let timeline = if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&id) {
        if let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json) {
            Timeline::from_raw_state(&target_commit, &raw_state, mode, is_head)
        } else {
            Timeline::reconstruct(
                &target_commit,
                mode,
                is_head,
                Some(state.media_store.as_ref()),
            )
        }
    } else {
        Timeline::reconstruct(
            &target_commit,
            mode,
            is_head,
            Some(state.media_store.as_ref()),
        )
    };

    Ok(Json(timeline))
}

pub async fn upload_media(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, ApiError> {
    let mut temp_file = NamedTempFile::new().map_err(|e| ApiError::Store(StoreError::Io(e)))?;
    let mut file_received = false;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::BadRequest(e.to_string()))?
    {
        let data = field
            .bytes()
            .await
            .map_err(|e| ApiError::BadRequest(e.to_string()))?;
        temp_file
            .write_all(&data)
            .map_err(|e| ApiError::Store(StoreError::Io(e)))?;
        file_received = true;
    }

    if !file_received {
        return Err(ApiError::BadRequest(
            "No file payload received in multipart request".to_string(),
        ));
    }

    temp_file
        .flush()
        .map_err(|e| ApiError::Store(StoreError::Io(e)))?;
    let temp_path = temp_file.path();

    let hash = state.media_store.ingest(temp_path)?;
    let resolved_path = state
        .media_store
        .resolve(&hash)
        .unwrap_or_else(|| temp_path.to_path_buf());
    let duration = probe_duration(&resolved_path);

    Ok(Json(UploadResponse { hash, duration }))
}

pub async fn serve_media(
    State(state): State<AppState>,
    AxumPath(hash): AxumPath<MediaHash>,
    req: Request<Body>,
) -> Result<Response, ApiError> {
    let path = state
        .media_store
        .resolve(&hash)
        .ok_or(ApiError::MediaNotFound(hash))?;

    let service = ServeFile::new(path);
    let mut res = match service.oneshot(req).await {
        Ok(res) => res,
        Err(never) => match never {},
    };

    let is_octet_stream = res
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .map(|v| v == "application/octet-stream" || v == "text/plain")
        .unwrap_or(true);

    if is_octet_stream {
        res.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("video/mp4"),
        );
    }

    Ok(res.into_response())
}

pub async fn get_commit_thumbnail(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<CommitId>,
) -> Result<impl IntoResponse, ApiError> {
    let id_str = id.to_string();

    if let Some(cached_bytes) = state.thumbnail_cache.get(&id_str) {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/jpeg"));
        return Ok((StatusCode::OK, headers, cached_bytes));
    }

    let commit = state.commit_store.get(&id)?;
    let bytes = if let Some(media_hash) = commit.media_refs.first() {
        if let Some(path) = state.media_store.resolve(media_hash) {
            match state
                .thumbnail_generator
                .generate(&path, Duration::from_secs(1))
            {
                Ok(generated) => {
                    let _ = state.thumbnail_cache.put(&id_str, &generated);
                    generated
                }
                Err(_) => FfmpegThumbnailer::generate_fallback_jpeg(&commit.message),
            }
        } else {
            FfmpegThumbnailer::generate_fallback_jpeg(&commit.message)
        }
    } else {
        FfmpegThumbnailer::generate_fallback_jpeg(&commit.message)
    };

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/jpeg"));
    Ok((StatusCode::OK, headers, bytes))
}

pub async fn add_commit_tag(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<CommitId>,
    Json(req): Json<TagRequest>,
) -> Result<StatusCode, ApiError> {
    if req.label.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "Tag label cannot be empty".to_string(),
        ));
    }
    let label = req.label.trim();
    state.commit_store.add_tag(Tag::new(id, label))?;

    // CRITICAL: On starring a commit, kick off low-res proxy render job in background
    if (label.eq_ignore_ascii_case("starred") || label.eq_ignore_ascii_case("star"))
        && let Ok(commit) = state.commit_store.get(&id)
    {
        let timeline = if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&id)
            && let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json)
        {
            Timeline::from_raw_state(&commit, &raw_state, RevertMode::Preview, false)
                .to_splice_commit_timeline()
        } else {
            SpliceCommitTimeline::from_commit(&commit)
        };
        state.proxy_cache.kick_off_background_render(timeline);
    }

    Ok(StatusCode::CREATED)
}

pub async fn remove_commit_tag(
    State(state): State<AppState>,
    AxumPath((id, label)): AxumPath<(CommitId, String)>,
) -> Result<StatusCode, ApiError> {
    state.commit_store.remove_tag(&id, &label)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_all_tags(State(state): State<AppState>) -> Result<Json<Vec<Tag>>, ApiError> {
    let tags = state.commit_store.list_all_tags()?;
    Ok(Json(tags))
}

pub async fn get_sync_status(State(state): State<AppState>) -> Json<SyncStatusReport> {
    Json(state.sync_engine.status().await)
}

pub async fn trigger_sync(
    State(state): State<AppState>,
) -> Result<Json<SyncTriggerResponse>, ApiError> {
    let count = state.sync_engine.trigger_sync_now().await?;
    let status = state.sync_engine.status().await;
    Ok(Json(SyncTriggerResponse {
        success: true,
        drained_count: count,
        status,
    }))
}

pub async fn toggle_offline(
    State(state): State<AppState>,
    Json(req): Json<OfflineToggleRequest>,
) -> Json<SyncStatusReport> {
    state.sync_engine.set_offline(req.offline);
    Json(state.sync_engine.status().await)
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct ExportRequest {
    #[serde(default)]
    pub commit_id: Option<CommitId>,
    #[serde(default)]
    pub format: Option<ExportFormat>,
    #[serde(default)]
    pub resolution: Option<String>,
    #[serde(default)]
    pub timeline_raw: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RetentionPolicyRequest {
    #[serde(default = "default_true")]
    pub keep_starred_forever: bool,
    #[serde(default = "default_thirty")]
    pub prune_after_days: u64,
}

fn default_true() -> bool {
    true
}

fn default_thirty() -> u64 {
    30
}

impl From<RetentionPolicyRequest> for RetentionPolicy {
    fn from(req: RetentionPolicyRequest) -> Self {
        Self {
            keep_starred_forever: req.keep_starred_forever,
            prune_after: Duration::from_secs(req.prune_after_days * 24 * 60 * 60),
        }
    }
}

fn reconstruct_timeline_for_export(
    state: &AppState,
    commit_id: Option<CommitId>,
    raw_timeline: Option<serde_json::Value>,
) -> Result<(CommitId, SpliceCommitTimeline), ApiError> {
    if let Some(raw) = raw_timeline
        && let Ok(raw_state) = serde_json::from_value::<timeline::RawEditorState>(raw)
    {
        let cid = commit_id.unwrap_or_default();
        let dummy_commit = Commit::create(
            None,
            "editor".to_string(),
            "Export composition".to_string(),
            MediaHash::compute(b"export"),
            vec![],
        );
        let tl = Timeline::from_raw_state(&dummy_commit, &raw_state, RevertMode::Preview, false);
        return Ok((cid, tl.to_splice_commit_timeline()));
    }

    let id = commit_id.ok_or_else(|| {
        ApiError::BadRequest("Either commit_id or timeline_raw is required".to_string())
    })?;

    let commit = state.commit_store.get(&id)?;

    if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&id)
        && let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json)
    {
        let tl = Timeline::from_raw_state(&commit, &raw_state, RevertMode::Preview, false);
        return Ok((id, tl.to_splice_commit_timeline()));
    }

    let tl = Timeline::reconstruct(
        &commit,
        RevertMode::Preview,
        false,
        Some(state.media_store.as_ref()),
    );
    Ok((id, tl.to_splice_commit_timeline()))
}

pub async fn start_export_commit(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<CommitId>,
    req: Option<Json<ExportRequest>>,
) -> Result<Json<ExportJob>, ApiError> {
    let req = req.map(|r| r.0).unwrap_or_default();
    let format = req.format.unwrap_or_default();
    let (cid, timeline) = reconstruct_timeline_for_export(&state, Some(id), req.timeline_raw)?;
    let job_id = state.export_manager.submit_job(cid, timeline, format).await;

    let job = state
        .export_manager
        .get_job(&job_id)
        .await
        .ok_or(ApiError::JobNotFound(job_id))?;

    Ok(Json(job))
}

pub async fn start_export_timeline(
    State(state): State<AppState>,
    Json(req): Json<ExportRequest>,
) -> Result<Json<ExportJob>, ApiError> {
    let format = req.format.unwrap_or_default();
    let (cid, timeline) = reconstruct_timeline_for_export(&state, req.commit_id, req.timeline_raw)?;
    let job_id = state.export_manager.submit_job(cid, timeline, format).await;

    let job = state
        .export_manager
        .get_job(&job_id)
        .await
        .ok_or(ApiError::JobNotFound(job_id))?;

    Ok(Json(job))
}

pub async fn export_status(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<JobId>,
) -> Result<Json<ExportJob>, ApiError> {
    let job = state
        .export_manager
        .get_job(&job_id)
        .await
        .ok_or(ApiError::JobNotFound(job_id))?;
    Ok(Json(job))
}

pub async fn download_export(
    State(state): State<AppState>,
    AxumPath(job_id): AxumPath<JobId>,
) -> Result<Response, ApiError> {
    let job = state
        .export_manager
        .get_job(&job_id)
        .await
        .ok_or(ApiError::JobNotFound(job_id))?;

    match job.status {
        JobStatus::Completed => {
            let output_path = job.output_path.ok_or_else(|| {
                ApiError::BadRequest("Export completed but output path is missing".to_string())
            })?;

            if !output_path.exists() {
                return Err(ApiError::BadRequest(
                    "Exported file not found on disk".to_string(),
                ));
            }

            let bytes =
                std::fs::read(&output_path).map_err(|e| ApiError::Store(StoreError::Io(e)))?;

            let ext = job.format.extension();
            let mut headers = HeaderMap::new();
            headers.insert(
                CONTENT_TYPE,
                HeaderValue::from_str(job.format.content_type())
                    .unwrap_or(HeaderValue::from_static("application/octet-stream")),
            );
            headers.insert(
                axum::http::header::CONTENT_DISPOSITION,
                HeaderValue::from_str(&format!(
                    "attachment; filename=\"splice_export_{job_id}.{ext}\""
                ))
                .unwrap_or(HeaderValue::from_static(
                    "attachment; filename=\"splice_export.mp4\"",
                )),
            );

            Ok((headers, bytes).into_response())
        }
        JobStatus::Processing | JobStatus::Queued => Err(ApiError::BadRequest(
            "Export job is still processing".to_string(),
        )),
        JobStatus::Failed(e) => Err(ApiError::BadRequest(format!("Export job failed: {e}"))),
    }
}

pub async fn run_gc(
    State(state): State<AppState>,
    req: Option<Json<RetentionPolicyRequest>>,
) -> Result<Json<GcReport>, ApiError> {
    let policy_req = req.map(|r| r.0).unwrap_or(RetentionPolicyRequest {
        keep_starred_forever: true,
        prune_after_days: 30,
    });
    let policy: RetentionPolicy = policy_req.into();

    let report = collect_garbage(
        state.commit_store.as_ref(),
        state.media_store.as_ref(),
        &policy,
    )?;

    Ok(Json(report))
}

pub async fn estimate_gc(State(state): State<AppState>) -> Result<Json<GcReport>, ApiError> {
    let policy = RetentionPolicy {
        keep_starred_forever: true,
        prune_after: Duration::from_secs(30 * 24 * 60 * 60),
    };

    let report = estimate_reclaimable(
        state.commit_store.as_ref(),
        state.media_store.as_ref(),
        &policy,
    )?;

    Ok(Json(report))
}

pub async fn export_video(
    State(state): State<AppState>,
    Json(req): Json<ExportRequest>,
) -> Result<Response, ApiError> {
    let mut export_clips = Vec::new();

    if let Some(raw_val) = req.timeline_raw {
        if let Ok(raw_state) = serde_json::from_value::<timeline::RawEditorState>(raw_val) {
            for track in raw_state.tracks {
                for clip in track.clips {
                    if let Some(media_path) = clip
                        .media
                        .parse::<MediaHash>()
                        .ok()
                        .and_then(|h| state.media_store.resolve(&h))
                    {
                        export_clips.push(ExportClip {
                            media_path,
                            in_point: clip.in_point,
                            out_point: clip.out_point,
                        });
                    }
                }
            }
        }
    } else if let Some(id) = req.commit_id {
        let commit = state.commit_store.get(&id)?;
        if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&id) {
            if let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json) {
                for track in raw_state.tracks {
                    for clip in track.clips {
                        if let Some(media_path) = clip
                            .media
                            .parse::<MediaHash>()
                            .ok()
                            .and_then(|h| state.media_store.resolve(&h))
                        {
                            export_clips.push(ExportClip {
                                media_path,
                                in_point: clip.in_point,
                                out_point: clip.out_point,
                            });
                        }
                    }
                }
            }
        } else {
            for hash in &commit.media_refs {
                if let Some(media_path) = state.media_store.resolve(hash) {
                    let dur = probe_duration(&media_path);
                    export_clips.push(ExportClip {
                        media_path,
                        in_point: 0.0,
                        out_point: dur,
                    });
                }
            }
        }
    }

    if export_clips.is_empty() {
        return Err(ApiError::BadRequest(
            "No valid video clips found to render and export".to_string(),
        ));
    }

    let temp_file = tempfile::Builder::new()
        .suffix(".mp4")
        .tempfile()
        .map_err(|e| ApiError::Store(StoreError::Io(e)))?;
    render_export_mp4(&export_clips, temp_file.path())?;

    let bytes = std::fs::read(temp_file.path()).map_err(|e| ApiError::Store(StoreError::Io(e)))?;

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("video/mp4"));
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"splice_export.mp4\""),
    );

    Ok((headers, bytes).into_response())
}

pub async fn export_commit_video(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<CommitId>,
) -> Result<Response, ApiError> {
    export_video(
        State(state),
        Json(ExportRequest {
            commit_id: Some(id),
            format: None,
            resolution: None,
            timeline_raw: None,
        }),
    )
    .await
}

pub async fn squash_commits(
    State(state): State<AppState>,
    Json(req): Json<SquashRequest>,
) -> Result<Json<CommitId>, ApiError> {
    if req.commit_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one commit ID is required to squash".to_string(),
        ));
    }

    let mut commits = Vec::with_capacity(req.commit_ids.len());
    for id in &req.commit_ids {
        commits.push(state.commit_store.get(id)?);
    }

    // INFO: Sort commits chronologically from oldest to newest
    commits.sort_by_key(|a| a.timestamp);

    let latest_commit = commits
        .last()
        .ok_or_else(|| ApiError::BadRequest("No commits found to squash".to_string()))?;
    let latest_id = latest_commit.id;

    let mut squashed = squash(&commits);
    if let Some(msg) = req.message
        && !msg.trim().is_empty()
    {
        squashed.message = msg.trim().to_string();
    }

    let new_id = state.commit_store.append(squashed)?;

    // INFO: Copy timeline JSON from latest commit if present
    if let Ok(Some(tl_json)) = state.commit_store.get_timeline(&latest_id) {
        let _ = state.commit_store.save_timeline(&new_id, &tl_json);
    }

    state.sync_engine.enqueue(new_id).await;

    Ok(Json(new_id))
}

pub async fn stream_commit_preview(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<CommitId>,
    req: Request<Body>,
) -> Result<Response, ApiError> {
    let commit = state.commit_store.get(&id)?;

    let timeline = if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&id) {
        if let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json) {
            Timeline::from_raw_state(&commit, &raw_state, RevertMode::Preview, false)
                .to_splice_commit_timeline()
        } else {
            SpliceCommitTimeline::from_commit(&commit)
        }
    } else {
        SpliceCommitTimeline::from_commit(&commit)
    };

    let proxy_path = match state.proxy_cache.render_or_get(&timeline) {
        Ok(p) => p,
        Err(e) => {
            // INFO: Fallback to direct media file if available
            if let Some(media_hash) = commit.media_refs.first() {
                if let Some(path) = state.media_store.resolve(media_hash) {
                    path
                } else {
                    return Err(ApiError::BadRequest(format!(
                        "Failed to render proxy video preview: {e}"
                    )));
                }
            } else {
                return Err(ApiError::BadRequest(format!(
                    "Failed to render proxy video preview: {e}"
                )));
            }
        }
    };

    let service = ServeFile::new(&proxy_path);
    let mut res = match service.oneshot(req).await {
        Ok(res) => res,
        Err(never) => match never {},
    };

    let is_octet_stream = res
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .map(|v| v == "application/octet-stream" || v == "text/plain")
        .unwrap_or(true);

    if is_octet_stream {
        res.headers_mut().insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("video/mp4"),
        );
    }

    Ok(res.into_response())
}

pub fn router(
    commit_store: Arc<dyn CommitStore>,
    media_store: Arc<dyn MediaStore>,
    thumbnail_cache: FsThumbnailCache,
    thumbnail_generator: Arc<dyn ThumbnailGenerator>,
) -> Router {
    let state = AppState::new(
        commit_store,
        media_store,
        thumbnail_cache,
        thumbnail_generator,
    );
    router_with_state(state)
}

pub fn router_with_sync(
    commit_store: Arc<dyn CommitStore>,
    media_store: Arc<dyn MediaStore>,
    thumbnail_cache: FsThumbnailCache,
    thumbnail_generator: Arc<dyn ThumbnailGenerator>,
    sync_engine: Arc<SyncEngine>,
) -> Router {
    let state = AppState::new_with_sync(
        commit_store,
        media_store,
        thumbnail_cache,
        thumbnail_generator,
        sync_engine,
    );
    router_with_state(state)
}

pub fn router_with_state(state: AppState) -> Router {
    let cors = CorsLayer::permissive();

    Router::new()
        .route("/repositories", get(list_repositories_handler).post(create_repository_handler))
        .route("/repositories/:id", get(get_repository_handler).delete(delete_repository_handler))
        .route("/repositories/:id/commits", get(list_repo_commits_handler))
        .route("/repositories/:id/tree", get(get_repo_commit_tree_handler))
        .route("/commits", get(list_commits).post(create_commit))
        .route("/commits/tree", get(get_commit_tree))
        .route("/commits/squash", post(squash_commits))
        .route("/commits/save-as", post(save_as_new_version))
        .route("/commits/diff", get(get_commits_diff))
        .route("/diff", post(compute_timeline_diff))
        .route("/commits/:id/revert", post(revert).get(revert))
        .route("/revert/:id", post(revert).get(revert))
        .route("/commits/:id/thumbnail", get(get_commit_thumbnail))
        .route("/commits/:id/preview.mp4", get(stream_commit_preview))
        .route("/commits/:id/preview", get(stream_commit_preview))
        .route("/commits/:id/tags", post(add_commit_tag))
        .route("/commits/:id/tags/:label", delete(remove_commit_tag))
        .route(
            "/commits/:id/export",
            post(start_export_commit).get(export_commit_video),
        )
        .route("/export", post(start_export_timeline).get(export_video))
        .route("/jobs/:job_id", get(export_status))
        .route("/exports/:job_id", get(export_status))
        .route("/exports/:job_id/download", get(download_export))
        .route("/gc/run", post(run_gc))
        .route("/admin/gc", post(run_gc))
        .route("/gc/estimate", get(estimate_gc))
        .route("/admin/gc/estimate", get(estimate_gc))
        .route("/gc/status", get(estimate_gc))
        .route("/tags", get(list_all_tags))
        .route("/media", post(upload_media))
        .route("/media/:hash", get(serve_media))
        .route("/sync/status", get(get_sync_status))
        .route("/sync/trigger", post(trigger_sync))
        .route("/sync/offline", post(toggle_offline))
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(cors)
        .with_state(state)

}
