use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use splice_api::router;
use splice_api::seed::seed_if_empty;
use splice_commit::SqliteCommitStore;
use splice_media::FsMediaStore;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let db_path = std::env::var("DATABASE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("splice.db"));

    let media_path = std::env::var("MEDIA_STORE_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".media_store"));

    let commit_store = SqliteCommitStore::open(&db_path)?;
    // INFO: Seed initial commits if database is empty so frontend shows commits immediately
    let seeded = seed_if_empty(&commit_store)?;
    if seeded > 0 {
        tracing::info!("Seeded {seeded} initial commits into database at {db_path:?}");
    }

    let media_store = FsMediaStore::init(&media_path)?;

    let commit_store = Arc::new(commit_store);
    let media_store = Arc::new(media_store);

    let app = router(commit_store, media_store);

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
