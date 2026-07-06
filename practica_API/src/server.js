const app = require("./app");
const env = require("./config/env");
const whatsappService = require("./services/whatsapp.service");

app.listen(env.port, async () => {
  console.log(`API escuchando en ${env.publicBaseUrl}`);

  if (env.whatsappAccessToken) {
    await whatsappService.validateToken();
  }
});
