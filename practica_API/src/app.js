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

// --- SISTEMA DE LOGS EN TIEMPO REAL PARA EL FRONTEND ---
let logClients = [];

const broadcastLog = (type, message) => {
  const data = JSON.stringify({ type, message, timestamp: new Date().toLocaleTimeString("es-BO") });
  logClients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (e) {
      // Ignorar errores de envío
    }
  });
};

const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  broadcastLog("log", args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};
console.info = (...args) => {
  originalInfo(...args);
  broadcastLog("info", args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};
console.warn = (...args) => {
  originalWarn(...args);
  broadcastLog("warn", args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};
console.error = (...args) => {
  originalError(...args);
  broadcastLog("error", args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

app.get("/api/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  logClients.push(res);

  req.on("close", () => {
    logClients = logClients.filter(c => c !== res);
  });
});
// --------------------------------------------------------

app.use(songsRoutes);
app.use(messagesRoutes);
app.use(webhookRoutes);
app.use(crmRoutes);
app.use(whatsappRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

