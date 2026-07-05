async function findActiveByContactId(executor, contactId) {
  const result = await executor.query(
    `SELECT id, contact_id, current_step, status, pending_song_title, created_at, updated_at
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
     RETURNING id, contact_id, current_step, status, pending_song_title, created_at, updated_at`,
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
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, contact_id, current_step, status, pending_song_title, created_at, updated_at`,
    [
      conversationId,
      changes.currentStep,
      changes.status,
      changes.pendingSongTitle || null
    ]
  );

  return result.rows[0];
}

module.exports = {
  findActiveByContactId,
  create,
  updateFlow
};
