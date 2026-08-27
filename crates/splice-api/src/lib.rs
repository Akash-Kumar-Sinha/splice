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
use splice_commit::{Commit, CommitId, CommitStore, StoreError, Tag};
use splice_diff::TimelineDiff;
use splice_media::{MediaHash, MediaStore};
use splice_render::{
    FfmpegThumbnailer, FsThumbnailCache, ThumbnailGenerator, ThumbnailJob, ThumbnailQueue,
};
use tempfile::NamedTempFile;
use time::OffsetDateTime;
use tower::ServiceExt;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeFile;

pub use timeline::{RevertMode, Timeline, TimelineClip, TimelineTrack};

#[derive(Clone)]
pub struct AppState {
    pub commit_store: Arc<dyn CommitStore>,
    pub media_store: Arc<dyn MediaStore>,
    pub thumbnail_cache: FsThumbnailCache,
    pub thumbnail_generator: Arc<dyn ThumbnailGenerator>,
    pub thumbnail_queue: ThumbnailQueue,
}

impl AppState {
    pub fn new(
        commit_store: Arc<dyn CommitStore>,
        media_store: Arc<dyn MediaStore>,
        thumbnail_cache: FsThumbnailCache,
        thumbnail_generator: Arc<dyn ThumbnailGenerator>,
    ) -> Self {
        let thumbnail_queue =
            ThumbnailQueue::new(thumbnail_cache.clone(), thumbnail_generator.clone(), 64);

        Self {
            commit_store,
            media_store,
            thumbnail_cache,
            thumbnail_generator,
            thumbnail_queue,
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
    let commits = state.commit_store.chain_from_head()?;
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

    let id = state.commit_store.append(commit)?;

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

pub async fn get_commits_diff(
    State(state): State<AppState>,
    Query(query): Query<DiffQuery>,
) -> Result<Json<TimelineDiff>, ApiError> {
    let commit_a = state.commit_store.get(&query.from)?;
    let commit_b = state.commit_store.get(&query.to)?;

    let tl_a = splice_commit::Timeline::from_commit(&commit_a);
    let tl_b = splice_commit::Timeline::from_commit(&commit_b);

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

    // CRITICAL: Stash-before-revert creates an auto-checkpoint commit for dirty working state
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
        let _ = state.commit_store.append(stash_commit)?;
    }

    // CRITICAL: Fetch target commit to verify existence prior to state transition
    let target_commit = state.commit_store.get(&id)?;

    let is_head = match mode {
        RevertMode::Preview => {
            // INFO: In Preview mode (detached HEAD), inspect state without altering HEAD ref
            let current_head = state.commit_store.head_id()?;
            current_head == Some(id)
        }
        RevertMode::Restore => {
            // CRITICAL: In Restore mode, update HEAD reference to make target commit active HEAD
            state.commit_store.set_head(&id)?;
            true
        }
    };

    let timeline = Timeline::reconstruct(&target_commit, mode, is_head);
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

    // INFO: ServeFile handles HTTP byte ranges (206 Partial Content) for smooth HTML5 video seeking
    let service = ServeFile::new(path);
    let mut res = match service.oneshot(req).await {
        Ok(res) => res,
        Err(never) => match never {},
    };

    // CRITICAL: Ensure Content-Type is video/mp4 so browsers correctly initialize audio and video decoders
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

    // Check cached thumbnail
    if let Some(cached_bytes) = state.thumbnail_cache.get(&id_str) {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/jpeg"));
        return Ok((StatusCode::OK, headers, cached_bytes));
    }

    // Try generating from commit media ref
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

    // INFO: CorsLayer permits frontend on local dev ports to interact with the API
    let cors = CorsLayer::permissive();

    Router::new()
        .route("/commits", get(list_commits).post(create_commit))
        .route("/commits/diff", get(get_commits_diff))
        .route("/diff", post(compute_timeline_diff))
        .route("/commits/:id/revert", post(revert))
        .route("/commits/:id/thumbnail", get(get_commit_thumbnail))
        .route("/commits/:id/tags", post(add_commit_tag))
        .route("/commits/:id/tags/:label", delete(remove_commit_tag))
        .route("/tags", get(list_all_tags))
        .route("/media", post(upload_media))
        .route("/media/:hash", get(serve_media))
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}
