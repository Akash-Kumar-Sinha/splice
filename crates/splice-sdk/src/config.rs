use std::path::PathBuf;

use splice_adapter::{GenericSerializer, TimelineSerializer};
use splice_gc::RetentionPolicy;

#[derive(Clone)]
pub enum SyncBackend {
    None,
    Memory(std::sync::Arc<dyn object_store::ObjectStore>),
    S3 {
        bucket: String,
        endpoint: Option<String>,
        region: Option<String>,
        access_key_id: String,
        secret_access_key: String,
    },
    R2 {
        bucket: String,
        account_id: String,
        access_key_id: String,
        secret_access_key: String,
    },
}

pub struct SpliceConfig {
    pub storage_path: PathBuf,
    pub sync_backend: Option<SyncBackend>,
    pub adapter: Box<dyn TimelineSerializer>,
    pub author: String,
    pub retention_policy: Option<RetentionPolicy>,
}

impl SpliceConfig {
    pub fn new(storage_path: impl Into<PathBuf>) -> Self {
        Self {
            storage_path: storage_path.into(),
            sync_backend: None,
            adapter: Box::new(GenericSerializer::new()),
            author: "Splice User".to_string(),
            retention_policy: None,
        }
    }

    pub fn with_adapter(mut self, adapter: impl TimelineSerializer + 'static) -> Self {
        self.adapter = Box::new(adapter);
        self
    }

    pub fn with_sync(mut self, sync: SyncBackend) -> Self {
        self.sync_backend = Some(sync);
        self
    }

    pub fn with_author(mut self, author: impl Into<String>) -> Self {
        self.author = author.into();
        self
    }

    pub fn with_retention_policy(mut self, policy: RetentionPolicy) -> Self {
        self.retention_policy = Some(policy);
        self
    }
}
