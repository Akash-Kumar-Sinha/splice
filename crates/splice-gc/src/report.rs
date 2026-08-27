use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GcReport {
    pub commits_scanned: usize,
    pub commits_retained: usize,
    pub commits_pruned: usize,
    pub media_scanned: usize,
    pub media_retained: usize,
    pub media_pruned: usize,
    pub bytes_freed: u64,
    pub total_media_bytes: u64,
    pub remaining_media_bytes: u64,
    pub dry_run: bool,
}
