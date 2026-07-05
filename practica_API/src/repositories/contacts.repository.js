async function findByExternalId(executor, externalId) {
  const result = await executor.query(
    `SELECT id, external_id, name, created_at, updated_at
     FROM contacts
     WHERE external_id = $1`,
    [externalId]
  );

  return result.rows[0] || null;
}

async function create(executor, externalId) {
  const result = await executor.query(
    `INSERT INTO contacts (external_id)
     VALUES ($1)
     RETURNING id, external_id, name, created_at, updated_at`,
    [externalId]
  );

  return result.rows[0];
}

async function updateName(executor, contactId, name) {
  const result = await executor.query(
    `UPDATE contacts
     SET name = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, external_id, name, created_at, updated_at`,
    [contactId, name]
  );

  return result.rows[0];
}

module.exports = {
  findByExternalId,
  create,
  updateName
};
