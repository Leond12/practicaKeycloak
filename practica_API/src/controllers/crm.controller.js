const path = require("path");
const { query, withTransaction } = require("../config/database");
const crmRepository = require("../repositories/crm.repository");
const songsRepository = require("../repositories/songs.repository");
const { success } = require("../utils/api-response");
const { createHttpError } = require("../utils/http-error");

// Estados que el CRM puede asignar (los mismos que maneja el bot).
const ALLOWED_STATUSES = ["pending", "playing", "listened"];

async function getCrmPage(req, res) {
  res.sendFile(path.resolve(process.cwd(), "public", "crm.html"));
}

async function getCrmData(req, res) {
  const rows = await crmRepository.listRows({ query });
  res.status(200).json(success("Datos del CRM obtenidos", { rows }));
}

async function updateSongStatus(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, "SONG_ID_INVALID", "ID inválido");
  }

  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  if (!ALLOWED_STATUSES.includes(status)) {
    throw createHttpError(
      400,
      "STATUS_INVALID",
      `El estado debe ser uno de: ${ALLOWED_STATUSES.join(", ")}`
    );
  }

  const song = await withTransaction(async client => {
    const existingSong = await songsRepository.findByIdForUpdate(client, id);
    if (!existingSong) {
      throw createHttpError(404, "SONG_NOT_FOUND", "Canción no encontrada");
    }

    return songsRepository.updateStatus(client, id, status);
  });

  res.status(200).json(
    success("Estado actualizado", {
      id: song.id,
      titulo: song.titulo,
      estado: song.estado,
      escuchada: song.escuchada
    })
  );
}

module.exports = {
  getCrmPage,
  getCrmData,
  updateSongStatus
};
