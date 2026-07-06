const env = require("../config/env");
const { createHttpError } = require("../utils/http-error");

async function validateToken() {
  if (!env.whatsappAccessToken) {
    console.warn("[WhatsApp] Token no configurado; se omite la validacion.");
    return false;
  }

  try {
    const url = new URL(`https://graph.facebook.com/${env.whatsappGraphVersion}/me`);
    url.searchParams.set("access_token", env.whatsappAccessToken);

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(8000)
    });
    const body = await response.json();

    if (!response.ok) {
      const code = body?.error?.code ?? "NET_ERR";
      const message = body?.error?.message ?? "Error desconocido";
      console.warn(`[WhatsApp] Token invalido (code ${code}): ${message}`);
      console.warn(
        "[WhatsApp] Renovar en Meta Business Manager > Apps > WhatsApp > Tokens"
      );
      return false;
    }

    console.info(
      `[WhatsApp] Token valido; cuenta: "${body?.name || "?"}"`
    );
    return true;
  } catch (error) {
    console.warn(
      `[WhatsApp] Token invalido (code NET_ERR): ${error.message}`
    );
    console.warn(
      "[WhatsApp] Renovar en Meta Business Manager > Apps > WhatsApp > Tokens"
    );
    return false;
  }
}

function getMessagesApiUrl() {
  if (!env.whatsappPhoneNumberId) {
    throw createHttpError(
      500,
      "WHATSAPP_PHONE_NUMBER_ID_MISSING",
      "Falta configurar WHATSAPP_PHONE_NUMBER_ID"
    );
  }

  return `https://graph.facebook.com/${env.whatsappGraphVersion}/${env.whatsappPhoneNumberId}/messages`;
}

function getAuthHeaders() {
  if (!env.whatsappAccessToken) {
    throw createHttpError(
      500,
      "WHATSAPP_ACCESS_TOKEN_MISSING",
      "Falta configurar WHATSAPP_ACCESS_TOKEN"
    );
  }

  return {
    Authorization: `Bearer ${env.whatsappAccessToken}`,
    "Content-Type": "application/json"
  };
}

async function sendPayload(payload) {
  const response = await fetch(getMessagesApiUrl(), {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw createHttpError(
      502,
      "WHATSAPP_SEND_FAILED",
      `WhatsApp Cloud API rechazó la petición: ${body}`
    );
  }

  return response.json();
}

async function sendTextMessage(to, text) {
  if (!text) {
    return null;
  }

  return sendPayload({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: text
    }
  });
}

async function sendImageMessage(to, imageUrl, caption) {
  if (!imageUrl) {
    return null;
  }

  return sendPayload({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: {
      link: imageUrl,
      caption: caption || undefined
    }
  });
}

function extractIncomingMessages(payload) {
  const extracted = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value || {};
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        if (message.type !== "text") {
          continue;
        }

        const from = typeof message.from === "string" ? message.from.trim() : "";
        const text = typeof message.text?.body === "string" ? message.text.body.trim() : "";

        if (!from || !text) {
          continue;
        }

        extracted.push({
          from,
          text,
          rawMessageId: message.id || null
        });
      }
    }
  }

  return extracted;
}

async function sendBotResponse(to, botResult) {
  if (botResult.data?.imageUrl) {
    await sendImageMessage(to, botResult.data.imageUrl, botResult.message);

    if (botResult.data.step === "CONFIRM_SONG") {
      await sendTextMessage(to, 'Escribe "confirmar" o "cancelar".');
      return;
    }
  }

  await sendTextMessage(to, botResult.message);
}

module.exports = {
  validateToken,
  extractIncomingMessages,
  sendBotResponse
};
