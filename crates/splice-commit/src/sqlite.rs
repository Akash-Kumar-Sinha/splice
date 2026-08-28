use std::collections::HashSet;
use std::path::Path;
use std::str::FromStr;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use splice_media::MediaHash;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::commit::Commit;
use crate::error::StoreError;
use crate::id::CommitId;
use crate::store::CommitStore;

pub struct SqliteCommitStore {
    conn: Mutex<Connection>,
}

impl SqliteCommitStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let path = path.as_ref();
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;
        Self::init_db(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        Self::init_db(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn init_db(conn: &Connection) -> Result<(), StoreError> {
        // INFO: SQLite WAL mode improves concurrent reads while ensuring crash resilience
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        conn.pragma_update(None, "foreign_keys", "ON")?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS commits (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                timestamp TEXT NOT NULL,
                author TEXT NOT NULL,
                message TEXT NOT NULL,
                timeline_hash TEXT NOT NULL,
                media_refs TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS refs (
                name TEXT PRIMARY KEY,
                commit_id TEXT NOT NULL REFERENCES commits(id)
            );
            CREATE TABLE IF NOT EXISTS tags (
                commit_id TEXT NOT NULL REFERENCES commits(id),
                label TEXT NOT NULL,
                PRIMARY KEY (commit_id, label)
            );
            CREATE TABLE IF NOT EXISTS timelines (
                commit_id TEXT PRIMARY KEY REFERENCES commits(id),
                timeline_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_commits_parent ON commits(parent_id);",
        )?;

        Ok(())
    }

    fn get_internal(conn: &Connection, id: &CommitId) -> Result<Commit, StoreError> {
        let id_str = id.to_string();
        let mut stmt = conn.prepare_cached(
            "SELECT id, parent_id, timestamp, author, message, timeline_hash, media_refs
             FROM commits
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id_str])?;
        let row = match rows.next()? {
            Some(row) => row,
            None => return Err(StoreError::CommitNotFound(*id)),
        };

        let row_id_str: String = row.get(0)?;
        let row_parent_str: Option<String> = row.get(1)?;
        let row_ts_str: String = row.get(2)?;
        let author: String = row.get(3)?;
        let message: String = row.get(4)?;
        let timeline_hash_str: String = row.get(5)?;
        let media_refs_str: String = row.get(6)?;

        let commit_id = CommitId::from_str(&row_id_str)
            .map_err(|e| StoreError::Time(format!("invalid commit id: {e}")))?;

        let parent = match row_parent_str {
            Some(s) => Some(
                CommitId::from_str(&s)
                    .map_err(|e| StoreError::Time(format!("invalid parent commit id: {e}")))?,
            ),
            None => None,
        };

        let timestamp = OffsetDateTime::parse(&row_ts_str, &Rfc3339)
            .map_err(|e| StoreError::Time(e.to_string()))?;

        let timeline_hash = MediaHash::from_hex(&timeline_hash_str)
            .map_err(|e| StoreError::InvalidHash(e.to_string()))?;

        let media_refs: Vec<MediaHash> = serde_json::from_str(&media_refs_str)?;

        Ok(Commit {
            id: commit_id,
            parent,
            timestamp,
            author,
            message,
            timeline_hash,
            media_refs,
        })
    }

    pub fn head_id(&self) -> Result<Option<CommitId>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached("SELECT commit_id FROM refs WHERE name = 'HEAD'")?;
        let head_str: Option<String> = stmt.query_row([], |row| row.get(0)).optional()?;
        match head_str {
            Some(s) => {
                let id = CommitId::from_str(&s)
                    .map_err(|e| StoreError::Time(format!("invalid head commit id: {e}")))?;
                Ok(Some(id))
            }
            None => Ok(None),
        }
    }

    pub fn head(&self) -> Result<Option<Commit>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached("SELECT commit_id FROM refs WHERE name = 'HEAD'")?;
        let head_str: Option<String> = stmt.query_row([], |row| row.get(0)).optional()?;
        match head_str {
            Some(s) => {
                let id = CommitId::from_str(&s)
                    .map_err(|e| StoreError::Time(format!("invalid head commit id: {e}")))?;
                let commit = Self::get_internal(&conn, &id)?;
                Ok(Some(commit))
            }
            None => Ok(None),
        }
    }

    pub fn contains(&self, id: &CommitId) -> Result<bool, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached("SELECT 1 FROM commits WHERE id = ?1")?;
        let exists: bool = stmt
            .query_row(params![id.to_string()], |_| Ok(true))
            .optional()?
            .unwrap_or(false);
        Ok(exists)
    }

    pub fn len(&self) -> Result<usize, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached("SELECT COUNT(*) FROM commits")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn is_empty(&self) -> Result<bool, StoreError> {
        Ok(self.len()? == 0)
    }

    pub fn set_head(&self, id: &CommitId) -> Result<(), StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let _ = Self::get_internal(&conn, id)?;
        let mut stmt = conn.prepare_cached(
            "INSERT INTO refs (name, commit_id)
             VALUES ('HEAD', ?1)
             ON CONFLICT(name) DO UPDATE SET commit_id = excluded.commit_id",
        )?;
        stmt.execute(params![id.to_string()])?;
        Ok(())
    }

    pub fn list_all_commits(&self) -> Result<Vec<Commit>, StoreError> {
        <Self as CommitStore>::list_all_commits(self)
    }

    pub fn add_tag(&self, tag: crate::tag::Tag) -> Result<(), StoreError> {
        <Self as CommitStore>::add_tag(self, tag)
    }

    pub fn remove_tag(&self, commit_id: &CommitId, label: &str) -> Result<bool, StoreError> {
        <Self as CommitStore>::remove_tag(self, commit_id, label)
    }

    pub fn get_tags(&self, commit_id: &CommitId) -> Result<Vec<String>, StoreError> {
        <Self as CommitStore>::get_tags(self, commit_id)
    }

    pub fn list_all_tags(&self) -> Result<Vec<crate::tag::Tag>, StoreError> {
        <Self as CommitStore>::list_all_tags(self)
    }

    pub fn save_timeline(
        &self,
        commit_id: &CommitId,
        timeline_json: &str,
    ) -> Result<(), StoreError> {
        <Self as CommitStore>::save_timeline(self, commit_id, timeline_json)
    }

    pub fn get_timeline(&self, commit_id: &CommitId) -> Result<Option<String>, StoreError> {
        <Self as CommitStore>::get_timeline(self, commit_id)
    }
}

impl CommitStore for SqliteCommitStore {
    fn append(&self, commit: Commit) -> Result<CommitId, StoreError> {
        let mut conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let tx = conn.transaction()?;

        let id_str = commit.id.to_string();
        {
            let mut stmt = tx.prepare_cached("SELECT 1 FROM commits WHERE id = ?1")?;
            let exists = stmt
                .query_row(params![&id_str], |_| Ok(true))
                .optional()?
                .unwrap_or(false);
            if exists {
                return Err(StoreError::DuplicateCommit(commit.id));
            }
        }

        if let Some(parent_id) = commit.parent {
            let mut stmt = tx.prepare_cached("SELECT 1 FROM commits WHERE id = ?1")?;
            let parent_str = parent_id.to_string();
            let parent_exists = stmt
                .query_row(params![&parent_str], |_| Ok(true))
                .optional()?
                .unwrap_or(false);
            if !parent_exists {
                return Err(StoreError::ParentNotFound(parent_id));
            }
        }

        let parent_id_str = commit.parent.map(|p| p.to_string());
        let ts_str = commit
            .timestamp
            .format(&Rfc3339)
            .map_err(|e| StoreError::Time(e.to_string()))?;
        let timeline_hash_str = commit.timeline_hash.to_hex();
        let media_refs_json = serde_json::to_string(&commit.media_refs)?;

        {
            let mut insert_commit = tx.prepare_cached(
                "INSERT INTO commits (id, parent_id, timestamp, author, message, timeline_hash, media_refs)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?;
            insert_commit.execute(params![
                id_str,
                parent_id_str,
                ts_str,
                commit.author,
                commit.message,
                timeline_hash_str,
                media_refs_json,
            ])?;
        }

        {
            let mut update_head = tx.prepare_cached(
                "INSERT INTO refs (name, commit_id)
                 VALUES ('HEAD', ?1)
                 ON CONFLICT(name) DO UPDATE SET commit_id = excluded.commit_id",
            )?;
            update_head.execute(params![id_str])?;
        }

        tx.commit()?;
        Ok(commit.id)
    }

    fn get(&self, id: &CommitId) -> Result<Commit, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        Self::get_internal(&conn, id)
    }

    fn chain_from_head(&self) -> Result<Vec<Commit>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached("SELECT commit_id FROM refs WHERE name = 'HEAD'")?;
        let head_str: Option<String> = stmt.query_row([], |row| row.get(0)).optional()?;

        let head_id = match head_str {
            Some(s) => CommitId::from_str(&s)
                .map_err(|e| StoreError::Time(format!("invalid head commit id: {e}")))?,
            None => return Ok(Vec::new()),
        };

        let mut chain = Vec::new();
        let mut visited = HashSet::new();
        let mut current_id = head_id;

        loop {
            // CRITICAL: Detect cycles during parent-chain traversal to guarantee termination
            if !visited.insert(current_id) {
                return Err(StoreError::CycleDetected(current_id));
            }

            let commit = Self::get_internal(&conn, &current_id)?;
            let next_parent = commit.parent;
            chain.push(commit);

            match next_parent {
                Some(parent_id) => current_id = parent_id,
                None => break,
            }
        }

        Ok(chain)
    }

    fn head_id(&self) -> Result<Option<CommitId>, StoreError> {
        self.head_id()
    }

    fn set_head(&self, id: &CommitId) -> Result<(), StoreError> {
        self.set_head(id)
    }

    fn add_tag(&self, tag: crate::tag::Tag) -> Result<(), StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let commit_str = tag.commit_id.to_string();
        let mut check = conn.prepare_cached("SELECT 1 FROM commits WHERE id = ?1")?;
        let exists = check
            .query_row(params![&commit_str], |_| Ok(true))
            .optional()?
            .unwrap_or(false);
        if !exists {
            return Err(StoreError::CommitNotFound(tag.commit_id));
        }

        let mut stmt = conn.prepare_cached(
            "INSERT INTO tags (commit_id, label) VALUES (?1, ?2)
             ON CONFLICT(commit_id, label) DO NOTHING",
        )?;
        stmt.execute(params![&commit_str, &tag.label])?;
        Ok(())
    }

    fn remove_tag(&self, commit_id: &CommitId, label: &str) -> Result<bool, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let commit_str = commit_id.to_string();
        let mut stmt =
            conn.prepare_cached("DELETE FROM tags WHERE commit_id = ?1 AND label = ?2")?;
        let count = stmt.execute(params![&commit_str, label])?;
        Ok(count > 0)
    }

    fn get_tags(&self, commit_id: &CommitId) -> Result<Vec<String>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let commit_str = commit_id.to_string();
        let mut stmt =
            conn.prepare_cached("SELECT label FROM tags WHERE commit_id = ?1 ORDER BY label ASC")?;
        let rows = stmt.query_map(params![&commit_str], |row| row.get(0))?;
        let mut tags = Vec::new();
        for tag in rows {
            tags.push(tag?);
        }
        Ok(tags)
    }

    fn list_all_tags(&self) -> Result<Vec<crate::tag::Tag>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt =
            conn.prepare_cached("SELECT commit_id, label FROM tags ORDER BY label ASC")?;
        let rows = stmt.query_map([], |row| {
            let id_str: String = row.get(0)?;
            let label: String = row.get(1)?;
            Ok((id_str, label))
        })?;

        let mut tags = Vec::new();
        for row in rows {
            let (id_str, label) = row?;
            let id = CommitId::from_str(&id_str)
                .map_err(|e| StoreError::Time(format!("invalid commit id in tag: {e}")))?;
            tags.push(crate::tag::Tag::new(id, label));
        }
        Ok(tags)
    }

    fn list_all_commits(&self) -> Result<Vec<Commit>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached(
            "SELECT id, parent_id, timestamp, author, message, timeline_hash, media_refs
             FROM commits
             ORDER BY timestamp ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            let id_str: String = row.get(0)?;
            let parent_str: Option<String> = row.get(1)?;
            let ts_str: String = row.get(2)?;
            let author: String = row.get(3)?;
            let message: String = row.get(4)?;
            let th_str: String = row.get(5)?;
            let media_refs_json: String = row.get(6)?;

            let id = CommitId::from_str(&id_str).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            let parent = match parent_str {
                Some(p) => Some(CommitId::from_str(&p).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        1,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?),
                None => None,
            };
            let timestamp = OffsetDateTime::parse(&ts_str, &Rfc3339).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            let timeline_hash = MediaHash::from_hex(&th_str).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    5,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;
            let media_refs: Vec<MediaHash> =
                serde_json::from_str(&media_refs_json).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        6,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;

            Ok(Commit::new(
                id,
                parent,
                timestamp,
                author,
                message,
                timeline_hash,
                media_refs,
            ))
        })?;

        let mut commits = Vec::new();
        for c in rows {
            commits.push(c?);
        }
        Ok(commits)
    }

    fn save_timeline(&self, commit_id: &CommitId, timeline_json: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt = conn.prepare_cached(
            "INSERT INTO timelines (commit_id, timeline_json)
             VALUES (?1, ?2)
             ON CONFLICT(commit_id) DO UPDATE SET timeline_json = excluded.timeline_json",
        )?;
        stmt.execute(params![commit_id.to_string(), timeline_json])?;
        Ok(())
    }

    fn get_timeline(&self, commit_id: &CommitId) -> Result<Option<String>, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let mut stmt =
            conn.prepare_cached("SELECT timeline_json FROM timelines WHERE commit_id = ?1")?;
        let json: Option<String> = stmt
            .query_row(params![commit_id.to_string()], |row| row.get(0))
            .optional()?;
        Ok(json)
    }

    fn remove_commit(&self, id: &CommitId) -> Result<bool, StoreError> {
        let count = self.remove_commits(&[*id])?;
        Ok(count > 0)
    }

    fn remove_commits(&self, ids: &[CommitId]) -> Result<usize, StoreError> {
        if ids.is_empty() {
            return Ok(0);
        }

        let mut conn = self.conn.lock().map_err(|_| StoreError::LockPoisoned)?;
        let tx = conn.transaction()?;
        let mut total_deleted = 0;

        for id in ids {
            let id_str = id.to_string();

            // INFO: Delete related tags, timeline states, and refs if pointing to this commit
            {
                let mut del_tags = tx.prepare_cached("DELETE FROM tags WHERE commit_id = ?1")?;
                del_tags.execute(params![&id_str])?;
            }
            {
                let mut del_timelines =
                    tx.prepare_cached("DELETE FROM timelines WHERE commit_id = ?1")?;
                del_timelines.execute(params![&id_str])?;
            }
            {
                let mut del_refs = tx.prepare_cached("DELETE FROM refs WHERE commit_id = ?1")?;
                del_refs.execute(params![&id_str])?;
            }
            {
                let mut del_commit = tx.prepare_cached("DELETE FROM commits WHERE id = ?1")?;
                let affected = del_commit.execute(params![&id_str])?;
                total_deleted += affected;
            }
        }

        tx.commit()?;
        Ok(total_deleted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_in_memory_store_basic() {
        let store = SqliteCommitStore::open_in_memory().expect("open memory store");
        assert!(store.is_empty().expect("is_empty"));

        let th = MediaHash::compute(b"timeline 0");
        let commit0 = Commit::create(None, "Author", "Init", th, vec![]);
        let id0 = commit0.id;
        store.append(commit0.clone()).expect("append 0");

        assert_eq!(store.len().expect("len"), 1);
        assert_eq!(store.head_id().expect("head_id"), Some(id0));

        let retrieved = store.get(&id0).expect("get 0");
        assert_eq!(retrieved.id, id0);
        assert_eq!(retrieved.message, "Init");

        let th1 = MediaHash::compute(b"timeline 1");
        let commit1 = Commit::create(Some(id0), "Author", "Second", th1, vec![]);
        let id1 = commit1.id;
        store.append(commit1).expect("append 1");

        let chain = store.chain_from_head().expect("chain");
        assert_eq!(chain.len(), 2);
        assert_eq!(chain[0].id, id1);
        assert_eq!(chain[1].id, id0);
    }

    #[test]
    fn test_parent_not_found() {
        let store = SqliteCommitStore::open_in_memory().expect("open memory store");
        let non_existent_parent = CommitId::new();
        let commit = Commit::create(
            Some(non_existent_parent),
            "Author",
            "Broken commit",
            MediaHash::compute(b"t"),
            vec![],
        );

        let err = store.append(commit).unwrap_err();
        match err {
            StoreError::ParentNotFound(id) => assert_eq!(id, non_existent_parent),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn test_duplicate_commit() {
        let store = SqliteCommitStore::open_in_memory().expect("open memory store");
        let commit = Commit::create(None, "Author", "Root", MediaHash::compute(b"t"), vec![]);
        store.append(commit.clone()).expect("append 1");
        let err = store.append(commit).unwrap_err();
        match err {
            StoreError::DuplicateCommit(_) => (),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn test_50_saves_and_restart() {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("splice.db");

        let mut expected_ids = Vec::new();
        {
            let store = SqliteCommitStore::open(&db_path).expect("open store");
            let mut parent = None;
            for i in 0..50 {
                let th = MediaHash::compute(format!("timeline {i}").as_bytes());
                let media = vec![MediaHash::compute(format!("media {i}").as_bytes())];
                let commit = Commit::create(parent, "Author", format!("Commit {i}"), th, media);
                let id = commit.id;
                store.append(commit).expect("append commit");
                expected_ids.push(id);
                parent = Some(id);
            }
        }

        // INFO: Restart commit engine by opening a new instance on the persisted database
        let reloaded_store = SqliteCommitStore::open(&db_path).expect("reload store");
        let chain = reloaded_store.chain_from_head().expect("chain from head");
        assert_eq!(chain.len(), 50);

        // Chain is HEAD first, so reversed expected_ids matches
        expected_ids.reverse();
        for (i, commit) in chain.iter().enumerate() {
            assert_eq!(commit.id, expected_ids[i]);
            assert_eq!(commit.message, format!("Commit {}", 49 - i));
        }
    }
}
