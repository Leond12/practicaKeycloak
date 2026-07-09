const CONVERSATION_COLUMNS =
  "id, contact_id, current_step, status, pending_song_title, pending_song_id, created_at, updated_at";

async function findActiveByContactId(executor, contactId) {
  const result = await executor.query(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversations
     WHERE contact_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [contactId]
  );

  return result.rows[0] || null;
}

async function create(executor, contactId, currentStep) {
  const result = await executor.query(
    `INSERT INTO conversations (contact_id, current_step, status)
     VALUES ($1, $2, 'active')
     RETURNING ${CONVERSATION_COLUMNS}`,
    [contactId, currentStep]
  );

  return result.rows[0];
}

async function updateFlow(executor, conversationId, changes) {
  const result = await executor.query(
    `UPDATE conversations
     SET current_step = $2,
         status = $3,
         pending_song_title = $4,
         pending_song_id = $5,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${CONVERSATION_COLUMNS}`,
    [
      conversationId,
      changes.currentStep,
      changes.status,
      changes.pendingSongTitle || null,
      changes.pendingSongId || null
    ]
  );

  return result.rows[0];
}

module.exports = {
  findActiveByContactId,
  create,
  updateFlow
};
