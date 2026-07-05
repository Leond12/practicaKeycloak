function mapSong(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    titulo: row.title,
    escuchada: row.listened,
    estado: row.status,
    contactId: row.contact_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function list(executor) {
  const result = await executor.query(
    `SELECT id, title, listened, status, contact_id, conversation_id, created_at, updated_at
     FROM songs
     ORDER BY id ASC`
  );

  return result.rows.map(mapSong);
}

async function create(executor, payload) {
  const result = await executor.query(
    `INSERT INTO songs (title, listened, status, contact_id, conversation_id)
     VALUES ($1, FALSE, 'pending', $2, $3)
     RETURNING id, title, listened, status, contact_id, conversation_id, created_at, updated_at`,
    [payload.title, payload.contactId || null, payload.conversationId || null]
  );

  return mapSong(result.rows[0]);
}

async function createMany(executor, titles) {
  const created = [];

  for (const title of titles) {
    const song = await create(executor, { title });
    created.push(song);
  }

  return created;
}

async function findById(executor, id) {
  const result = await executor.query(
    `SELECT id, title, listened, status, contact_id, conversation_id, created_at, updated_at
     FROM songs
     WHERE id = $1`,
    [id]
  );

  return mapSong(result.rows[0]);
}

async function findByIdForUpdate(executor, id) {
  const result = await executor.query(
    `SELECT id, title, listened, status, contact_id, conversation_id, created_at, updated_at
     FROM songs
     WHERE id = $1
     FOR UPDATE`,
    [id]
  );

  return mapSong(result.rows[0]);
}

async function updateListened(executor, id, listened) {
  const status = listened ? "listened" : "pending";
  const result = await executor.query(
    `UPDATE songs
     SET listened = $2,
         status = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, title, listened, status, contact_id, conversation_id, created_at, updated_at`,
    [id, listened, status]
  );

  return mapSong(result.rows[0]);
}

async function markAsListened(executor, id) {
  const result = await executor.query(
    `UPDATE songs
     SET listened = TRUE,
         status = 'listened',
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, title, listened, status, contact_id, conversation_id, created_at, updated_at`,
    [id]
  );

  return mapSong(result.rows[0]);
}

async function remove(executor, id) {
  const result = await executor.query(
    `DELETE FROM songs
     WHERE id = $1
     RETURNING id`,
    [id]
  );

  return result.rowCount > 0;
}

module.exports = {
  list,
  create,
  createMany,
  findById,
  findByIdForUpdate,
  updateListened,
  markAsListened,
  remove
};
