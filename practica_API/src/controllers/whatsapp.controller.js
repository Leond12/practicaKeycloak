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
  const messages = whatsappService.extractIncomingMessages(req.body);

  for (const message of messages) {
    const botResult = await botService.processIncomingMessage(
      { from: message.from, text: message.text },
      { publicBaseUrl: env.publicBaseUrl }
    );

    await whatsappService.sendBotResponse(message.from, botResult);
  }

  res.status(200).json({ received: true, processed: messages.length });
}

module.exports = {
  verifyWebhook,
  receiveWebhook
};
