const { error } = require("../utils/api-response");

function notFoundHandler(req, res) {
  res.status(404).json(error("NOT_FOUND", "Ruta no encontrada"));
}

function errorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json(
      error("INVALID_JSON", "JSON no válido. Verifica la sintaxis del cuerpo enviado.")
    );
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message = err.message || "Ocurrió un error interno";

  if (statusCode >= 500) {
    console.error(err);
  }

  return res.status(statusCode).json(error(code, message));
}

module.exports = {
  notFoundHandler,
  errorHandler
};
