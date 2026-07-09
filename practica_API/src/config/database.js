const { Pool } = require("pg");
const env = require("./env");

const pool = new Pool({
  host: env.dbHost,
  port: env.dbPort,
  database: env.dbName,
  user: env.dbUser,
  password: env.dbPassword
});

// --- MIGRACIÓN DE VERIPAGOS Y ESTADO PLAYING ---
pool.query(`
  ALTER TABLE songs ADD COLUMN IF NOT EXISTS veripagos_movimiento_id VARCHAR(100);
  ALTER TABLE songs ADD COLUMN IF NOT EXISTS veripagos_estado VARCHAR(50);
  
  -- Modificar check constraint para incluir estado 'playing'
  ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_status_check;
  ALTER TABLE songs ADD CONSTRAINT songs_status_check CHECK (status IN ('pending', 'confirmed', 'playing', 'listened', 'cancelled'));
`).then(() => {
  console.info("[DB] Columnas de Veripagos y estados del reproductor inicializados con éxito.");
}).catch(err => {
  console.error("[DB] Error migrando base de datos para estados de música:", err);
});
// -----------------------------------------------

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction
};
