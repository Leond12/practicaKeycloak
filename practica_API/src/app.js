const express = require("express");
const path = require("path");
const songsRoutes = require("./routes/songs.routes");
const messagesRoutes = require("./routes/messages.routes");
const webhookRoutes = require("./routes/webhook.routes");
const crmRoutes = require("./routes/crm.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const { errorHandler, notFoundHandler } = require("./middlewares/error-handler");

const app = express();

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

app.use(songsRoutes);
app.use(messagesRoutes);
app.use(webhookRoutes);
app.use(crmRoutes);
app.use(whatsappRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
