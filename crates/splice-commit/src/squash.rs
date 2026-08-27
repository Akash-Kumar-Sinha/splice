use std::collections::HashSet;
use splice_media::MediaHash;

use crate::commit::Commit;

pub fn squash(commits: &[Commit]) -> Commit {
    if commits.is_empty() {
        return Commit::create(
            None,
            "system",
            "Empty squash",
            MediaHash::compute(b"empty"),

            vec![],
        );
    }

    if commits.len() == 1 {
        let single = &commits[0];
        return Commit::create(
            single.parent,
            &single.author,
            &single.message,
            single.timeline_hash,
            single.media_refs.clone(),
        );
    }

    // CRITICAL: Preserve ancestral link to earliest commit's parent while adopting latest commit's timeline state
    let earliest = &commits[0];
    let latest = &commits[commits.len() - 1];

    let mut seen_media = HashSet::new();
    let mut media_refs = Vec::new();
    for c in commits {
        for m in &c.media_refs {
            if seen_media.insert(*m) {
                media_refs.push(*m);
            }
        }
    }

    let mut unique_messages = Vec::new();
    for c in commits {
        let msg = c.message.trim();
        if !msg.is_empty() && !unique_messages.contains(&msg) {
            unique_messages.push(msg);
        }
    }

    let summary_message = format!(
        "Squashed {} commits:\n{}",
        commits.len(),
        unique_messages
            .iter()
            .map(|m| format!("- {m}"))
            .collect::<Vec<_>>()
            .join("\n")
    );

    Commit::create(
        earliest.parent,
        &latest.author,
        summary_message,
        latest.timeline_hash,
        media_refs,
    )
}
