//! Agent heartbeat persistence.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::CoreError;
use crate::models::AgentHeartbeat;

pub fn insert(conn: &Connection, beat: &AgentHeartbeat) -> Result<(), CoreError> {
    conn.execute(
        "INSERT INTO agent_heartbeats (id, device_id, source, captured_at, status, detail)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![
            beat.id,
            beat.device_id,
            beat.source,
            beat.captured_at,
            beat.status,
            beat.detail,
        ],
    )?;
    Ok(())
}

pub fn latest(conn: &Connection) -> Result<Option<AgentHeartbeat>, CoreError> {
    conn.query_row(
        "SELECT id, device_id, source, captured_at, status, detail
         FROM agent_heartbeats ORDER BY captured_at DESC LIMIT 1",
        [],
        |row| {
            Ok(AgentHeartbeat {
                id: row.get(0)?,
                device_id: row.get(1)?,
                source: row.get(2)?,
                captured_at: row.get(3)?,
                status: row.get(4)?,
                detail: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(CoreError::from)
}
