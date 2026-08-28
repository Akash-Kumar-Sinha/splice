use std::collections::{HashMap, HashSet};

use splice_commit::{Commit, CommitId, CommitStore};
use splice_media::{MediaHash, MediaStore};
use time::OffsetDateTime;

use crate::error::GcError;
use crate::policy::RetentionPolicy;
use crate::report::GcReport;

// CRITICAL: Mark-and-sweep Garbage Collection for historical commits and content-addressed media
pub fn collect_garbage(
    store: &dyn CommitStore,
    media: &dyn MediaStore,
    policy: &RetentionPolicy,
) -> Result<GcReport, GcError> {
    run_mark_and_sweep(store, media, policy, false)
}

pub fn estimate_reclaimable(
    store: &dyn CommitStore,
    media: &dyn MediaStore,
    policy: &RetentionPolicy,
) -> Result<GcReport, GcError> {
    run_mark_and_sweep(store, media, policy, true)
}

fn run_mark_and_sweep(
    store: &dyn CommitStore,
    media: &dyn MediaStore,
    policy: &RetentionPolicy,
    dry_run: bool,
) -> Result<GcReport, GcError> {
    let all_commits = store.list_all_commits()?;
    let all_tags = store.list_all_tags()?;
    let head_id = store.head_id()?;
    let now = OffsetDateTime::now_utc();

    let commit_map: HashMap<CommitId, &Commit> = all_commits.iter().map(|c| (c.id, c)).collect();

    // INFO: Tagged commit IDs lookup
    let tagged_commit_ids: HashSet<CommitId> = all_tags.into_iter().map(|t| t.commit_id).collect();

    // 1. MARK PHASE: Identify Root Commits
    let mut marked_commits: HashSet<CommitId> = HashSet::new();

    // INFO: Active HEAD commit is always a root
    if let Some(h) = head_id {
        marked_commits.insert(h);
    }

    let prune_after_time_dur =
        time::Duration::try_from(policy.prune_after).unwrap_or(time::Duration::days(30));

    for commit in &all_commits {
        // INFO: Keep starred/tagged commits if policy specifies
        if policy.keep_starred_forever && tagged_commit_ids.contains(&commit.id) {
            marked_commits.insert(commit.id);
            continue;
        }

        // INFO: Keep commits within the retention window
        let age = now - commit.timestamp;
        if age < prune_after_time_dur {
            marked_commits.insert(commit.id);
        }
    }

    // 2. MARK PHASE: Ancestor Closure (Traverse parent pointers to keep history unbroken)
    let mut to_visit: Vec<CommitId> = marked_commits.iter().copied().collect();
    let mut visited: HashSet<CommitId> = HashSet::new();

    while let Some(current_id) = to_visit.pop() {
        if !visited.insert(current_id) {
            continue;
        }
        marked_commits.insert(current_id);

        if let Some(commit) = commit_map.get(&current_id)
            && let Some(parent_id) = commit.parent
            && !visited.contains(&parent_id)
        {
            to_visit.push(parent_id);
        }
    }

    // 3. IDENTIFY COMMITS TO PRUNE
    let mut commits_to_prune = Vec::new();
    for commit in &all_commits {
        if !marked_commits.contains(&commit.id) {
            commits_to_prune.push(commit.id);
        }
    }

    // 4. MARK PHASE: Reference-Count Media Hashes Across Retained Commits
    let mut retained_media_hashes: HashSet<MediaHash> = HashSet::new();
    for commit in &all_commits {
        if marked_commits.contains(&commit.id) {
            for hash in &commit.media_refs {
                retained_media_hashes.insert(*hash);
            }

            // INFO: Also inspect raw timeline JSON for any referenced clip hashes
            if let Ok(Some(raw_json)) = store.get_timeline(&commit.id)
                && let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw_json)
            {
                extract_media_hashes_from_json(&val, &mut retained_media_hashes);
            }
        }
    }

    // 5. SCAN MEDIA STORE
    let all_media_hashes = media.list_all_hashes()?;
    let total_media_bytes = media.total_size_bytes();

    let mut media_to_prune = Vec::new();
    let mut bytes_freed: u64 = 0;

    for hash in &all_media_hashes {
        if !retained_media_hashes.contains(hash) {
            media_to_prune.push(*hash);
            bytes_freed += media.size_bytes(hash).unwrap_or(0);
        }
    }

    // 6. SWEEP PHASE: Perform actual deletion if not dry run
    if !dry_run {
        if !commits_to_prune.is_empty() {
            store.remove_commits(&commits_to_prune)?;
        }
        for hash in &media_to_prune {
            let _ = media.delete(hash);
        }
    }

    let remaining_media_bytes = total_media_bytes.saturating_sub(bytes_freed);

    Ok(GcReport {
        commits_scanned: all_commits.len(),
        commits_retained: marked_commits.len(),
        commits_pruned: commits_to_prune.len(),
        media_scanned: all_media_hashes.len(),
        media_retained: all_media_hashes.len().saturating_sub(media_to_prune.len()),
        media_pruned: media_to_prune.len(),
        bytes_freed,
        total_media_bytes,
        remaining_media_bytes,
        dry_run,
    })
}

fn extract_media_hashes_from_json(val: &serde_json::Value, hashes: &mut HashSet<MediaHash>) {
    match val {
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(hash_str)) = map.get("media_hash")
                && let Ok(h) = MediaHash::from_hex(hash_str)
            {
                hashes.insert(h);
            }
            if let Some(serde_json::Value::String(hash_str)) = map.get("media")
                && let Ok(h) = MediaHash::from_hex(hash_str)
            {
                hashes.insert(h);
            }

            for v in map.values() {
                extract_media_hashes_from_json(v, hashes);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                extract_media_hashes_from_json(v, hashes);
            }
        }
        _ => {}
    }
}
