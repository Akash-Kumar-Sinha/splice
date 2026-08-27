use crate::commit::Commit;
use crate::error::StoreError;
use crate::id::CommitId;

pub trait CommitStore: Send + Sync {
    fn append(&self, commit: Commit) -> Result<CommitId, StoreError>;
    fn get(&self, id: &CommitId) -> Result<Commit, StoreError>;
    fn chain_from_head(&self) -> Result<Vec<Commit>, StoreError>;
    fn head_id(&self) -> Result<Option<CommitId>, StoreError>;
    fn set_head(&self, id: &CommitId) -> Result<(), StoreError>;
}
