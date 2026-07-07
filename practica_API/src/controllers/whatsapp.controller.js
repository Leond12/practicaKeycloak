const botService = require("../services/bot.service");
const whatsappService = require("../services/whatsapp.service");
const env = require("../config/env");
const { createHttpError } = require("../utils/http-error");

async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe" || token !== env.whatsappWebhookVerifyToken) {
    throw createHttpError(403, "WHATSAPP_WEBHOOK_FORBIDDEN", "Verificación inválida");
  }

  res.status(200).send(challenge);
}

async function receiveWebhook(req, res) {
  console.info("[WhatsApp] Webhook POST recibido.");
  console.info(`[WhatsApp] Payload crudo: ${JSON.stringify(req.body)}`);
  const messages = whatsappService.extractIncomingMessages(req.body);
  console.info(`[WhatsApp] Mensajes de texto extraidos: ${messages.length}`);

  for (const message of messages) {
    try {
      console.info(`[WhatsApp] Procesando mensaje de ${message.from}: "${message.text}"`);
      const botResult = await botService.processIncomingMessage(
        { from: message.from, text: message.text },
        { publicBaseUrl: env.publicBaseUrl }
      );

      console.info(
        `[WhatsApp] Respuesta del bot para ${message.from}: "${botResult.message}"`
      );
      await whatsappService.sendBotResponse(message.from, botResult, {
        phoneNumberId: message.phoneNumberId
      });
    } catch (error) {
      console.error(
        `[WhatsApp] Error procesando mensaje de ${message.from}: ${error.message}`
      );
      console.error(error);
      throw error;
    }
  }

  res.status(200).json({ received: true, processed: messages.length });
}

module.exports = {
  verifyWebhook,
  receiveWebhook
};
