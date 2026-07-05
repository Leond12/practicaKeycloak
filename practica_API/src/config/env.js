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
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:3000"
};

module.exports = env;
