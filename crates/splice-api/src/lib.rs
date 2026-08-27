pub mod seed;
pub mod timeline;

use std::io::Write;
use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::{Multipart, Path as AxumPath, Query, State};
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use splice_commit::{Commit, CommitId, CommitStore, StoreError};
use splice_media::{MediaHash, MediaStore};
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
}

impl AppState {
    pub fn new(commit_store: Arc<dyn CommitStore>, media_store: Arc<dyn MediaStore>) -> Self {
        Self {
            commit_store,
            media_store,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResponse {
    pub hash: MediaHash,
    pub duration: f64,
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

pub async fn list_commits(State(state): State<AppState>) -> Result<Json<Vec<Commit>>, ApiError> {
    let commits = state.commit_store.chain_from_head()?;
    Ok(Json(commits))
}

pub async fn create_commit(
    State(state): State<AppState>,
    Json(req): Json<NewCommitRequest>,
) -> Result<(StatusCode, Json<CommitId>), ApiError> {
    let commit = Commit::new(
        CommitId::new(),
        req.parent,
        OffsetDateTime::now_utc(),
        req.author,
        req.message,
        req.timeline_hash,
        req.media_refs,
    );

    let id = state.commit_store.append(commit)?;
    Ok((StatusCode::CREATED, Json(id)))
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

pub fn router(commit_store: Arc<dyn CommitStore>, media_store: Arc<dyn MediaStore>) -> Router {
    let state = AppState::new(commit_store, media_store);

    // INFO: CorsLayer permits frontend on local dev ports to interact with the API
    let cors = CorsLayer::permissive();

    Router::new()
        .route("/commits", get(list_commits).post(create_commit))
        .route("/commits/:id/revert", post(revert))
        .route("/media", post(upload_media))
        .route("/media/:hash", get(serve_media))
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}
