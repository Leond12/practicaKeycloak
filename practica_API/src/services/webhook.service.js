const { withTransaction } = require("../config/database");
const songsRepository = require("../repositories/songs.repository");
const webhookEventsRepository = require("../repositories/webhook-events.repository");
const { createHttpError } = require("../utils/http-error");

function parseSongId(value) {
  const songId = Number(value);
  return Number.isInteger(songId) && songId > 0 ? songId : null;
}

async function processConfirmationWebhook(payload) {
  const eventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
  const eventType = typeof payload.eventType === "string" ? payload.eventType.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.trim() : "";
  const songId = parseSongId(payload.songId);

  if (!eventId) {
    throw createHttpError(400, "EVENT_ID_REQUIRED", "eventId es obligatorio");
  }

  if (!songId) {
    throw createHttpError(400, "SONG_ID_REQUIRED", "songId es obligatorio");
  }

  if (eventType !== "song.listened") {
    throw createHttpError(400, "EVENT_TYPE_INVALID", "eventType no soportado");
  }

  if (status !== "listened") {
    throw createHttpError(400, "STATUS_INVALID", "status inválido");
  }

  return withTransaction(async client => {
    const insertResult = await webhookEventsRepository.insertIfNew(client, {
      eventId,
      eventType,
      songId,
      payload
    });

    if (!insertResult.inserted) {
      return {
        message: "El evento ya había sido procesado",
        data: {
          eventId,
          alreadyProcessed: true
        }
      };
    }

    const song = await songsRepository.findByIdForUpdate(client, songId);

    if (!song) {
      throw createHttpError(404, "SONG_NOT_FOUND", "Canción no encontrada");
    }

    const updatedSong = await songsRepository.markAsListened(client, songId);

    return {
      message: "Evento procesado correctamente",
      data: {
        eventId,
        songId: updatedSong.id,
        status: updatedSong.estado,
        listened: updatedSong.escuchada,
        alreadyProcessed: false
      }
    };
  });
}

module.exports = {
  processConfirmationWebhook
};
