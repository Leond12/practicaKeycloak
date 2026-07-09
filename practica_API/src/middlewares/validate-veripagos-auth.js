const env = require("../config/env");
const { createHttpError } = require("../utils/http-error");

function validateVeripagosAuth(req, res, next) {
  const authHeader = req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return next(
      createHttpError(
        401,
        "VERIPAGOS_UNAUTHORIZED",
        "Encabezado de autorización Basic Auth ausente o inválido"
      )
    );
  }

  // Decodificar credenciales Basic Auth
  try {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const [username, password] = credentials.split(":");

    if (username !== env.veripagosUser || password !== env.veripagosPass) {
      return next(
        createHttpError(
          401,
          "VERIPAGOS_FORBIDDEN",
          "Usuario o contraseña de Veripagos incorrectos"
        )
      );
    }
  } catch (error) {
    return next(
      createHttpError(
        400,
        "VERIPAGOS_BAD_REQUEST",
        "Error decodificando credenciales Basic Auth"
      )
    );
  }

  return next();
}

module.exports = {
  validateVeripagosAuth
};
