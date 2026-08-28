use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use splice_adapter::TimelineSerializer;
use splice_commit::{
    Commit, CommitId, CommitStore, CommitTreeNode, SqliteCommitStore, Tag, Timeline,
};
use splice_diff::TimelineDiff;
use splice_gc::{GcReport, RetentionPolicy};
use splice_media::{FsMediaStore, MediaHash, MediaStore};
use splice_render::{
    ExportFormat, ExportJobManager, FfmpegThumbnailer, FsProxyCache, FsThumbnailCache,
    FullResExportRenderer, LowResProxyRenderer, ThumbnailQueue,
};

use splice_sync::{S3RemoteStore, SyncEngine, SyncStatusReport};

use crate::config::{SpliceConfig, SyncBackend};
use crate::error::SpliceError;
use crate::revert::RevertMode;

#[derive(Clone)]
pub struct Splice {
    commit_store: Arc<SqliteCommitStore>,
    media_store: Arc<FsMediaStore>,
    adapter: Arc<dyn TimelineSerializer>,
    sync_engine: Option<Arc<SyncEngine>>,
    proxy_cache: FsProxyCache,
    export_renderer: Arc<FullResExportRenderer>,
    export_manager: Arc<ExportJobManager>,
    author: String,
    storage_path: PathBuf,
    _temp_dir: Option<Arc<tempfile::TempDir>>,
}

impl Splice {
    pub fn new(config: SpliceConfig) -> Result<Self, SpliceError> {
        let root = &config.storage_path;
        let media_dir = root.join("media");
        let cache_dir = root.join("cache");
        let proxy_dir = cache_dir.join("proxy");
        let thumbs_dir = cache_dir.join("thumbnails");
        let export_dir = root.join("exports");

        fs::create_dir_all(&media_dir)?;
        fs::create_dir_all(&proxy_dir)?;
        fs::create_dir_all(&thumbs_dir)?;
        fs::create_dir_all(&export_dir)?;

        let commit_store = Arc::new(SqliteCommitStore::open(root.join("db.sqlite3"))?);
        let media_store = Arc::new(FsMediaStore::new(&media_dir));

        let thumb_gen = Arc::new(FfmpegThumbnailer::new());
        let thumb_cache = FsThumbnailCache::new(&thumbs_dir);
        let _thumbnail_queue = ThumbnailQueue::new(thumb_cache, thumb_gen, 64);

        let proxy_renderer = Arc::new(LowResProxyRenderer::new(&media_dir, &proxy_dir));
        let proxy_cache = FsProxyCache::new(&proxy_dir, proxy_renderer);

        let export_renderer = Arc::new(FullResExportRenderer::new(&media_dir, &export_dir));
        let export_manager = Arc::new(ExportJobManager::new(export_renderer.clone()));

        let sync_engine = match &config.sync_backend {
            Some(SyncBackend::Memory(obj_store)) => {
                let remote = Arc::new(S3RemoteStore::new(obj_store.clone()));
                Some(SyncEngine::new(
                    remote,
                    commit_store.clone(),
                    "memory://remote",
                ))
            }
            Some(SyncBackend::S3 {
                bucket,
                endpoint,
                region,
                access_key_id,
                secret_access_key,
            }) => {
                let mut builder = object_store::aws::AmazonS3Builder::new()
                    .with_bucket_name(bucket)
                    .with_access_key_id(access_key_id)
                    .with_secret_access_key(secret_access_key);

                if let Some(ep) = endpoint {
                    builder = builder.with_endpoint(ep);
                }
                if let Some(r) = region {
                    builder = builder.with_region(r);
                } else {
                    builder = builder.with_region("us-east-1");
                }

                let s3 = builder
                    .build()
                    .map_err(|e| SpliceError::InvalidConfiguration(e.to_string()))?;
                let remote = Arc::new(S3RemoteStore::new(Arc::new(s3)));
                Some(SyncEngine::new(
                    remote,
                    commit_store.clone(),
                    format!("s3://{bucket}"),
                ))
            }
            Some(SyncBackend::R2 {
                bucket,
                account_id,
                access_key_id,
                secret_access_key,
            }) => {
                let endpoint = format!("https://{account_id}.r2.cloudflarestorage.com");
                let s3 = object_store::aws::AmazonS3Builder::new()
                    .with_bucket_name(bucket)
                    .with_endpoint(endpoint)
                    .with_region("auto")
                    .with_access_key_id(access_key_id)
                    .with_secret_access_key(secret_access_key)
                    .build()
                    .map_err(|e| SpliceError::InvalidConfiguration(e.to_string()))?;
                let remote = Arc::new(S3RemoteStore::new(Arc::new(s3)));
                Some(SyncEngine::new(
                    remote,
                    commit_store.clone(),
                    format!("r2://{bucket}"),
                ))
            }
            _ => None,
        };

        Ok(Self {
            commit_store,
            media_store,
            adapter: Arc::from(config.adapter),
            sync_engine,
            proxy_cache,
            export_renderer,
            export_manager,
            author: config.author,
            storage_path: config.storage_path,
            _temp_dir: None,
        })
    }

    pub fn in_memory() -> Result<Self, SpliceError> {
        let temp = tempfile::tempdir()?;
        let path = temp.path().to_path_buf();
        let mut config = SpliceConfig::new(path);
        config.author = "In-Memory User".to_string();

        let mut instance = Self::new(config)?;
        instance._temp_dir = Some(Arc::new(temp));
        Ok(instance)
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_path
    }

    pub fn author(&self) -> &str {
        &self.author
    }

    pub fn save(
        &self,
        timeline: Timeline,
        message: impl Into<String>,
    ) -> Result<CommitId, SpliceError> {
        self.save_with_author(timeline, message, &self.author)
    }

    pub fn save_with_author(
        &self,
        timeline: Timeline,
        message: impl Into<String>,
        author: impl Into<String>,
    ) -> Result<CommitId, SpliceError> {
        let parent_id = self.commit_store.head_id()?;
        let timeline_hash = timeline.compute_hash();
        let media_refs = timeline.media_refs();
        let commit = Commit::create(
            parent_id,
            author.into(),
            message.into(),
            timeline_hash,
            media_refs,
        );

        let raw_json = serde_json::to_string(&timeline)?;
        let commit_id = self.commit_store.append(commit)?;
        self.commit_store.save_timeline(&commit_id, &raw_json)?;
        self.commit_store.set_head(&commit_id)?;

        if let Some(sync) = &self.sync_engine
            && let Ok(handle) = tokio::runtime::Handle::try_current()
        {
            let sync_clone = sync.clone();
            handle.spawn(async move {
                sync_clone.enqueue(commit_id).await;
            });
        }

        self.proxy_cache.kick_off_background_render(timeline);
        Ok(commit_id)
    }

    pub fn history(&self) -> Result<Vec<Commit>, SpliceError> {
        let mut commits = self.commit_store.list_all_commits()?;
        commits.sort_by_key(|c| std::cmp::Reverse(c.timestamp));
        Ok(commits)
    }

    pub fn get_commit(&self, commit: &CommitId) -> Result<Commit, SpliceError> {
        Ok(self.commit_store.get(commit)?)
    }

    pub fn head(&self) -> Result<Option<Commit>, SpliceError> {
        if let Some(head_id) = self.commit_store.head_id()? {
            Ok(Some(self.commit_store.get(&head_id)?))
        } else {
            Ok(None)
        }
    }

    pub fn revert(&self, commit_id: CommitId, mode: RevertMode) -> Result<Timeline, SpliceError> {
        let commit = self.commit_store.get(&commit_id)?;
        let timeline = if let Ok(Some(raw_json)) = self.commit_store.get_timeline(&commit_id) {
            serde_json::from_str::<Timeline>(&raw_json)?
        } else {
            Timeline::from_commit(&commit)
        };

        if mode == RevertMode::Restore {
            self.commit_store.set_head(&commit_id)?;
        }

        Ok(timeline)
    }

    pub fn diff(&self, a: CommitId, b: CommitId) -> Result<TimelineDiff, SpliceError> {
        let commit_a = self.commit_store.get(&a)?;
        let commit_b = self.commit_store.get(&b)?;

        let timeline_a = if let Ok(Some(raw_json)) = self.commit_store.get_timeline(&a) {
            serde_json::from_str::<Timeline>(&raw_json)?
        } else {
            Timeline::from_commit(&commit_a)
        };

        let timeline_b = if let Ok(Some(raw_json)) = self.commit_store.get_timeline(&b) {
            serde_json::from_str::<Timeline>(&raw_json)?
        } else {
            Timeline::from_commit(&commit_b)
        };

        Ok(splice_diff::diff(&timeline_a, &timeline_b))
    }

    pub fn diff_timelines(&self, a: &Timeline, b: &Timeline) -> TimelineDiff {
        splice_diff::diff(a, b)
    }

    pub fn tag(&self, commit: CommitId, label: impl Into<String>) -> Result<(), SpliceError> {
        self.commit_store.add_tag(Tag::new(commit, label))?;
        Ok(())
    }

    pub fn remove_tag(
        &self,
        commit: CommitId,
        label: impl Into<String>,
    ) -> Result<(), SpliceError> {
        self.commit_store.remove_tag(&commit, &label.into())?;
        Ok(())
    }

    pub fn get_tags(&self, commit: &CommitId) -> Result<Vec<String>, SpliceError> {
        Ok(self.commit_store.get_tags(commit)?)
    }

    pub fn list_tags(&self) -> Result<Vec<Tag>, SpliceError> {
        Ok(self.commit_store.list_all_tags()?)
    }

    pub fn export(
        &self,
        commit_id: CommitId,
        format: ExportFormat,
    ) -> Result<PathBuf, SpliceError> {
        let commit = self.commit_store.get(&commit_id)?;
        let timeline = if let Ok(Some(raw_json)) = self.commit_store.get_timeline(&commit_id) {
            serde_json::from_str::<Timeline>(&raw_json)?
        } else {
            Timeline::from_commit(&commit)
        };

        let path = self.export_renderer.render_with_format(&timeline, format)?;
        Ok(path)
    }

    pub fn export_timeline(
        &self,
        timeline: &Timeline,
        format: ExportFormat,
    ) -> Result<PathBuf, SpliceError> {
        let path = self.export_renderer.render_with_format(timeline, format)?;
        Ok(path)
    }

    pub fn render_proxy(&self, timeline: &Timeline) -> Result<PathBuf, SpliceError> {
        Ok(self.proxy_cache.render_or_get(timeline)?)
    }

    pub fn ingest_media(&self, path: impl AsRef<Path>) -> Result<MediaHash, SpliceError> {
        Ok(self.media_store.ingest(path.as_ref())?)
    }

    pub fn get_media_path(&self, hash: &MediaHash) -> Option<PathBuf> {
        self.media_store.resolve(hash)
    }

    pub fn gc(&self, policy: &RetentionPolicy) -> Result<GcReport, SpliceError> {
        Ok(splice_gc::collect_garbage(
            self.commit_store.as_ref(),
            self.media_store.as_ref(),
            policy,
        )?)
    }

    pub fn estimate_gc(&self, policy: &RetentionPolicy) -> Result<GcReport, SpliceError> {
        Ok(splice_gc::estimate_reclaimable(
            self.commit_store.as_ref(),
            self.media_store.as_ref(),
            policy,
        )?)
    }

    pub async fn sync(&self) -> Result<usize, SpliceError> {
        if let Some(sync) = &self.sync_engine {
            Ok(sync.trigger_sync_now().await?)
        } else {
            Err(SpliceError::SyncNotConfigured)
        }
    }

    pub async fn sync_status(&self) -> Result<SyncStatusReport, SpliceError> {
        if let Some(sync) = &self.sync_engine {
            Ok(sync.status().await)
        } else {
            Err(SpliceError::SyncNotConfigured)
        }
    }

    pub fn tree(&self) -> Result<Vec<CommitTreeNode>, SpliceError> {
        let commits = self.commit_store.list_all_commits()?;
        let store = self.commit_store.clone();
        Ok(splice_commit::build_commit_tree(&commits, move |id| {
            store.get_tags(id).unwrap_or_default()
        }))
    }

    pub fn squash(
        &self,
        commits: &[CommitId],
        message: impl Into<String>,
    ) -> Result<CommitId, SpliceError> {
        let mut loaded = Vec::with_capacity(commits.len());
        for id in commits {
            loaded.push(self.commit_store.get(id)?);
        }

        let mut squashed = splice_commit::squash(&loaded);
        squashed.message = message.into();

        let new_id = self.commit_store.append(squashed)?;
        if let Some(last) = commits.last()
            && let Ok(Some(tl_json)) = self.commit_store.get_timeline(last)
        {
            let _ = self.commit_store.save_timeline(&new_id, &tl_json);
        }

        self.commit_store.set_head(&new_id)?;
        Ok(new_id)
    }

    pub fn to_native_project(&self, timeline: &Timeline) -> Result<Vec<u8>, SpliceError> {
        Ok(self.adapter.from_timeline(timeline)?)
    }

    pub fn from_native_project(&self, bytes: &[u8]) -> Result<Timeline, SpliceError> {
        Ok(self.adapter.to_timeline(bytes)?)
    }

    pub fn commit_store(&self) -> Arc<dyn CommitStore> {
        self.commit_store.clone()
    }

    pub fn media_store(&self) -> Arc<dyn MediaStore> {
        self.media_store.clone()
    }

    pub fn sync_engine(&self) -> Option<Arc<SyncEngine>> {
        self.sync_engine.clone()
    }

    pub fn proxy_cache(&self) -> FsProxyCache {
        self.proxy_cache.clone()
    }

    pub fn export_manager(&self) -> Arc<ExportJobManager> {
        self.export_manager.clone()
    }
}
