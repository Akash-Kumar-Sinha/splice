use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::commit::Commit;
use crate::id::CommitId;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommitTreeNode {
    pub commit: Commit,
    pub tags: Vec<String>,
    pub depth: usize,
    pub children: Vec<CommitTreeNode>,
}

impl CommitTreeNode {
    pub fn new(commit: Commit, tags: Vec<String>, depth: usize) -> Self {
        Self {
            commit,
            tags,
            depth,
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

    // INFO: Roots are commits whose parent is None or whose parent is outside the set
    let mut roots = Vec::new();
    for c in commits {
        match c.parent {
            None => roots.push(c.clone()),
            Some(parent_id) if !commit_map.contains_key(&parent_id) => roots.push(c.clone()),
            _ => (),
        }
    }

    fn build_node(
        commit: Commit,
        depth: usize,
        children_map: &HashMap<Option<CommitId>, Vec<Commit>>,
        get_tags: &impl Fn(&CommitId) -> Vec<String>,
    ) -> CommitTreeNode {
        let tags = get_tags(&commit.id);
        let mut node = CommitTreeNode::new(commit.clone(), tags, depth);

        if let Some(child_commits) = children_map.get(&Some(commit.id)) {
            for child in child_commits {
                node.children
                    .push(build_node(child.clone(), depth + 1, children_map, get_tags));
            }
        }

        node
    }

    roots
        .into_iter()
        .map(|root| build_node(root, 0, &children_map, &get_tags))
        .collect()
}
