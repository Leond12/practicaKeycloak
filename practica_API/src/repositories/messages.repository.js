async function create(executor, payload) {
  const result = await executor.query(
    `INSERT INTO messages (
       conversation_id,
       direction,
       message_type,
       text,
       image_url,
       flow_step
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, conversation_id, direction, message_type, text, image_url, flow_step, created_at`,
    [
      payload.conversationId,
      payload.direction,
      payload.messageType || "text",
      payload.text || null,
      payload.imageUrl || null,
      payload.flowStep || null
    ]
  );

  return result.rows[0];
}

module.exports = {
  create
};
