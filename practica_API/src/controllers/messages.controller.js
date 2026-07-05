const botService = require("../services/bot.service");
const env = require("../config/env");
const { success } = require("../utils/api-response");

async function handleMessage(req, res) {
  const result = await botService.processIncomingMessage(req.body, {
    publicBaseUrl: env.publicBaseUrl
  });

  res.status(200).json(success(result.message, result.data));
}

module.exports = {
  handleMessage
};
