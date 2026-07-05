const express = require("express");
const webhookController = require("../controllers/webhook.controller");
const { validateWebhookSecret } = require("../middlewares/validate-webhook-secret");
const { asyncHandler } = require("../utils/async-handler");

const router = express.Router();

router.post(
  "/webhook/confirmacion",
  validateWebhookSecret,
  asyncHandler(webhookController.handleConfirmation)
);

module.exports = router;
