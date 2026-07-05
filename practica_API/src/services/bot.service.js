const fs = require("fs");
const path = require("path");
const { withTransaction } = require("../config/database");
const contactsRepository = require("../repositories/contacts.repository");
const conversationsRepository = require("../repositories/conversations.repository");
const messagesRepository = require("../repositories/messages.repository");
const songsRepository = require("../repositories/songs.repository");
const { createHttpError } = require("../utils/http-error");

const STEPS = {
  ASK_NAME: "ASK_NAME",
  ASK_SONG: "ASK_SONG",
  CONFIRM_SONG: "CONFIRM_SONG",
  COMPLETED: "COMPLETED"
};

function normalizeCommand(value) {
  return value.trim().toLowerCase();
}

function getPlaylistImageUrl(publicBaseUrl) {
  const imagePath = path.resolve(process.cwd(), "public", "images", "playlist.jpg");

  if (!fs.existsSync(imagePath)) {
    throw createHttpError(
      500,
      "IMAGE_NOT_FOUND",
      "No se encontró la imagen configurada para el flujo."
    );
  }

  return `${publicBaseUrl.replace(/\/$/, "")}/images/playlist.jpg`;
}

async function saveOutgoingMessage(client, conversationId, payload) {
  await messagesRepository.create(client, {
    conversationId,
    direction: "outgoing",
    messageType: payload.messageType || "text",
    text: payload.text,
    imageUrl: payload.imageUrl,
    flowStep: payload.flowStep
  });
}

async function processIncomingMessage(payload, options) {
  const from = typeof payload.from === "string" ? payload.from.trim() : "";
  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (!from) {
    throw createHttpError(400, "FROM_REQUIRED", "El campo from es obligatorio");
  }

  if (!text) {
    throw createHttpError(400, "TEXT_REQUIRED", "El campo text es obligatorio");
  }

  return withTransaction(async client => {
    let contact = await contactsRepository.findByExternalId(client, from);

    if (!contact) {
      contact = await contactsRepository.create(client, from);
    }

    let conversation = await conversationsRepository.findActiveByContactId(client, contact.id);

    if (!conversation) {
      const initialStep = contact.name ? STEPS.ASK_SONG : STEPS.ASK_NAME;
      conversation = await conversationsRepository.create(client, contact.id, initialStep);
      await messagesRepository.create(client, {
        conversationId: conversation.id,
        direction: "incoming",
        text,
        flowStep: conversation.current_step
      });

      if (initialStep === STEPS.ASK_NAME) {
        const message = "Bienvenido. ¿Cuál es tu nombre?";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_NAME
        });

        return {
          message,
          data: {
            step: STEPS.ASK_NAME
          }
        };
      }

      const message = `Hola, ${contact.name}. Escribe la canción que deseas agregar.`;
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.ASK_SONG
      });

      return {
        message,
        data: {
          step: STEPS.ASK_SONG
        }
      };
    }

    await messagesRepository.create(client, {
      conversationId: conversation.id,
      direction: "incoming",
      text,
      flowStep: conversation.current_step
    });

    if (conversation.current_step === STEPS.ASK_NAME) {
      contact = await contactsRepository.updateName(client, contact.id, text);
      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.ASK_SONG,
        status: "active",
        pendingSongTitle: null
      });

      const message = `Hola, ${contact.name}. Escribe la canción que deseas agregar.`;
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.ASK_SONG
      });

      return {
        message,
        data: {
          step: STEPS.ASK_SONG
        }
      };
    }

    if (conversation.current_step === STEPS.ASK_SONG) {
      const imageUrl = getPlaylistImageUrl(options.publicBaseUrl);
      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.CONFIRM_SONG,
        status: "active",
        pendingSongTitle: text
      });

      const message = `¿Deseas agregar "${text}"?`;
      await saveOutgoingMessage(client, conversation.id, {
        text: `${message} Escribe "confirmar" o "cancelar".`,
        imageUrl,
        messageType: "mixed",
        flowStep: STEPS.CONFIRM_SONG
      });

      return {
        message,
        data: {
          step: STEPS.CONFIRM_SONG,
          imageUrl,
          expectedInput: ["confirmar", "cancelar"]
        }
      };
    }

    if (conversation.current_step === STEPS.CONFIRM_SONG) {
      const normalizedText = normalizeCommand(text);

      if (normalizedText === "confirmar") {
        const song = await songsRepository.create(client, {
          title: conversation.pending_song_title,
          contactId: contact.id,
          conversationId: conversation.id
        });

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.COMPLETED,
          status: "completed",
          pendingSongTitle: null
        });

        const message = "Canción registrada. Estado: pendiente de reproducción.";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.COMPLETED
        });

        return {
          message,
          data: {
            step: STEPS.COMPLETED,
            song
          }
        };
      }

      if (normalizedText === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.ASK_SONG,
          status: "active",
          pendingSongTitle: null
        });

        const message = "Canción cancelada. Escribe otra canción para continuar.";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_SONG
        });

        return {
          message,
          data: {
            step: STEPS.ASK_SONG
          }
        };
      }

      const message = 'Respuesta no válida. Escribe "confirmar" o "cancelar".';
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.CONFIRM_SONG
      });

      return {
        message,
        data: {
          step: STEPS.CONFIRM_SONG,
          expectedInput: ["confirmar", "cancelar"]
        }
      };
    }

    throw createHttpError(
      500,
      "UNKNOWN_CONVERSATION_STEP",
      "La conversación tiene un paso desconocido"
    );
  });
}

module.exports = {
  processIncomingMessage
};
