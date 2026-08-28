pub mod config;
pub mod error;
pub mod facade;
pub mod revert;

pub use config::{SpliceConfig, SyncBackend};
pub use error::SpliceError;
pub use facade::Splice;
pub use revert::RevertMode;

// Re-exports from internal subsystem crates
pub use splice_adapter::{
    GenericSerializer, ResolveItem, ResolveProject, ResolveSerializer, ResolveTrack,
    SerializeError, TimelineSerializer,
};
pub use splice_commit::{
    Clip, Commit, CommitId, CommitStore, CommitTreeNode, SqliteCommitStore, StoreError, Tag,
    Timeline, Track, build_commit_tree, squash,
};
pub use splice_diff::{ClipRef, TimeRange, TimelineDiff, diff};
pub use splice_gc::{GcError, GcReport, RetentionPolicy, collect_garbage, estimate_reclaimable};
pub use splice_media::{
    FsMediaStore, MediaHash, MediaStore, ParseMediaHashError, StoreError as MediaStoreError,
};

pub use splice_render::{
    ExportClip, ExportFormat, ExportJob, ExportJobManager, FfmpegThumbnailer, FsProxyCache,
    FsThumbnailCache, FullResExportRenderer, JobId, JobStatus, LowResProxyRenderer, ProxyRenderer,
    RenderError, ThumbnailGenerator, ThumbnailJob, ThumbnailQueue, render_export_format,
    render_export_mp4, render_low_res_proxy_mp4,
};

pub use splice_sync::{
    RemoteCommitStore, S3RemoteStore, SyncEngine, SyncError, SyncState, SyncStatusReport,
};
