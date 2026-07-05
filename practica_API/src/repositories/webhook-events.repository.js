async function insertIfNew(executor, payload) {
  const result = await executor.query(
    `INSERT INTO webhook_events (event_id, event_type, song_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id, event_id, event_type, song_id, payload, processed_at`,
    [
      payload.eventId,
      payload.eventType,
      payload.songId,
      JSON.stringify(payload.payload)
    ]
  );

  return {
    inserted: result.rowCount > 0,
    event: result.rows[0] || null
  };
}

module.exports = {
  insertIfNew
};
