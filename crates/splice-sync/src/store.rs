use std::sync::Arc;

use async_trait::async_trait;
use bytes::Bytes;
use futures::StreamExt;
use object_store::ObjectStore;
use object_store::path::Path as ObjPath;
use splice_commit::{Commit, CommitId};
use splice_media::MediaHash;

use crate::error::SyncError;

#[async_trait]
pub trait RemoteCommitStore: Send + Sync {
    async fn push(&self, commits: &[Commit]) -> Result<(), SyncError>;
    async fn pull_since(&self, last_known: Option<CommitId>) -> Result<Vec<Commit>, SyncError>;
}

#[derive(Clone)]
pub struct S3RemoteStore {
    client: Arc<dyn ObjectStore>,
}

impl S3RemoteStore {
    pub fn new(client: Arc<dyn ObjectStore>) -> Self {
        Self { client }
    }

    pub async fn push_media(&self, hash: &MediaHash, data: Bytes) -> Result<(), SyncError> {
        // INFO: Store media blobs lazily under media/<media_hash> in object store
        let location = ObjPath::from(format!("media/{hash}"));
        self.client.put(&location, data.into()).await?;
        Ok(())
    }

    pub async fn pull_media(&self, hash: &MediaHash) -> Result<Option<Bytes>, SyncError> {
        let location = ObjPath::from(format!("media/{hash}"));
        match self.client.get(&location).await {
            Ok(get_result) => {
                let bytes = get_result.bytes().await?;
                Ok(Some(bytes))
            }
            Err(object_store::Error::NotFound { .. }) => Ok(None),
            Err(e) => Err(SyncError::ObjectStore(e)),
        }
    }

    pub async fn has_media(&self, hash: &MediaHash) -> Result<bool, SyncError> {
        let location = ObjPath::from(format!("media/{hash}"));
        match self.client.head(&location).await {
            Ok(_) => Ok(true),
            Err(object_store::Error::NotFound { .. }) => Ok(false),
            Err(e) => Err(SyncError::ObjectStore(e)),
        }
    }
}

#[async_trait]
impl RemoteCommitStore for S3RemoteStore {
    async fn push(&self, commits: &[Commit]) -> Result<(), SyncError> {
        // CRITICAL: Append-only remote push writes each commit as an immutable JSON blob
        for commit in commits {
            let json = serde_json::to_vec(commit)?;
            let location = ObjPath::from(format!("commits/{}.json", commit.id));
            self.client.put(&location, Bytes::from(json).into()).await?;
        }
        Ok(())
    }

    async fn pull_since(&self, last_known: Option<CommitId>) -> Result<Vec<Commit>, SyncError> {
        let prefix = ObjPath::from("commits");
        let mut stream = self.client.list(Some(&prefix));
        let mut commits = Vec::new();

        while let Some(meta_res) = stream.next().await {
            let meta = meta_res?;
            if meta.location.as_ref().ends_with(".json") {
                let get_res = self.client.get(&meta.location).await?;
                let bytes = get_res.bytes().await?;
                let commit: Commit = serde_json::from_slice(&bytes)?;
                commits.push(commit);
            }
        }

        // INFO: Sort commits chronologically by timestamp
        commits.sort_by_key(|c| c.timestamp);

        if let Some(pos) =
            last_known.and_then(|target_id| commits.iter().position(|c| c.id == target_id))
        {
            return Ok(commits[pos + 1..].to_vec());
        }

        Ok(commits)
    }
}
