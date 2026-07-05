async function listRows(executor) {
  const result = await executor.query(
    `SELECT
       c.id AS contact_id,
       c.name,
       c.external_id,
       conv.id AS conversation_id,
       conv.current_step,
       conv.status AS conversation_status,
       s.id AS song_id,
       s.title,
       s.status AS song_status,
       s.listened,
       COALESCE(s.created_at, conv.created_at, c.created_at) AS created_at
     FROM contacts c
     LEFT JOIN LATERAL (
       SELECT id, current_step, status, created_at
       FROM conversations
       WHERE contact_id = c.id
       ORDER BY created_at DESC
       LIMIT 1
     ) conv ON TRUE
     LEFT JOIN songs s ON s.contact_id = c.id
     ORDER BY created_at DESC NULLS LAST, c.id DESC, s.id DESC`
  );

  return result.rows;
}

module.exports = {
  listRows
};
