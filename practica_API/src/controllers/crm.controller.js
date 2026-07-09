const path = require("path");
const { query, withTransaction } = require("../config/database");
const crmRepository = require("../repositories/crm.repository");
const webhookService = require("../services/webhook.service");
const { success } = require("../utils/api-response");

async function getCrmPage(req, res) {
  res.sendFile(path.resolve(process.cwd(), "public", "crm.html"));
}

async function getCrmData(req, res) {
  const rows = await crmRepository.listRows({ query });
  res.status(200).json(success("Datos del CRM obtenidos", { rows }));
}

async function playSongFromCrm(req, res) {
  const { songId } = req.params;
  console.info(`[CRM] Poniendo en reproducción activa (playing) la canción ID: ${songId}`);
  
  await withTransaction(async (client) => {
    // 1. Detener la canción anterior (cambiar de playing a listened)
    await client.query(
      "UPDATE songs SET status = 'listened', listened = TRUE, updated_at = NOW() WHERE status = 'playing'"
    );
    
    // 2. Establecer la nueva canción como 'playing'
    await client.query(
      "UPDATE songs SET status = 'playing', listened = FALSE, updated_at = NOW() WHERE id = $1",
      [Number(songId)]
    );
  });

  res.status(200).json(success("Canción puesta en reproducción activa"));
}

async function stopSongFromCrm(req, res) {
  const { songId } = req.params;
  console.info(`[CRM] Deteniendo reproducción (listened) de la canción ID: ${songId}`);
  
  await query(
    "UPDATE songs SET status = 'listened', listened = TRUE, updated_at = NOW() WHERE id = $1",
    [Number(songId)]
  );

  res.status(200).json(success("Reproducción de canción terminada"));
}

module.exports = {
  getCrmPage,
  getCrmData,
  playSongFromCrm,
  stopSongFromCrm
};

