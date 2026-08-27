use crate::commit::Commit;
use crate::error::StoreError;
use crate::id::CommitId;
use crate::tag::Tag;

pub trait CommitStore: Send + Sync {
    fn append(&self, commit: Commit) -> Result<CommitId, StoreError>;
    fn get(&self, id: &CommitId) -> Result<Commit, StoreError>;
    fn chain_from_head(&self) -> Result<Vec<Commit>, StoreError>;
    fn head_id(&self) -> Result<Option<CommitId>, StoreError>;
    fn set_head(&self, id: &CommitId) -> Result<(), StoreError>;
    fn add_tag(&self, tag: Tag) -> Result<(), StoreError>;
    fn remove_tag(&self, commit_id: &CommitId, label: &str) -> Result<bool, StoreError>;
    fn get_tags(&self, commit_id: &CommitId) -> Result<Vec<String>, StoreError>;
    fn list_all_tags(&self) -> Result<Vec<Tag>, StoreError>;
}
