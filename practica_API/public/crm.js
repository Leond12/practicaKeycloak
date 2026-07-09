const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "playing", label: "Reproduciéndose" },
  { value: "listened", label: "Escuchada" }
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function buildStatusSelect(row) {
  if (!row.song_id) {
    return '<span class="muted">-</span>';
  }

  const options = STATUS_OPTIONS.map(option => {
    const selected = option.value === row.song_status ? " selected" : "";
    return `<option value="${option.value}"${selected}>${option.label}</option>`;
  }).join("");

  return `
    <select class="status-select" data-song-id="${row.song_id}">
      ${options}
    </select>
    <span class="row-feedback" data-feedback-for="${row.song_id}"></span>
  `;
}

async function changeStatus(selectEl) {
  const songId = selectEl.dataset.songId;
  const feedback = document.querySelector(`[data-feedback-for="${songId}"]`);
  const previousValue = selectEl.dataset.currentValue || "";
  const newStatus = selectEl.value;

  selectEl.disabled = true;
  if (feedback) {
    feedback.textContent = "Guardando...";
    feedback.className = "row-feedback muted";
  }

  try {
    const response = await fetch(`/api/crm/songs/${songId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.message || "No se pudo actualizar");
    }

    selectEl.dataset.currentValue = newStatus;
    if (feedback) {
      feedback.textContent = "Actualizado";
      feedback.className = "row-feedback ok";
    }

    // Refrescar para reflejar el nuevo estado en toda la tabla.
    setTimeout(loadCrmRows, 600);
  } catch (error) {
    selectEl.value = previousValue;
    if (feedback) {
      feedback.textContent = error.message;
      feedback.className = "row-feedback err";
    }
  } finally {
    selectEl.disabled = false;
  }
}

async function loadCrmRows() {
  const tableBody = document.getElementById("crm-body");

  try {
    const response = await fetch("/api/crm");
    const payload = await response.json();
    const rows = payload.data.rows || [];

    if (rows.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="muted">Todavía no hay datos registrados.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = rows
      .map(row => {
        const createdAt = row.created_at
          ? new Date(row.created_at).toLocaleString("es-BO")
          : "-";

        return `
          <tr>
            <td>${escapeHtml(row.name || "-")}</td>
            <td>${escapeHtml(row.external_id || "-")}</td>
            <td>
              <div>ID: ${row.conversation_id || "-"}</div>
              <div class="muted">${escapeHtml(row.conversation_status || "-")}</div>
              <div class="muted">${escapeHtml(row.current_step || "-")}</div>
            </td>
            <td>
              <div>${escapeHtml(row.title || "-")}</div>
              <div class="muted">ID: ${row.song_id || "-"}</div>
            </td>
            <td><span class="tag">${escapeHtml(row.song_status || "-")}</span></td>
            <td>${row.song_id ? (row.listened ? "Sí" : "No") : "-"}</td>
            <td>${buildStatusSelect(row)}</td>
            <td>${createdAt}</td>
          </tr>
        `;
      })
      .join("");

    // Enlazar los selectores tras renderizar.
    tableBody.querySelectorAll(".status-select").forEach(selectEl => {
      selectEl.dataset.currentValue = selectEl.value;
      selectEl.addEventListener("change", () => changeStatus(selectEl));
    });
  } catch (error) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="muted">No fue posible cargar el CRM.</td>
      </tr>
    `;
  }
}

loadCrmRows();
