async function loadCrmRows() {
  const tableBody = document.getElementById("crm-body");

  try {
    const response = await fetch("/api/crm");
    const payload = await response.json();
    const rows = payload.data.rows || [];

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
            <td><span class="tag">${row.song_status || "-"}</span></td>
            <td>${row.song_id ? (row.listened ? "Sí" : "No") : "-"}</td>
            <td>${createdAt}</td>
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
