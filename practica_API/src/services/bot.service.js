const { withTransaction } = require("../config/database");
const contactsRepository = require("../repositories/contacts.repository");
const conversationsRepository = require("../repositories/conversations.repository");
const messagesRepository = require("../repositories/messages.repository");
const songsRepository = require("../repositories/songs.repository");
const imagesUtil = require("../utils/images");
const { createHttpError } = require("../utils/http-error");

const STEPS = {
  ASK_NAME: "ASK_NAME",
  MENU: "MENU",
  ADD_ASK_SONG: "ADD_ASK_SONG",
  ADD_CONFIRM: "ADD_CONFIRM",
  STATUS_PICK_SONG: "STATUS_PICK_SONG",
  STATUS_PICK_STATE: "STATUS_PICK_STATE",
  COMPLETED: "COMPLETED"
};

const STATUS_LABELS = {
  pending: "pendiente",
  confirmed: "confirmada",
  playing: "reproduciéndose",
  listened: "escuchada",
  cancelled: "cancelada"
};

// Entradas aceptadas por opción (número o palabra clave) para tolerar texto libre.
const STATE_CHOICES = {
  1: "playing",
  2: "listened",
  3: "pending",
  reproduciendo: "playing",
  escuchada: "listened",
  pendiente: "pending"
};

function normalizeCommand(value) {
  return value.trim().toLowerCase();
}

function menuText(name) {
  const greeting = name ? `Hola, ${name}.` : "Hola.";
  return (
    `${greeting} ¿Qué deseas hacer?\n` +
    "1) Agregar una canción\n" +
    "2) Cambiar el estado de una canción\n" +
    "3) Ver mis canciones\n" +
    "4) Salir"
  );
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function songListText(songs) {
  return songs
    .map((song, index) => `${index + 1}. ${song.titulo} — ${statusLabel(song.estado)}`)
    .join("\n");
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

// Persiste la respuesta saliente y arma el contrato { message, data } que consumen
// tanto POST /messages como el adaptador de WhatsApp.
async function reply(client, conversationId, { message, step, imageUrl, data }) {
  await saveOutgoingMessage(client, conversationId, {
    text: message,
    imageUrl: imageUrl || null,
    messageType: imageUrl ? "mixed" : "text",
    flowStep: step
  });

  return {
    message,
    data: {
      step,
      ...(imageUrl ? { imageUrl } : {}),
      ...(data || {})
    }
  };
}

function moveTo(client, conversationId, changes) {
  return conversationsRepository.updateFlow(client, conversationId, {
    currentStep: changes.step,
    status: changes.status || "active",
    pendingSongTitle: changes.pendingSongTitle || null,
    pendingSongId: changes.pendingSongId || null
  });
}

async function resetToMenu(client, ctx, prefix) {
  const conversation = await moveTo(client, ctx.conversation.id, { step: STEPS.MENU });
  const head = prefix ? `${prefix}\n\n` : "";
  return reply(client, conversation.id, {
    message: `${head}${menuText(ctx.contact.name)}`,
    step: STEPS.MENU
  });
}

// --- Handlers por paso -----------------------------------------------------

async function handleAskName(client, ctx) {
  const contact = await contactsRepository.updateName(client, ctx.contact.id, ctx.text);
  const conversation = await moveTo(client, ctx.conversation.id, { step: STEPS.MENU });

  return reply(client, conversation.id, {
    message: `¡Gracias, ${contact.name}!\n\n${menuText(contact.name)}`,
    step: STEPS.MENU
  });
}

async function handleMenu(client, ctx) {
  const choice = normalizeCommand(ctx.text);

  if (choice === "1" || choice === "agregar") {
    const conversation = await moveTo(client, ctx.conversation.id, { step: STEPS.ADD_ASK_SONG });
    return reply(client, conversation.id, {
      message: 'Escribe el nombre de la canción que deseas agregar (o "menu").',
      step: STEPS.ADD_ASK_SONG
    });
  }

  if (choice === "2" || choice === "cambiar" || choice === "estado") {
    return startStatusFlow(client, ctx);
  }

  if (choice === "3" || choice === "ver" || choice === "mis") {
    return listMySongs(client, ctx);
  }

  if (choice === "4" || choice === "salir") {
    const conversation = await moveTo(client, ctx.conversation.id, {
      step: STEPS.COMPLETED,
      status: "completed"
    });
    return reply(client, conversation.id, {
      message: "¡Hasta luego! Escríbeme cuando quieras volver.",
      step: STEPS.COMPLETED
    });
  }

  return reply(client, ctx.conversation.id, {
    message: `Opción no válida.\n\n${menuText(ctx.contact.name)}`,
    step: STEPS.MENU
  });
}

async function listMySongs(client, ctx) {
  const songs = await songsRepository.listByContact(client, ctx.contact.id);
  const body =
    songs.length === 0
      ? "Aún no tienes canciones registradas."
      : `Tus canciones:\n${songListText(songs)}`;

  return reply(client, ctx.conversation.id, {
    message: `${body}\n\n${menuText(ctx.contact.name)}`,
    step: STEPS.MENU
  });
}

async function handleAddAskSong(client, ctx) {
  const title = ctx.text.trim();

  const playing = await songsRepository.findPlayingByTitleOtherContact(
    client,
    title,
    ctx.contact.id
  );

  if (playing) {
    return reply(client, ctx.conversation.id, {
      message:
        `"${title}" está siendo reproducida por otro usuario en este momento. ` +
        'Escribe otra canción o "menu".',
      step: STEPS.ADD_ASK_SONG
    });
  }

  const conversation = await moveTo(client, ctx.conversation.id, {
    step: STEPS.ADD_CONFIRM,
    pendingSongTitle: title
  });

  return reply(client, conversation.id, {
    message: `¿Deseas agregar "${title}"? Escribe "confirmar" o "cancelar".`,
    step: STEPS.ADD_CONFIRM
  });
}

async function handleAddConfirm(client, ctx) {
  const choice = normalizeCommand(ctx.text);

  if (choice === "confirmar" || choice === "si" || choice === "sí") {
    const usedImages = await songsRepository.listUsedImages(client);
    const imageFile = imagesUtil.pickAvailableImage(usedImages);

    const song = await songsRepository.create(client, {
      title: ctx.conversation.pending_song_title,
      imageFile,
      contactId: ctx.contact.id,
      conversationId: ctx.conversation.id
    });

    const conversation = await moveTo(client, ctx.conversation.id, { step: STEPS.MENU });
    const imageUrl = imagesUtil.buildImageUrl(ctx.options.publicBaseUrl, imageFile);
    const note = imageFile ? "" : "\n(No quedan imágenes únicas disponibles.)";

    return reply(client, conversation.id, {
      message:
        `✅ Canción registrada: "${song.titulo}". Estado: pendiente.${note}\n\n` +
        'Escribe "menu" para más opciones.',
      step: STEPS.MENU,
      imageUrl,
      data: { song }
    });
  }

  if (choice === "cancelar" || choice === "no") {
    const conversation = await moveTo(client, ctx.conversation.id, { step: STEPS.MENU });
    return reply(client, conversation.id, {
      message: `Operación cancelada.\n\n${menuText(ctx.contact.name)}`,
      step: STEPS.MENU
    });
  }

  return reply(client, ctx.conversation.id, {
    message: 'Respuesta no válida. Escribe "confirmar" o "cancelar".',
    step: STEPS.ADD_CONFIRM
  });
}

async function startStatusFlow(client, ctx) {
  const songs = await songsRepository.listByContact(client, ctx.contact.id);

  if (songs.length === 0) {
    return reply(client, ctx.conversation.id, {
      message: `No tienes canciones para modificar.\n\n${menuText(ctx.contact.name)}`,
      step: STEPS.MENU
    });
  }

  const conversation = await moveTo(client, ctx.conversation.id, {
    step: STEPS.STATUS_PICK_SONG
  });

  return reply(client, conversation.id, {
    message:
      `¿Qué canción quieres actualizar? Escribe el número:\n${songListText(songs)}\n\n` +
      '(o escribe "menu")',
    step: STEPS.STATUS_PICK_SONG
  });
}

async function handleStatusPickSong(client, ctx) {
  const songs = await songsRepository.listByContact(client, ctx.contact.id);
  const index = Number.parseInt(ctx.text.trim(), 10) - 1;

  if (!Number.isInteger(index) || index < 0 || index >= songs.length) {
    return reply(client, ctx.conversation.id, {
      message: 'Número no válido. Escribe el número de la canción o "menu".',
      step: STEPS.STATUS_PICK_SONG
    });
  }

  const song = songs[index];
  const conversation = await moveTo(client, ctx.conversation.id, {
    step: STEPS.STATUS_PICK_STATE,
    pendingSongId: song.id
  });

  return reply(client, conversation.id, {
    message:
      `"${song.titulo}" (actual: ${statusLabel(song.estado)}).\n` +
      "¿Nuevo estado?\n1) Reproduciendo\n2) Escuchada\n3) Pendiente",
    step: STEPS.STATUS_PICK_STATE
  });
}

async function handleStatusPickState(client, ctx) {
  const choice = normalizeCommand(ctx.text);
  const newStatus = STATE_CHOICES[choice];

  if (!newStatus) {
    return reply(client, ctx.conversation.id, {
      message: "Opción no válida. Escribe 1) Reproduciendo, 2) Escuchada o 3) Pendiente.",
      step: STEPS.STATUS_PICK_STATE
    });
  }

  const songId = ctx.conversation.pending_song_id;

  if (!songId) {
    return resetToMenu(client, ctx, "No encontré la canción seleccionada.");
  }

  const song = await songsRepository.findByIdForUpdate(client, songId);

  if (!song || String(song.contactId) !== String(ctx.contact.id)) {
    return resetToMenu(client, ctx, "Esa canción ya no está disponible.");
  }

  const updated = await songsRepository.updateStatus(client, songId, newStatus);
  const conversation = await moveTo(client, ctx.conversation.id, { step: STEPS.MENU });

  return reply(client, conversation.id, {
    message:
      `Listo. "${updated.titulo}" ahora está ${statusLabel(updated.estado)}.\n\n` +
      `${menuText(ctx.contact.name)}`,
    step: STEPS.MENU
  });
}

// Enruta un mensaje entrante dentro de una conversación activa.
async function dispatchActive(client, ctx) {
  const { conversation } = ctx;
  const normalized = normalizeCommand(ctx.text);

  // Atajo global: volver al menú desde cualquier paso de captura (salvo pedir nombre).
  if (
    (normalized === "menu" || normalized === "0") &&
    conversation.current_step !== STEPS.ASK_NAME
  ) {
    return resetToMenu(client, ctx);
  }

  switch (conversation.current_step) {
    case STEPS.ASK_NAME:
      return handleAskName(client, ctx);
    case STEPS.MENU:
      return handleMenu(client, ctx);
    case STEPS.ADD_ASK_SONG:
      return handleAddAskSong(client, ctx);
    case STEPS.ADD_CONFIRM:
      return handleAddConfirm(client, ctx);
    case STEPS.STATUS_PICK_SONG:
      return handleStatusPickSong(client, ctx);
    case STEPS.STATUS_PICK_STATE:
      return handleStatusPickState(client, ctx);
    default:
      // Paso desconocido o heredado de una versión anterior: recuperarse sin romper.
      return resetToMenu(client, ctx);
  }
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

    // Sin conversación activa: primera interacción. Solo saluda (no consume el texto).
    if (!conversation) {
      const initialStep = contact.name ? STEPS.MENU : STEPS.ASK_NAME;
      conversation = await conversationsRepository.create(client, contact.id, initialStep);
      await messagesRepository.create(client, {
        conversationId: conversation.id,
        direction: "incoming",
        text,
        flowStep: conversation.current_step
      });

      if (initialStep === STEPS.ASK_NAME) {
        return reply(client, conversation.id, {
          message: "¡Bienvenido! ¿Cuál es tu nombre?",
          step: STEPS.ASK_NAME
        });
      }

      return reply(client, conversation.id, {
        message: menuText(contact.name),
        step: STEPS.MENU
      });
    }

    await messagesRepository.create(client, {
      conversationId: conversation.id,
      direction: "incoming",
      text,
      flowStep: conversation.current_step
    });

    return dispatchActive(client, { contact, conversation, text, options });
  });
}

module.exports = {
  processIncomingMessage
};
