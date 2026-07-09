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

async function processVeripagosWebhook(payload) {
  console.info(`[Veripagos Webhook] Datos recibidos: ${JSON.stringify(payload)}`);
  
  const movimientoId = payload.movimiento_id;
  const status = payload.estado; // "Completado"
  const dataArray = Array.isArray(payload.data) ? payload.data : [];
  const songId = dataArray[0];

  if (!movimientoId) {
    throw createHttpError(400, "MOVIMIENTO_ID_REQUIRED", "movimiento_id es obligatorio");
  }

  if (!songId) {
    throw createHttpError(400, "SONG_ID_REQUIRED", "ID de canción no encontrado en la data");
  }

  return withTransaction(async client => {
    const songResult = await client.query(
      "SELECT id, title, contact_id, status FROM songs WHERE id = $1",
      [songId]
    );

    if (songResult.rows.length === 0) {
      throw createHttpError(404, "SONG_NOT_FOUND", `Canción ID ${songId} no encontrada`);
    }

    const song = songResult.rows[0];

    // Actualizar el estado de Veripagos en la tabla songs
    await client.query(
      "UPDATE songs SET veripagos_movimiento_id = $1, veripagos_estado = $2, updated_at = NOW() WHERE id = $3",
      [String(movimientoId), status, songId]
    );

    if (status === "Completado") {
      const priorityTitle = song.title.startsWith("[⚡ PRIORIDAD]") ? song.title : `[⚡ PRIORIDAD] ${song.title}`;

      // Si no hay ninguna canción en estado 'playing', la reproducimos de inmediato
      const activePlayingCheck = await client.query("SELECT id FROM songs WHERE status = 'playing'");
      let finalStatus = "confirmed";
      let textState = "ha sido priorizada en la cola de reproducción";

      if (activePlayingCheck.rows.length === 0) {
        finalStatus = "playing";
        textState = "ha comenzado a reproducirse ahora mismo en los altavoces 🔊";
      }

      await client.query(
        "UPDATE songs SET title = $1, status = $2, listened = FALSE, updated_at = NOW() WHERE id = $3",
        [priorityTitle, finalStatus, songId]
      );

      console.info(`[Veripagos Webhook] ¡Pago Completado! Canción "${priorityTitle}" asignada a estado ${finalStatus}.`);

      // Enviar notificación de WhatsApp al usuario si tenía una conversación activa en CONFIRM_PRIORITY_PAYMENT
      const contactResult = await client.query("SELECT external_id FROM contacts WHERE id = $1", [song.contact_id]);
      if (contactResult.rows.length > 0) {
        const externalId = contactResult.rows[0].external_id;

        // Buscar conversación activa del contacto
        const convResult = await client.query(
          "SELECT id, current_step FROM conversations WHERE contact_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1",
          [song.contact_id]
        );

        if (convResult.rows.length > 0) {
          const conversation = convResult.rows[0];

          if (conversation.current_step === "CONFIRM_PRIORITY_PAYMENT") {
            await client.query(
              "UPDATE conversations SET current_step = 'SHOW_MENU', updated_at = NOW() WHERE id = $1",
              [conversation.id]
            );

            const whatsappService = require("./whatsapp.service");
            const notificationText = `✅ *¡Pago verificado por Veripagos!* \nLa transferencia de 1.00 Bs por la canción "${song.title}" se completó con éxito. La canción ${textState}.\n\nEscribe cualquier mensaje para abrir el menú principal.`;
            
            try {
              await whatsappService.sendBotResponse(externalId, { message: notificationText });
            } catch (err) {
              console.error("[Veripagos Webhook] Error enviando notificación de WhatsApp:", err.message);
            }
          }
        }
      }
    } else {
      console.warn(`[Veripagos Webhook] El estado del pago es: ${status} (No procesado como Completado)`);
    }

    return {
      message: `Webhook procesado con estado: ${status}`,
      data: {
        songId,
        movimientoId,
        status
      }
    };
  });
}

module.exports = {
  processConfirmationWebhook,
  processVeripagosWebhook
};
