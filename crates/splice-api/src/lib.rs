pub mod seed;

use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use splice_commit::{Commit, CommitId, CommitStore, StoreError};
use splice_media::MediaHash;
use time::OffsetDateTime;
use tower_http::cors::{Any, CorsLayer};

#[derive(Debug, Deserialize, Serialize)]
pub struct NewCommitRequest {
    pub parent: Option<CommitId>,
    pub author: String,
    pub message: String,
    pub timeline_hash: MediaHash,
    #[serde(default)]
    pub media_refs: Vec<MediaHash>,
}

#[derive(thiserror::Error, Debug)]
pub enum ApiError {
    #[error("Commit store error: {0}")]
    Store(#[from] StoreError),

    #[error("Bad request: {0}")]
    BadRequest(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::Store(StoreError::CommitNotFound(_)) => (StatusCode::NOT_FOUND, self.to_string()),
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

pub async fn list_commits(
    State(store): State<Arc<dyn CommitStore>>,
) -> Result<Json<Vec<Commit>>, ApiError> {
    let commits = store.chain_from_head()?;
    Ok(Json(commits))
}

pub async fn create_commit(
    State(store): State<Arc<dyn CommitStore>>,
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

    let id = store.append(commit)?;
    Ok((StatusCode::CREATED, Json(id)))
}

pub fn router(store: Arc<dyn CommitStore>) -> Router {
    // INFO: CorsLayer permits frontend on localhost:3000 to interact with the API
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:3000"),
            HeaderValue::from_static("http://127.0.0.1:3000"),
        ])
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/commits", get(list_commits).post(create_commit))
        .layer(cors)
        .with_state(store)
}
