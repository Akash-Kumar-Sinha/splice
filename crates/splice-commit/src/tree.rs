use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::commit::Commit;
use crate::id::CommitId;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommitTreeNode {
    pub commit: Commit,
    pub tags: Vec<String>,
    pub depth: usize,
    pub is_branch_root: bool,
    pub linear_next: Option<Box<CommitTreeNode>>,
    pub branch_children: Vec<CommitTreeNode>,
    pub children: Vec<CommitTreeNode>,
}

impl CommitTreeNode {
    pub fn new(
        commit: Commit,
        tags: Vec<String>,
        depth: usize,
        is_branch_root: bool,
    ) -> Self {
        Self {
            commit,
            tags,
            depth,
            is_branch_root,
            linear_next: None,
            branch_children: Vec::new(),
            children: Vec::new(),
        }
    }
}

pub fn build_commit_tree(
    commits: &[Commit],
    get_tags: impl Fn(&CommitId) -> Vec<String>,
) -> Vec<CommitTreeNode> {
    let mut children_map: HashMap<Option<CommitId>, Vec<Commit>> = HashMap::new();
    let mut commit_map: HashMap<CommitId, Commit> = HashMap::new();

    for c in commits {
        commit_map.insert(c.id, c.clone());
        children_map.entry(c.parent).or_default().push(c.clone());
    }

    // Roots are commits whose parent is None or whose parent is outside the set
    let mut roots = Vec::new();
    for c in commits {
        match c.parent {
            None => roots.push(c.clone()),
            Some(parent_id) if !commit_map.contains_key(&parent_id) => roots.push(c.clone()),
            _ => (),
        }
    }

    // Sort roots chronologically so earliest root is first
    roots.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    fn build_node(
        commit: Commit,
        depth: usize,
        is_branch_root: bool,
        children_map: &HashMap<Option<CommitId>, Vec<Commit>>,
        get_tags: &impl Fn(&CommitId) -> Vec<String>,
    ) -> CommitTreeNode {
        let tags = get_tags(&commit.id);
        let mut node = CommitTreeNode::new(commit.clone(), tags, depth, is_branch_root);

        if let Some(child_commits) = children_map.get(&Some(commit.id)) {
            let mut sorted_children = child_commits.clone();
            sorted_children.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

            let mut linear_child: Option<Commit> = None;
            let mut branch_list: Vec<Commit> = Vec::new();

            for (idx, child) in sorted_children.into_iter().enumerate() {
                let child_tags = get_tags(&child.id);
                let is_explicit_branch = child_tags
                    .iter()
                    .any(|t| t == "Branch" || t.starts_with("Branch:"));

                if idx == 0 && !is_explicit_branch {
                    // First sequential save (not explicitly marked as branch) is the linear progression on this track
                    linear_child = Some(child);
                } else {
                    // Divergent save or explicit branch starts a new branch
                    branch_list.push(child);
                }
            }

            // Build linear next (same depth on the current track)
            if let Some(l_child) = linear_child {
                let l_node = build_node(l_child, depth, false, children_map, get_tags);
                node.children.push(l_node.clone());
                node.linear_next = Some(Box::new(l_node));
            }

            // Build branch children (depth + 1, starts a new branch)
            for b_child in branch_list {
                let b_node = build_node(b_child, depth + 1, true, children_map, get_tags);
                node.children.push(b_node.clone());
                node.branch_children.push(b_node);
            }
        }

        node
    }

    roots
        .into_iter()
        .map(|root| build_node(root, 0, false, &children_map, &get_tags))
        .collect()
}
