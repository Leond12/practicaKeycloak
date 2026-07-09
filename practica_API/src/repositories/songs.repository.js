function mapSong(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    titulo: row.title,
    escuchada: row.listened,
    estado: row.status,
    imageFile: row.image_file,
    contactId: row.contact_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SONG_COLUMNS =
  "id, title, listened, status, image_file, contact_id, conversation_id, created_at, updated_at";

async function list(executor) {
  const result = await executor.query(
    `SELECT ${SONG_COLUMNS}
     FROM songs
     ORDER BY id ASC`
  );

  return result.rows.map(mapSong);
}

async function listByContact(executor, contactId) {
  const result = await executor.query(
    `SELECT ${SONG_COLUMNS}
     FROM songs
     WHERE contact_id = $1
     ORDER BY id ASC`,
    [contactId]
  );

  return result.rows.map(mapSong);
}

// Playlist pública: todas las canciones, con el nombre de quién la agregó (atribución).
async function listPublic(executor) {
  const result = await executor.query(
    `SELECT s.id, s.title, s.listened, s.status, s.image_file,
            s.contact_id, s.conversation_id, s.created_at, s.updated_at,
            c.name AS added_by_name, c.external_id AS added_by_external
     FROM songs s
     LEFT JOIN contacts c ON c.id = s.contact_id
     ORDER BY s.id ASC`
  );

  return result.rows.map(row => ({
    ...mapSong(row),
    addedByName: row.added_by_name,
    addedByExternal: row.added_by_external
  }));
}

async function findPlayingByTitleOtherContact(executor, title, contactId) {
  const result = await executor.query(
    `SELECT ${SONG_COLUMNS}
     FROM songs
     WHERE lower(title) = lower($1)
       AND status = 'playing'
       AND contact_id IS DISTINCT FROM $2
     ORDER BY id ASC
     LIMIT 1`,
    [title, contactId]
  );

  return mapSong(result.rows[0]);
}

async function listUsedImages(executor) {
  const result = await executor.query(
    `SELECT image_file FROM songs WHERE image_file IS NOT NULL`
  );

  return result.rows.map(row => row.image_file);
}

async function create(executor, payload) {
  const result = await executor.query(
    `INSERT INTO songs (title, listened, status, image_file, contact_id, conversation_id)
     VALUES ($1, FALSE, 'pending', $2, $3, $4)
     RETURNING ${SONG_COLUMNS}`,
    [
      payload.title,
      payload.imageFile || null,
      payload.contactId || null,
      payload.conversationId || null
    ]
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
    `SELECT ${SONG_COLUMNS}
     FROM songs
     WHERE id = $1`,
    [id]
  );

  return mapSong(result.rows[0]);
}

async function findByIdForUpdate(executor, id) {
  const result = await executor.query(
    `SELECT ${SONG_COLUMNS}
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
     RETURNING ${SONG_COLUMNS}`,
    [id, listened, status]
  );

  return mapSong(result.rows[0]);
}

async function updateStatus(executor, id, status) {
  const listened = status === "listened";
  const result = await executor.query(
    `UPDATE songs
     SET status = $2,
         listened = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${SONG_COLUMNS}`,
    [id, status, listened]
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
     RETURNING ${SONG_COLUMNS}`,
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
  listByContact,
  listPublic,
  findPlayingByTitleOtherContact,
  listUsedImages,
  create,
  createMany,
  findById,
  findByIdForUpdate,
  updateListened,
  updateStatus,
  markAsListened,
  remove
};
