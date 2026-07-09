const fs = require("fs");
const path = require("path");
const { withTransaction } = require("../config/database");
const contactsRepository = require("../repositories/contacts.repository");
const conversationsRepository = require("../repositories/conversations.repository");
const messagesRepository = require("../repositories/messages.repository");
const songsRepository = require("../repositories/songs.repository");
const { createHttpError } = require("../utils/http-error");
const env = require("../config/env");

const STEPS = {
  ASK_NAME: "ASK_NAME",
  SHOW_MENU: "SHOW_MENU",
  ASK_SONG: "ASK_SONG",
  CONFIRM_SONG: "CONFIRM_SONG",
  ASK_REMOVE_SONG: "ASK_REMOVE_SONG",
  ASK_UPDATE_SONG_ID: "ASK_UPDATE_SONG_ID",
  ASK_UPDATE_SONG_TITLE: "ASK_UPDATE_SONG_TITLE",
  ASK_PLAY_SONG_ID: "ASK_PLAY_SONG_ID",
  ASK_PRIORITY_SONG_ID: "ASK_PRIORITY_SONG_ID",
  CONFIRM_PRIORITY_PAYMENT: "CONFIRM_PRIORITY_PAYMENT",
  SUSPENDED: "SUSPENDED"
};

function normalizeCommand(value) {
  return value.trim().toLowerCase();
}

// --- SELECCIÓN DINÁMICA DE IMÁGENES SIN REPETIR ---
async function getRandomUnusedImage(client, publicBaseUrl) {
  const imagesDir = path.resolve(process.cwd(), "public", "images");
  if (!fs.existsSync(imagesDir)) {
    return `${publicBaseUrl.replace(/\/$/, "")}/images/playlist.jpg`;
  }

  const files = fs.readdirSync(imagesDir)
    .filter(file => /\.(jpe?g|png)$/i.test(file));

  if (files.length === 0) {
    return `${publicBaseUrl.replace(/\/$/, "")}/images/playlist.jpg`;
  }

  const result = await client.query(
    "SELECT image_url FROM messages WHERE image_url IS NOT NULL"
  );
  
  const usedImages = result.rows.map(row => {
    try {
      const parts = row.image_url.split("/");
      return parts[parts.length - 1];
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  let unused = files.filter(f => f !== "playlist.jpg" && !usedImages.includes(f));

  if (unused.length === 0) {
    unused = files.filter(f => f !== "playlist.jpg");
  }
  if (unused.length === 0) {
    unused = files;
  }

  const selectedFile = unused[Math.floor(Math.random() * unused.length)];
  return `${publicBaseUrl.replace(/\/$/, "")}/images/${selectedFile}`;
}

// --- AUXILIAR PARA GENERAR LA LISTA DE CANCIONES ---
function getSongsListString(songs) {
  const playingSong = songs.find(s => s.estado === "playing");
  const queueSongs = songs.filter(s => s.estado === "pending" || s.estado === "confirmed");
  const historySongs = songs.filter(s => s.estado === "listened");

  let text = "";

  // 1. Mostrar Canción en Reproducción
  if (playingSong) {
    text += `🔊 *Sonando ahora mismo:*\n👉 *"${playingSong.titulo}"* (ID: ${playingSong.id})\n───────────────────\n\n`;
  } else {
    text += `🔊 *Sonando ahora mismo:*\n👉 Ninguna canción está sonando en este momento.\n───────────────────\n\n`;
  }

  // 2. Mostrar Canciones en Cola
  text += "📋 *Canciones en cola (Espera):*\n";
  if (queueSongs.length === 0) {
    text += "_No hay canciones en cola de espera. ¡Sé el primero en agregar una!_\n";
  } else {
    queueSongs.forEach((song, idx) => {
      const statusIcon = song.estado === "confirmed" ? "📻" : "⏳";
      const statusLabel = song.estado === "confirmed" ? "En cola" : "Sin escuchar";
      text += `${idx + 1}. *${song.titulo}* (ID: ${song.id}) - ${statusIcon} [${statusLabel}]\n`;
    });
  }

  // 3. Mostrar Historial de Escuchadas (si las hay)
  if (historySongs.length > 0) {
    text += "\n✅ *Historial (Ya escuchadas):*\n";
    // Mostrar las últimas 3 escuchadas para no saturar la pantalla
    const recentHistory = historySongs.slice(-3);
    recentHistory.forEach((song) => {
      text += `• ~${song.titulo}~ (ID: ${song.id})\n`;
    });
  }

  return text;
}

// --- MENÚ CONVERSACIONAL ---
function getMenuMessage(contactName) {
  return `¡Hola, ${contactName}! 🎵 *Menú de Playlist*
Elige una opción respondiendo con el número:

1. ➕ *Agregar una canción* (Formato: Título - Artista)
2. 📋 *Ver lista de canciones*
3. ❌ *Quitar una canción*
4. ✏️ *Actualizar una canción*
5. 📻 *Encolar canción o pasar a la siguiente*
6. ⚡ *Prioridad Alta* (Cambio inmediato con Pago)
7. 🚪 *Salir (Suspender chat)*
8. 🔄 *Reiniciar perfil (Empezar de cero)*`;
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

    // CONTROL DE INACTIVIDAD: Cerrar conversación después de 5 minutos de inactividad
    const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
    if (conversation && conversation.status === "active" && conversation.current_step !== STEPS.SUSPENDED) {
      const lastUpdate = new Date(conversation.updated_at).getTime();
      const now = Date.now();
      if (now - lastUpdate > INACTIVITY_TIMEOUT_MS) {
        console.info(`[Bot] Conversación ID ${conversation.id} cerrada automáticamente por inactividad.`);
        await client.query(
          "UPDATE conversations SET status = 'completed', updated_at = NOW() WHERE id = $1",
          [conversation.id]
        );
        conversation = null; // Forzar creación de una nueva conversación limpia
      }
    }

    // Si no existe conversación activa, creamos una nueva
    if (!conversation) {
      const initialStep = contact.name ? STEPS.SHOW_MENU : STEPS.ASK_NAME;
      conversation = await conversationsRepository.create(client, contact.id, initialStep);
      
      await messagesRepository.create(client, {
        conversationId: conversation.id,
        direction: "incoming",
        text,
        flowStep: conversation.current_step
      });

      if (initialStep === STEPS.ASK_NAME) {
        const message = "Bienvenido a la Playlist de Ecoartec. ¿Cuál es tu nombre?";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_NAME
        });

        return {
          message,
          data: { step: STEPS.ASK_NAME }
        };
      }

      const message = getMenuMessage(contact.name);
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message,
        data: { step: STEPS.SHOW_MENU }
      };
    }

    // --- MANEJO DE CHAT EN SUSPENSIÓN (MODO ESPERA SILENCIOSO) ---
    if (conversation.current_step === STEPS.SUSPENDED) {
      const cmd = normalizeCommand(text);
      const wakeWords = ["hola", "hello", "iniciar", "menu", "menú", "activar", "buenos dias", "buenas tardes", "buenas noches", "hi"];
      
      if (wakeWords.includes(cmd)) {
        // Reactivar conversación
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });

        const message = `🔄 *Chat reactivado!*\n\n${getMenuMessage(contact.name)}`;
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.SHOW_MENU
        });

        return {
          message,
          data: { step: STEPS.SHOW_MENU }
        };
      }

      // Si está en suspensión y no escribe una palabra clave, nos quedamos completamente callados (silencio absoluto)
      return {
        message: "",
        data: { step: STEPS.SUSPENDED }
      };
    }

    // Si el usuario escribe directamente "salir" en cualquier paso (salvo en registro de nombre), lo suspendemos
    if (normalizeCommand(text) === "salir" && conversation.current_step !== STEPS.ASK_NAME) {
      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.SUSPENDED,
        status: "active",
        pendingSongTitle: null
      });

      const message = "🚪 Has suspendido el chat. El bot no responderá a tus mensajes a partir de ahora.\n\nEscribe *hola* o *menu* en cualquier momento para volver a activarlo.";
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.SUSPENDED
      });

      return {
        message,
        data: { step: STEPS.SUSPENDED }
      };
    }

    // Si el usuario escribe directamente "reiniciar", lo borramos de inmediato
    if (normalizeCommand(text) === "reiniciar" && conversation.current_step !== STEPS.ASK_NAME) {
      contact = await contactsRepository.updateName(client, contact.id, null);
      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: "COMPLETED",
        status: "completed",
        pendingSongTitle: null
      });

      const message = "🔄 Tu perfil ha sido borrado. Escribe cualquier mensaje para volver a registrarte.";
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: "COMPLETED"
      });

      return {
        message,
        data: { step: "COMPLETED" }
      };
    }

    // Guardamos el mensaje entrante normalmente si no es un comando de salida
    await messagesRepository.create(client, {
      conversationId: conversation.id,
      direction: "incoming",
      text,
      flowStep: conversation.current_step
    });

    // --- MÁQUINA DE ESTADOS (STEPS) ---

    // 1. ASK_NAME: Registrar nombre y pasar al menú
    if (conversation.current_step === STEPS.ASK_NAME || conversation.current_step === "COMPLETED") {
      contact = await contactsRepository.updateName(client, contact.id, text);
      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.SHOW_MENU,
        status: "active",
        pendingSongTitle: null
      });

      const message = getMenuMessage(contact.name);
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message,
        data: { step: STEPS.SHOW_MENU }
      };
    }

    // 2. SHOW_MENU: Procesar la opción seleccionada
    if (conversation.current_step === STEPS.SHOW_MENU) {
      const option = text.trim();

      if (option === "1") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.ASK_SONG,
          status: "active",
          pendingSongTitle: null
        });

        const message = "Escribe el título y artista de la canción en formato *Título - Artista* (ejemplo: Bring Me To Life - Evanescence):";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_SONG
        });

        return {
          message,
          data: { step: STEPS.ASK_SONG }
        };
      } 
      
      if (option === "2") {
        const songs = await songsRepository.list(client);
        const listText = `${getSongsListString(songs)}\n\n${getMenuMessage(contact.name)}`;
        
        await saveOutgoingMessage(client, conversation.id, {
          text: listText,
          flowStep: STEPS.SHOW_MENU
        });

        return {
          message: listText,
          data: { step: STEPS.SHOW_MENU }
        };
      } 
      
      if (option === "3") {
        const songs = await songsRepository.list(client);
        const listText = getSongsListString(songs);

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.ASK_REMOVE_SONG,
          status: "active",
          pendingSongTitle: null
        });

        const message = `${listText}\n❌ Escribe el ID numérico de la canción que deseas quitar de la playlist (o escribe *cancelar*):`;
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_REMOVE_SONG
        });

        return {
          message,
          data: { step: STEPS.ASK_REMOVE_SONG }
        };
      } 
      
      if (option === "4") {
        const songs = await songsRepository.list(client);
        const listText = getSongsListString(songs);

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.ASK_UPDATE_SONG_ID,
          status: "active",
          pendingSongTitle: null
        });

        const message = `${listText}\n✏️ Escribe el ID numérico de la canción que deseas actualizar (o escribe *cancelar*):`;
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_UPDATE_SONG_ID
        });

        return {
          message,
          data: { step: STEPS.ASK_UPDATE_SONG_ID }
        };
      }

      if (option === "5") {
        const songs = await songsRepository.list(client);
        const listText = getSongsListString(songs);

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.ASK_PLAY_SONG_ID,
          status: "active",
          pendingSongTitle: null
        });

        const message = `${listText}\n📻 Escribe el ID numérico de la canción que deseas poner en cola.\nO escribe *siguiente* para pasar a la siguiente canción en la cola (o escribe *cancelar*):`;
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_PLAY_SONG_ID
        });

        return {
          message,
          data: { step: STEPS.ASK_PLAY_SONG_ID }
        };
      }

      if (option === "6") {
        const songs = await songsRepository.list(client);
        const listText = getSongsListString(songs);

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.ASK_PRIORITY_SONG_ID,
          status: "active",
          pendingSongTitle: null
        });

        const message = `⚡ *Prioridad con Pago* ⚡\n\n${listText}\nEscribe el ID numérico de la canción que deseas priorizar de inmediato (o escribe *cancelar*):`;
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_PRIORITY_SONG_ID
        });

        return {
          message,
          data: { step: STEPS.ASK_PRIORITY_SONG_ID }
        };
      }

      if (option === "7") {
        // Opción 7: Suspender chat (permanecer en silencio)
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SUSPENDED,
          status: "active",
          pendingSongTitle: null
        });

        const message = "🚪 Has suspendido el chat. El bot no responderá a tus mensajes a partir de ahora.\n\nEscribe *hola* o *menu* en cualquier momento para volver a activarlo.";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.SUSPENDED
        });

        return {
          message,
          data: { step: STEPS.SUSPENDED }
        };
      }

      if (option === "8") {
        // Opción 8: Reiniciar perfil (olvidar al usuario)
        contact = await contactsRepository.updateName(client, contact.id, null);

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: "COMPLETED",
          status: "completed",
          pendingSongTitle: null
        });

        const message = "🔄 Tu perfil ha sido borrado. Escribe cualquier mensaje para volver a registrarte (te pedirá tu nombre de nuevo).";
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: "COMPLETED"
        });

        return {
          message,
          data: { step: "COMPLETED" }
        };
      }

      const message = `⚠️ Opción no válida.\n\n${getMenuMessage(contact.name)}`;
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message,
        data: { step: STEPS.SHOW_MENU }
      };
    }

    // 3. ASK_SONG: Validar formato "Título - Artista", duplicados y pedir confirmación
    if (conversation.current_step === STEPS.ASK_SONG) {
      if (normalizeCommand(text) === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });
        const msg = getMenuMessage(contact.name);
        await saveOutgoingMessage(client, conversation.id, { text: msg, flowStep: STEPS.SHOW_MENU });
        return { message: msg, data: { step: STEPS.SHOW_MENU } };
      }

      const parts = text.split("-");
      if (parts.length < 2 || parts[0].trim().length < 2 || parts[1].trim().length < 2) {
        const errorMsg = "⚠️ Formato incorrecto. Por favor, escribe la canción usando el formato exacto:\n*Título - Artista* (ejemplo: Bring Me To Life - Evanescence)\nO escribe *cancelar* para volver:";
        await saveOutgoingMessage(client, conversation.id, {
          text: errorMsg,
          flowStep: STEPS.ASK_SONG
        });
        return {
          message: errorMsg,
          data: { step: STEPS.ASK_SONG }
        };
      }

      // VALIDACIÓN DE DUPLICADO
      const duplicateCheck = await client.query(
        "SELECT id, status FROM songs WHERE LOWER(title) = LOWER($1) AND status IN ('pending', 'confirmed', 'playing')",
        [text]
      );

      if (duplicateCheck.rows.length > 0) {
        const dupSong = duplicateCheck.rows[0];
        let statusText = "sin escuchar";
        if (dupSong.status === "confirmed") statusText = "en cola de espera";
        if (dupSong.status === "playing") statusText = "en reproducción activa 🔊";
        
        const message = `⚠️ La canción "${text}" ya fue solicitada y está *${statusText}*.\nPor favor, escribe otra canción diferente o escribe *cancelar*:`;
        
        await saveOutgoingMessage(client, conversation.id, {
          text: message,
          flowStep: STEPS.ASK_SONG
        });

        return {
          message,
          data: { step: STEPS.ASK_SONG }
        };
      }

      const imageUrl = await getRandomUnusedImage(client, options.publicBaseUrl);

      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.CONFIRM_SONG,
        status: "active",
        pendingSongTitle: text
      });

      const message = `¿Deseas agregar "${text}" a la playlist?`;
      await saveOutgoingMessage(client, conversation.id, {
        text: `${message} Escribe *confirmar* o *cancelar*.`,
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

    // 4. CONFIRM_SONG: Confirmar registro
    if (conversation.current_step === STEPS.CONFIRM_SONG) {
      const command = normalizeCommand(text);

      if (command === "confirmar") {
        const song = await songsRepository.create(client, {
          title: conversation.pending_song_title,
          contactId: contact.id,
          conversationId: conversation.id
        });

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });

        const successMsg = `¡Canción registrada con éxito! Estado: *Sin escuchar* ⏳.\n\n${getMenuMessage(contact.name)}`;
        await saveOutgoingMessage(client, conversation.id, {
          text: successMsg,
          flowStep: STEPS.SHOW_MENU
        });

        return {
          message: successMsg,
          data: { step: STEPS.SHOW_MENU, song }
        };
      }

      if (command === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });

        const cancelMsg = getMenuMessage(contact.name);
        await saveOutgoingMessage(client, conversation.id, {
          text: cancelMsg,
          flowStep: STEPS.SHOW_MENU
        });

        return {
          message: cancelMsg,
          data: { step: STEPS.SHOW_MENU }
        };
      }

      const invalidMsg = `Respuesta no válida. Escribe *confirmar* o *cancelar*:`;
      await saveOutgoingMessage(client, conversation.id, {
        text: invalidMsg,
        flowStep: STEPS.CONFIRM_SONG
      });

      return {
        message: invalidMsg,
        data: { step: STEPS.CONFIRM_SONG }
      };
    }

    // 5. ASK_REMOVE_SONG: Quitar canción
    if (conversation.current_step === STEPS.ASK_REMOVE_SONG) {
      if (normalizeCommand(text) === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });
        const msg = getMenuMessage(contact.name);
        await saveOutgoingMessage(client, conversation.id, { text: msg, flowStep: STEPS.SHOW_MENU });
        return { message: msg, data: { step: STEPS.SHOW_MENU } };
      }

      const songId = Number(text);
      if (!Number.isInteger(songId)) {
        const errorMsg = "⚠️ ID inválido. Por favor escribe el ID numérico o escribe *cancelar*:";
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_REMOVE_SONG });
        return { message: errorMsg, data: { step: STEPS.ASK_REMOVE_SONG } };
      }

      const songResult = await client.query("SELECT id, title FROM songs WHERE id = $1", [songId]);
      if (songResult.rows.length === 0) {
        const notFoundMsg = `⚠️ No se encontró la canción con el ID ${songId}. Escribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: notFoundMsg, flowStep: STEPS.ASK_REMOVE_SONG });
        return { message: notFoundMsg, data: { step: STEPS.ASK_REMOVE_SONG } };
      }

      const songTitle = songResult.rows[0].title;
      await songsRepository.remove(client, songId);

      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.SHOW_MENU,
        status: "active",
        pendingSongTitle: null
      });

      const successMsg = `❌ La canción "${songTitle}" (ID: ${songId}) fue quitada con éxito.\n\n${getMenuMessage(contact.name)}`;
      await saveOutgoingMessage(client, conversation.id, {
        text: successMsg,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message: successMsg,
        data: { step: STEPS.SHOW_MENU }
      };
    }

    // 6. ASK_UPDATE_SONG_ID: ID a actualizar
    if (conversation.current_step === STEPS.ASK_UPDATE_SONG_ID) {
      if (normalizeCommand(text) === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });
        const msg = getMenuMessage(contact.name);
        await saveOutgoingMessage(client, conversation.id, { text: msg, flowStep: STEPS.SHOW_MENU });
        return { message: msg, data: { step: STEPS.SHOW_MENU } };
      }

      const songId = Number(text);
      if (!Number.isInteger(songId)) {
        const errorMsg = "⚠️ ID inválido. Escribe el ID numérico de la canción o escribe *cancelar*:";
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_UPDATE_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_UPDATE_SONG_ID } };
      }

      const songResult = await client.query("SELECT id, title FROM songs WHERE id = $1", [songId]);
      if (songResult.rows.length === 0) {
        const notFoundMsg = `⚠️ No se encontró la canción con el ID ${songId}. Escribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: notFoundMsg, flowStep: STEPS.ASK_UPDATE_SONG_ID });
        return { message: notFoundMsg, data: { step: STEPS.ASK_UPDATE_SONG_ID } };
      }

      const songTitle = songResult.rows[0].title;
      
      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.ASK_UPDATE_SONG_TITLE,
        status: "active",
        pendingSongTitle: String(songId)
      });

      const message = `Escribe el NUEVO título en formato *Título - Artista* para reemplazar a "${songTitle}":`;
      await saveOutgoingMessage(client, conversation.id, {
        text: message,
        flowStep: STEPS.ASK_UPDATE_SONG_TITLE
      });

      return {
        message,
        data: { step: STEPS.ASK_UPDATE_SONG_TITLE }
      };
    }

    // 7. ASK_UPDATE_SONG_TITLE: Guardar nuevo título
    if (conversation.current_step === STEPS.ASK_UPDATE_SONG_TITLE) {
      const songId = Number(conversation.pending_song_title);

      const parts = text.split("-");
      if (parts.length < 2 || parts[0].trim().length < 2 || parts[1].trim().length < 2) {
        const errorMsg = "⚠️ Formato incorrecto. Debe ser *Título - Artista*. Por favor escribe el título correctamente:";
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_UPDATE_SONG_TITLE });
        return { message: errorMsg, data: { step: STEPS.ASK_UPDATE_SONG_TITLE } };
      }

      await client.query(
        "UPDATE songs SET title = $1, updated_at = NOW() WHERE id = $2",
        [text, songId]
      );

      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.SHOW_MENU,
        status: "active",
        pendingSongTitle: null
      });

      const successMsg = `✏️ Canción actualizada al nuevo título: "${text}".\n\n${getMenuMessage(contact.name)}`;
      await saveOutgoingMessage(client, conversation.id, {
        text: successMsg,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message: successMsg,
        data: { step: STEPS.SHOW_MENU }
      };
    }

    // 8. ASK_PLAY_SONG_ID: Poner en cola o Pasar a la siguiente
    if (conversation.current_step === STEPS.ASK_PLAY_SONG_ID) {
      const command = normalizeCommand(text);

      if (command === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });
        const msg = getMenuMessage(contact.name);
        await saveOutgoingMessage(client, conversation.id, { text: msg, flowStep: STEPS.SHOW_MENU });
        return { message: msg, data: { step: STEPS.SHOW_MENU } };
      }

      // Si el comando es "siguiente", reproducimos la siguiente canción de la cola
      if (command === "siguiente" || command === "sig") {
        // 1. Detener la canción actual si la hay
        await client.query(
          "UPDATE songs SET status = 'listened', listened = TRUE, updated_at = NOW() WHERE status = 'playing'"
        );

        // 2. Buscar la siguiente canción a reproducir (priorizando las marcadas con [⚡ PRIORIDAD])
        const nextSongResult = await client.query(`
          SELECT id, title FROM songs 
          WHERE status IN ('pending', 'confirmed')
          ORDER BY 
            CASE 
              WHEN status = 'confirmed' AND title LIKE '%[⚡ PRIORIDAD]%' THEN 1
              WHEN status = 'confirmed' THEN 2
              ELSE 3
            END ASC,
            id ASC
          LIMIT 1
        `);

        if (nextSongResult.rows.length === 0) {
          conversation = await conversationsRepository.updateFlow(client, conversation.id, {
            currentStep: STEPS.SHOW_MENU,
            status: "active",
            pendingSongTitle: null
          });
          const successMsg = `📭 No hay más canciones en la cola de reproducción.\n\n${getMenuMessage(contact.name)}`;
          await saveOutgoingMessage(client, conversation.id, { text: successMsg, flowStep: STEPS.SHOW_MENU });
          return { message: successMsg, data: { step: STEPS.SHOW_MENU } };
        }

        const nextSong = nextSongResult.rows[0];

        // 3. Poner en reproducción (playing)
        await client.query(
          "UPDATE songs SET status = 'playing', listened = FALSE, updated_at = NOW() WHERE id = $1",
          [nextSong.id]
        );

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });

        const successMsg = `🔊 ¡Se ha cambiado la música! Ahora sonando:\n👉 *"${nextSong.title}"* (ID: ${nextSong.id})\n\n${getMenuMessage(contact.name)}`;
        await saveOutgoingMessage(client, conversation.id, { text: successMsg, flowStep: STEPS.SHOW_MENU });
        return { message: successMsg, data: { step: STEPS.SHOW_MENU } };
      }

      const songId = Number(text);
      if (!Number.isInteger(songId)) {
        const errorMsg = "⚠️ Opción inválida. Escribe el ID numérico, *siguiente* para avanzar o *cancelar*:";
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_PLAY_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_PLAY_SONG_ID } };
      }

      const songResult = await client.query("SELECT id, title, status FROM songs WHERE id = $1", [songId]);
      if (songResult.rows.length === 0) {
        const notFoundMsg = `⚠️ No se encontró la canción con el ID ${songId}. Escribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: notFoundMsg, flowStep: STEPS.ASK_PLAY_SONG_ID });
        return { message: notFoundMsg, data: { step: STEPS.ASK_PLAY_SONG_ID } };
      }

      const song = songResult.rows[0];

      if (song.status === "playing") {
        const errorMsg = `⚠️ Esta canción ("${song.title}") ya se está reproduciendo en este momento. ¡Escúchala! 🔊\n\nEscribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_PLAY_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_PLAY_SONG_ID } };
      }

      if (song.status === "confirmed") {
        const errorMsg = `⚠️ Esta canción ("${song.title}") ya está en cola de reproducción (Estado: *En cola*).\n\nEscribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_PLAY_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_PLAY_SONG_ID } };
      }

      // CONTROL DE REPRODUCCIÓN AUTOMÁTICA: Si no hay ninguna canción sonando, la reproduce de inmediato
      const activePlayingCheck = await client.query("SELECT id FROM songs WHERE status = 'playing'");
      let successMsg = "";
      if (activePlayingCheck.rows.length === 0) {
        await client.query("UPDATE songs SET status = 'playing', listened = FALSE, updated_at = NOW() WHERE id = $1", [songId]);
        successMsg = `🔊 La playlist estaba libre, así que la canción "${song.title}" (ID: ${songId}) ha comenzado a sonar ahora mismo! 🔊\n\n${getMenuMessage(contact.name)}`;
      } else {
        await client.query("UPDATE songs SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [songId]);
        successMsg = `📻 La canción "${song.title}" (ID: ${songId}) ha sido puesta en la cola de reproducción. (Estado: *En cola*).\n\n${getMenuMessage(contact.name)}`;
      }

      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.SHOW_MENU,
        status: "active",
        pendingSongTitle: null
      });

      await saveOutgoingMessage(client, conversation.id, {
        text: successMsg,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message: successMsg,
        data: { step: STEPS.SHOW_MENU }
      };
    }

    // 9. ASK_PRIORITY_SONG_ID: Pago prioritario
    if (conversation.current_step === STEPS.ASK_PRIORITY_SONG_ID) {
      if (normalizeCommand(text) === "cancelar") {
        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });
        const msg = getMenuMessage(contact.name);
        await saveOutgoingMessage(client, conversation.id, { text: msg, flowStep: STEPS.SHOW_MENU });
        return { message: msg, data: { step: STEPS.SHOW_MENU } };
      }

      const songId = Number(text);
      if (!Number.isInteger(songId)) {
        const errorMsg = "⚠️ ID inválido. Por favor escribe el ID numérico o escribe *cancelar*:";
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_PRIORITY_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_PRIORITY_SONG_ID } };
      }

      const songResult = await client.query("SELECT id, title, status FROM songs WHERE id = $1", [songId]);
      if (songResult.rows.length === 0) {
        const notFoundMsg = `⚠️ No se encontró la canción con el ID ${songId}. Escribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: notFoundMsg, flowStep: STEPS.ASK_PRIORITY_SONG_ID });
        return { message: notFoundMsg, data: { step: STEPS.ASK_PRIORITY_SONG_ID } };
      }

      const song = songResult.rows[0];

      // CONTROL DE CONCURRENCIA: No permitir priorizar si ya está en reproducción activa o en cola
      if (song.status === "playing") {
        const errorMsg = `⚠️ Esta canción ("${song.title}") ya se está reproduciendo en este momento. No es necesario priorizarla.\n\nEscribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_PRIORITY_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_PRIORITY_SONG_ID } };
      }

      if (song.status === "confirmed") {
        const errorMsg = `⚠️ Esta canción ("${song.title}") ya está en cola de reproducción. No es necesario volver a priorizarla.\n\nEscribe otro ID o escribe *cancelar*:`;
        await saveOutgoingMessage(client, conversation.id, { text: errorMsg, flowStep: STEPS.ASK_PRIORITY_SONG_ID });
        return { message: errorMsg, data: { step: STEPS.ASK_PRIORITY_SONG_ID } };
      }

      let qrBase64 = null;
      let movimientoId = null;

      try {
        const authHeaderValue = Buffer.from(`${env.veripagosUser}:${env.veripagosPass}`).toString("base64");
        
        console.info(`[Veripagos] Solicitando generación de QR para canción ID: ${songId}`);
        const apiResponse = await fetch("https://veripagos.com/api/bcp/generar-qr", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${authHeaderValue}`
          },
          body: JSON.stringify({
            secret_key: env.veripagosSecretKey,
            monto: 1.00,
            data: [songId],
            vigencia: "0/00:05",
            uso_unico: true,
            detalle: `Prioridad Cancion ID ${songId}`
          })
        });

        const resData = await apiResponse.json();
        
        if (resData.Codigo === 0 && resData.Data) {
          qrBase64 = resData.Data.qr;
          movimientoId = resData.Data.movimiento_id;
        } else {
          console.error("[Veripagos] Error de la API de cobro:", resData.Mensaje);
        }
      } catch (err) {
        console.error("[Veripagos] Error de conexión al generar QR:", err);
      }

      if (movimientoId) {
        await client.query(
          "UPDATE songs SET veripagos_movimiento_id = $1, veripagos_estado = 'pendiente' WHERE id = $2",
          [String(movimientoId), songId]
        );
      }

      let imageUrl = `${options.publicBaseUrl.replace(/\/$/, "")}/images/playlist.jpg`;

      if (qrBase64) {
        try {
          const qrsDir = path.resolve(process.cwd(), "public", "images", "qrs");
          if (!fs.existsSync(qrsDir)) {
            fs.mkdirSync(qrsDir, { recursive: true });
          }

          const fileName = `qr_${songId}.png`;
          const filePath = path.join(qrsDir, fileName);
          
          const base64Data = qrBase64.replace(/^data:image\/[a-z]+;base64,/, "");
          fs.writeFileSync(filePath, base64Data, "base64");
          
          imageUrl = `${options.publicBaseUrl.replace(/\/$/, "")}/images/qrs/${fileName}`;
          console.info(`[Veripagos] QR guardado físicamente y expuesto en: ${imageUrl}`);
        } catch (fileErr) {
          console.error("[Veripagos] Error guardando archivo QR en disco:", fileErr);
        }
      }

      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.CONFIRM_PRIORITY_PAYMENT,
        status: "active",
        pendingSongTitle: String(songId)
      });

      const paymentMsg = `💸 *Cobro con Veripagos (1.00 Bs)* 💸\nHas seleccionado priorizar la canción: "${song.title}".\n\nPor favor, escanea el código QR enviado para pagar. \n\nEl sistema confirmará automáticamente en cuanto realices la transferencia de prueba (Vigencia del QR: 5 min). También puedes escribir *cancelar* para salir.`;
      
      await saveOutgoingMessage(client, conversation.id, {
        text: paymentMsg,
        imageUrl,
        messageType: "mixed",
        flowStep: STEPS.CONFIRM_PRIORITY_PAYMENT
      });

      return {
        message: paymentMsg,
        data: {
          step: STEPS.CONFIRM_PRIORITY_PAYMENT,
          imageUrl
        }
      };
    }

    // 10. CONFIRM_PRIORITY_PAYMENT: Verificar pago prioritario
    if (conversation.current_step === STEPS.CONFIRM_PRIORITY_PAYMENT) {
      const command = normalizeCommand(text);

      if (command === "pagado" || command === "confirmar") {
        const songId = Number(conversation.pending_song_title);

        const songResult = await client.query("SELECT id, title FROM songs WHERE id = $1", [songId]);
        const song = songResult.rows[0];

        const priorityTitle = `[⚡ PRIORIDAD] ${song.title}`;

        await client.query(
          "UPDATE songs SET title = $1, status = 'confirmed', updated_at = NOW() WHERE id = $2",
          [priorityTitle, songId]
        );

        conversation = await conversationsRepository.updateFlow(client, conversation.id, {
          currentStep: STEPS.SHOW_MENU,
          status: "active",
          pendingSongTitle: null
        });

        console.info(`[Veripagos Webhook] Pago confirmado para canción ID: ${songId}. Priorización exitosa.`);

        const successMsg = `✅ ¡Pago validado exitosamente por la pasarela Veripagos! La canción ha sido priorizada en cola y renombrada a "${priorityTitle}".\n\n${getMenuMessage(contact.name)}`;
        await saveOutgoingMessage(client, conversation.id, {
          text: successMsg,
          flowStep: STEPS.SHOW_MENU
        });

        return {
          message: successMsg,
          data: { step: STEPS.SHOW_MENU }
        };
      }

      conversation = await conversationsRepository.updateFlow(client, conversation.id, {
        currentStep: STEPS.SHOW_MENU,
        status: "active",
        pendingSongTitle: null
      });

      const cancelMsg = `Priorización cancelada o no pagada.\n\n${getMenuMessage(contact.name)}`;
      await saveOutgoingMessage(client, conversation.id, {
        text: cancelMsg,
        flowStep: STEPS.SHOW_MENU
      });

      return {
        message: cancelMsg,
        data: { step: STEPS.SHOW_MENU }
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
