const env = require("../config/env");
const { createHttpError } = require("../utils/http-error");

function validateWebhookSecret(req, res, next) {
  const providedSecret = req.header("x-webhook-secret");

  if (!providedSecret || providedSecret !== env.webhookSecret) {
    return next(
      createHttpError(
        401,
        "WEBHOOK_UNAUTHORIZED",
        "Secreto del webhook ausente o incorrecto"
      )
    );
  }

  return next();
}

module.exports = {
  validateWebhookSecret
};
