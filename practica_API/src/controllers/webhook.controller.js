const webhookService = require("../services/webhook.service");
const { success } = require("../utils/api-response");

async function handleConfirmation(req, res) {
  const result = await webhookService.processConfirmationWebhook(req.body);
  res.status(200).json(success(result.message, result.data));
}

async function handleVeripagos(req, res) {
  const result = await webhookService.processVeripagosWebhook(req.body);
  res.status(200).json(success(result.message, result.data));
}

module.exports = {
  handleConfirmation,
  handleVeripagos
};
