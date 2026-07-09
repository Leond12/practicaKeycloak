async function loadCrmRows() {
  const tableBody = document.getElementById("crm-body");

  try {
    const response = await fetch("/api/crm");
    const payload = await response.json();
    const rows = payload.data.rows || [];

    // --- Banner Reproduciendo Ahora ---
    const playingRow = rows.find(r => r.song_status === "playing");
    const nowPlayingCard = document.getElementById("now-playing-card");
    if (playingRow) {
      document.getElementById("now-playing-title").textContent = playingRow.title || "Canción sin título";
      document.getElementById("now-playing-user").textContent = `Pedido por: ${playingRow.name || "Anónimo"} (${playingRow.external_id})`;
      document.getElementById("now-playing-stop-btn").onclick = () => stopSong(playingRow.song_id);
      nowPlayingCard.style.display = "flex";
    } else {
      nowPlayingCard.style.display = "none";
    }
    // ----------------------------------

    if (rows.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="muted">Todavía no hay datos registrados.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = rows
      .map(row => {
        const createdAt = row.created_at
          ? new Date(row.created_at).toLocaleString("es-BO")
          : "-";

        let actionHtml = "-";
        if (row.song_id) {
          if (row.song_status === "pending" || row.song_status === "confirmed") {
            actionHtml = `
              <button onclick="playSong(${row.song_id})" style="background: #b45f06; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: bold; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                ▶️ Reproducir
              </button>
            `;
          } else if (row.song_status === "playing") {
            actionHtml = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #b45f06; font-size: 0.85rem; font-weight: bold; display: flex; align-items: center; gap: 4px; animation: pulse-text 1.5s infinite;">
                  🔊 Sonando
                </span>
                <button onclick="stopSong(${row.song_id})" style="background: #ef4444; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: bold; display: flex; align-items: center; gap: 2px;">
                  ⏹️ Terminar
                </button>
              </div>
            `;
          } else if (row.song_status === "listened") {
            actionHtml = `
              <span style="color: #22c55e; font-size: 0.85rem; font-weight: 500; display: flex; align-items: center; gap: 4px;">
                ✅ Escuchada
              </span>
            `;
          }
        }

        let statusBadge = "-";
        if (row.song_status) {
          if (row.song_status === "pending") {
            statusBadge = `<span class="tag" style="background: rgba(148,163,184,0.15); color: #475569; font-weight: bold; border: 1px solid rgba(148,163,184,0.3);">Sin escuchar</span>`;
          } else if (row.song_status === "confirmed") {
            statusBadge = `<span class="tag" style="background: rgba(249,115,22,0.15); color: #c2410c; font-weight: bold; border: 1px solid rgba(249,115,22,0.3);">En cola</span>`;
          } else if (row.song_status === "playing") {
            statusBadge = `<span class="tag" style="background: rgba(14,165,233,0.15); color: #0369a1; font-weight: bold; border: 1px solid rgba(14,165,233,0.3); animation: pulse-text 1.5s infinite;">Reproduciendo</span>`;
          } else if (row.song_status === "listened") {
            statusBadge = `<span class="tag" style="background: rgba(34,197,94,0.15); color: #15803d; font-weight: bold; border: 1px solid rgba(34,197,94,0.3);">Escuchada</span>`;
          }
        }

        return `
          <tr>
            <td>${row.name || "-"}</td>
            <td>${row.external_id || "-"}</td>
            <td>
              <div>ID: ${row.conversation_id || "-"}</div>
              <div class="muted">${row.conversation_status || "-"}</div>
              <div class="muted">${row.current_step || "-"}</div>
            </td>
            <td>
              <div>${row.title || "-"}</div>
              <div class="muted">ID: ${row.song_id || "-"}</div>
            </td>
            <td>${statusBadge}</td>
            <td>${row.song_id ? (row.listened ? "Sí" : "No") : "-"}</td>
            <td>${createdAt}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="muted">No fue posible cargar el CRM.</td>
      </tr>
    `;
  }
}

loadCrmRows();

// --- CONEXIÓN DE LOGS EN TIEMPO REAL (EVENTSOURCE) ---
const logContainer = document.getElementById("terminal-logs");
if (logContainer) {
  const eventSource = new EventSource("/api/logs/stream");

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const logLine = document.createElement("div");
      logLine.style.marginBottom = "4px";

      let msg = data.message;
      let color = "#94a3b8"; // default gray
      let icon = "⚙️";

      if (msg.includes("[WhatsApp]")) {
        color = "#22c55e"; // WhatsApp green
        icon = "💬";
        
        // Simplificar y embellecer logs del webhook con JSON crudo
        if (msg.includes("Payload crudo:")) {
          try {
            const rawJson = msg.split("Payload crudo:")[1];
            const parsed = JSON.parse(rawJson.trim());
            const changeVal = parsed.entry?.[0]?.changes?.[0]?.value;
            const messageObj = changeVal?.messages?.[0];
            
            if (messageObj) {
              const bodyText = messageObj.text?.body || "";
              const sender = messageObj.from || "";
              msg = `[WhatsApp] 📥 Mensaje recibido: "${bodyText}" (De: ${sender})`;
            } else if (changeVal?.statuses?.[0]) {
              const statusObj = changeVal.statuses[0];
              msg = `[WhatsApp] 🔔 Notificación de entrega: "${statusObj.status}" para ${statusObj.recipient_id}`;
            } else {
              msg = `[WhatsApp] 🔔 Webhook de datos procesado`;
            }
          } catch (e) {
            msg = `[WhatsApp] 🔔 Webhook de Meta recibido`;
          }
        }
      } else if (msg.includes("[DB]")) {
        color = "#c084fc"; // purple
        icon = "🗄️";
      } else if (msg.includes("[Veripagos]")) {
        color = "#fbbf24"; // yellow
        icon = "⚡";
      } else if (msg.includes("[CRM]")) {
        color = "#38bdf8"; // cyan
        icon = "🎛️";
      }

      if (data.type === "error") {
        color = "#ef4444";
        icon = "🚨";
      } else if (data.type === "warn") {
        color = "#fbbf24";
        icon = "⚠️";
      }

      logLine.innerHTML = `<span style="color: #64748b; margin-right: 6px;">[${data.timestamp}]</span> <span style="color: ${color}; font-weight: 500;">${icon} ${msg}</span>`;
      logContainer.appendChild(logLine);

      // Desplazar automáticamente hacia abajo
      logContainer.scrollTop = logContainer.scrollHeight;

      // Refresco inmediato de la tabla si detecta eventos relevantes del bot
      const lowerMsg = data.message.toLowerCase();
      if (
        lowerMsg.includes("procesando mensaje") ||
        lowerMsg.includes("webhook post recibido") ||
        lowerMsg.includes("confirmacion") ||
        lowerMsg.includes("actualizado")
      ) {
        loadCrmRows();
      }
    } catch (e) {
      console.error("Error parseando log recibido:", e);
    }
  };

  eventSource.onerror = (err) => {
    const errorLine = document.createElement("div");
    errorLine.style.color = "#ef4444";
    errorLine.textContent = `[${new Date().toLocaleTimeString()}] [Sistema] Error en la conexión en tiempo real con el servidor. Reintentando...`;
    logContainer.appendChild(errorLine);
    logContainer.scrollTop = logContainer.scrollHeight;
  };
}

async function playSong(songId) {
  try {
    const response = await fetch(`/api/crm/play/${songId}`, {
      method: "POST"
    });
    
    if (!response.ok) {
      alert("Error al reproducir la canción");
    }
  } catch (error) {
    console.error("Error llamando a playSong:", error);
    alert("Error de conexión al reproducir");
  }
}

async function stopSong(songId) {
  try {
    const response = await fetch(`/api/crm/stop/${songId}`, {
      method: "POST"
    });
    
    if (!response.ok) {
      alert("Error al detener la canción");
    }
  } catch (error) {
    console.error("Error llamando a stopSong:", error);
    alert("Error de conexión al detener");
  }
}


