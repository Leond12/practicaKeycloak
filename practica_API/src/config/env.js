const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(process.cwd(), ".env")
});

const env = {
  port: Number(process.env.PORT || 3000),
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: Number(process.env.DB_PORT || 5432),
  dbName: process.env.DB_NAME || "minibot_playlist",
  dbUser: process.env.DB_USER || "postgres",
  dbPassword: process.env.DB_PASSWORD || "",
  webhookSecret: process.env.WEBHOOK_SECRET || "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000",
  whatsappAccessToken:
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappWebhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "",
  whatsappGraphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v25.0",
  veripagosUser: process.env.VERIPAGOS_USER || "",
  veripagosPass: process.env.VERIPAGOS_PASS || "",
  veripagosSecretKey: process.env.VERIPAGOS_SECRET_KEY || ""
};

module.exports = env;
