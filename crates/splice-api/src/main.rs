use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use splice_api::router_with_sync;
use splice_sdk::{
    FfmpegThumbnailer, FsMediaStore, FsThumbnailCache, S3RemoteStore, SqliteCommitStore, SyncEngine,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let db_path = std::env::var("DATABASE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("splice.db"));

    let media_path = std::env::var("MEDIA_STORE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".media_store"));

    let thumb_path = std::env::var("THUMBNAIL_CACHE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".thumbnail_cache"));

    let commit_store = SqliteCommitStore::open(&db_path)?;
    let media_store = FsMediaStore::init(&media_path)?;
    let thumb_cache = FsThumbnailCache::init(&thumb_path)?;
    let thumbnailer = Arc::new(FfmpegThumbnailer::new());

    let commit_store = Arc::new(commit_store);
    let media_store = Arc::new(media_store);

    let remote_target = std::env::var("SPLICE_REMOTE_TARGET")
        .unwrap_or_else(|_| "s3://splice-cloud-backups".to_string());
    let memory_obj_store = Arc::new(object_store::memory::InMemory::new());
    let remote_store = Arc::new(S3RemoteStore::new(memory_obj_store));
    let sync_engine = SyncEngine::new(remote_store, commit_store.clone(), &remote_target);

    let app = router_with_sync(
        commit_store,
        media_store,
        thumb_cache,
        thumbnailer,
        sync_engine,
    );

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Splice API server listening on http://{addr}");
    println!("Splice API server listening on http://127.0.0.1:{port}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
