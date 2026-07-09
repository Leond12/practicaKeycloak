const express = require("express");
const webhookController = require("../controllers/webhook.controller");
const { validateWebhookSecret } = require("../middlewares/validate-webhook-secret");
const { validateVeripagosAuth } = require("../middlewares/validate-veripagos-auth");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.post(
  "/webhook/confirmacion",
  validateWebhookSecret,
  asyncHandler(webhookController.handleConfirmation)
);

router.post(
  "/webhook/veripagos",
  validateVeripagosAuth,
  asyncHandler(webhookController.handleVeripagos)
);

module.exports = router;

