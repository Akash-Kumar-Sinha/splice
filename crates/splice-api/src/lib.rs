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
use splice_commit::{Commit, CommitId, CommitStore, CommitTreeNode, StoreError, Tag};
use splice_diff::TimelineDiff;
use splice_media::{MediaHash, MediaStore};
use splice_render::{
    FfmpegThumbnailer, FsThumbnailCache, ThumbnailGenerator, ThumbnailJob, ThumbnailQueue,
};
use splice_sync::{S3RemoteStore, SyncEngine, SyncError, SyncStatusReport};

use tempfile::NamedTempFile;
use time::OffsetDateTime;
use tower::ServiceExt;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeFile;

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
        let thumbnail_queue =
            ThumbnailQueue::new(thumbnail_cache.clone(), thumbnail_generator.clone(), 64);

        Self {
            commit_store,
            media_store,
            thumbnail_cache,
            thumbnail_generator,
            thumbnail_queue,
            sync_engine,
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
    pub timeline_a: splice_commit::Timeline,
    pub timeline_b: splice_commit::Timeline,
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
    Media(#[from] splice_media::StoreError),

    #[error("Media not found: {0}")]
    MediaNotFound(MediaHash),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Thumbnail error: {0}")]
    Thumbnail(#[from] splice_render::ThumbError),

    #[error("Sync error: {0}")]
    Sync(#[from] SyncError),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::Store(StoreError::CommitNotFound(_)) | Self::MediaNotFound(_) => {
                (StatusCode::NOT_FOUND, self.to_string())
            }
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

pub async fn list_commits(
    State(state): State<AppState>,
) -> Result<Json<Vec<CommitResponse>>, ApiError> {
    // INFO: List all commits across all branches and root trees, sorted newest first
    let mut commits = state.commit_store.list_all_commits()?;
    commits.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
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
    let id = state.commit_store.append(commit)?;

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
        .unwrap_or_else(|| "editor@splice.dev".to_string());

    let commit = Commit::new(
        new_id,
        Some(req.from),
        OffsetDateTime::now_utc(),
        author,
        req.message.trim().to_string(),
        timeline_hash,
        media_refs.clone(),
    );

    let id = state.commit_store.append(commit)?;

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
) -> Result<Json<Vec<CommitTreeNode>>, ApiError> {
    let all_commits = state.commit_store.list_all_commits()?;
    let tree = splice_commit::build_commit_tree(&all_commits, |id| {
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
            splice_commit::Timeline::from_commit(&commit_a)
        }
    } else {
        splice_commit::Timeline::from_commit(&commit_a)
    };

    let tl_b = if let Ok(Some(raw_json)) = state.commit_store.get_timeline(&query.to) {
        if let Ok(raw_state) = serde_json::from_str::<timeline::RawEditorState>(&raw_json) {
            Timeline::from_raw_state(&commit_b, &raw_state, RevertMode::Preview, false)
                .to_splice_commit_timeline()
        } else {
            splice_commit::Timeline::from_commit(&commit_b)
        }
    } else {
        splice_commit::Timeline::from_commit(&commit_b)
    };

    let diff = splice_diff::diff(&tl_a, &tl_b);
    Ok(Json(diff))
}

pub async fn compute_timeline_diff(
    Json(payload): Json<DiffTimelinePayload>,
) -> Result<Json<TimelineDiff>, ApiError> {
    let diff = splice_diff::diff(&payload.timeline_a, &payload.timeline_b);
    Ok(Json(diff))
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
    state.commit_store.add_tag(Tag::new(id, req.label.trim()))?;
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
    pub timeline_raw: Option<serde_json::Value>,
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
                        export_clips.push(splice_render::ExportClip {
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
                            export_clips.push(splice_render::ExportClip {
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
                    export_clips.push(splice_render::ExportClip {
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
    splice_render::render_export_mp4(&export_clips, temp_file.path())?;

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
            timeline_raw: None,
        }),
    )
    .await
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
        .route("/commits", get(list_commits).post(create_commit))
        .route("/commits/tree", get(get_commit_tree))
        .route("/commits/save-as", post(save_as_new_version))
        .route("/commits/diff", get(get_commits_diff))
        .route("/diff", post(compute_timeline_diff))
        .route("/commits/:id/revert", post(revert).get(revert))
        .route("/commits/:id/thumbnail", get(get_commit_thumbnail))
        .route("/commits/:id/tags", post(add_commit_tag))
        .route("/commits/:id/tags/:label", delete(remove_commit_tag))
        .route("/commits/:id/export", get(export_commit_video))
        .route("/export", post(export_video))
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
