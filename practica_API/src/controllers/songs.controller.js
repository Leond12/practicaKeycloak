const { query, withTransaction } = require("../config/database");
const songsRepository = require("../repositories/songs.repository");
const { success } = require("../utils/api-response");
const { createHttpError } = require("../utils/http-error");

function normalizeTitle(input) {
  return typeof input === "string" ? input.trim() : "";
}

async function listSongs(req, res) {
  const songs = await songsRepository.list({ query });
  res.status(200).json(songs.map(song => ({
    id: song.id,
    titulo: song.titulo,
    escuchada: song.escuchada
  })));
}

async function createSongs(req, res) {
  const data = req.body;

  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw createHttpError(400, "SONGS_EMPTY", "Debes enviar al menos una canción");
    }

    const titles = data.map(item => normalizeTitle(item && item.titulo));
    if (titles.some(title => !title)) {
      throw createHttpError(
        400,
        "SONG_TITLE_INVALID",
        "Todas las canciones deben tener un título válido"
      );
    }

    const songs = await withTransaction(client => songsRepository.createMany(client, titles));
    return res.status(201).json(songs.map(song => ({
      id: song.id,
      titulo: song.titulo,
      escuchada: song.escuchada
    })));
  }

  const title = normalizeTitle(data && data.titulo);
  if (!title) {
    throw createHttpError(400, "SONG_TITLE_REQUIRED", "El título es obligatorio");
  }

  const song = await withTransaction(client => songsRepository.create(client, { title }));
  return res.status(201).json({
    id: song.id,
    titulo: song.titulo,
    escuchada: song.escuchada
  });
}

async function updateSong(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, "SONG_ID_INVALID", "ID inválido");
  }

  const { escuchada } = req.body || {};
  if (typeof escuchada !== "boolean") {
    throw createHttpError(400, "LISTENED_INVALID", "El campo escuchada debe ser booleano");
  }

  const song = await withTransaction(async client => {
    const existingSong = await songsRepository.findByIdForUpdate(client, id);
    if (!existingSong) {
      throw createHttpError(404, "SONG_NOT_FOUND", "Canción no encontrada");
    }

    return songsRepository.updateListened(client, id, escuchada);
  });

  res.status(200).json({
    id: song.id,
    titulo: song.titulo,
    escuchada: song.escuchada
  });
}

async function deleteSong(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, "SONG_ID_INVALID", "ID inválido");
  }

  const deleted = await withTransaction(client => songsRepository.remove(client, id));
  if (!deleted) {
    throw createHttpError(404, "SONG_NOT_FOUND", "Canción no encontrada");
  }

  res.status(204).send();
}

async function health(req, res) {
  res.status(200).json(success("API operativa", { service: "minibot-playlist" }));
}

module.exports = {
  listSongs,
  createSongs,
  updateSong,
  deleteSong,
  health
};
