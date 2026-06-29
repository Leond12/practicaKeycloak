const express = require("express");
const app = express();

app.use(express.json());

let canciones = [
  { id: 1, titulo: "Numb - Linkin Park", escuchada: false },
  { id: 2, titulo: "Bring Me To Life - Evanescence", escuchada: false }
];

let nextId = 3;

// GET /canciones
app.get("/canciones", (req, res) => {
  res.status(200).json(canciones);
});

// POST /canciones
app.post("/canciones", (req, res) => {
  const datos = req.body;

  // Recibir un arreglo
  if (Array.isArray(datos)) {
    if (datos.length === 0) {
      return res.status(400).json({
        error: "Debes enviar al menos una canción"
      });
    }

    const hayCancionInvalida = datos.some(
      cancion =>
        typeof cancion.titulo !== "string" ||
        cancion.titulo.trim() === ""
    );

    if (hayCancionInvalida) {
      return res.status(400).json({
        error: "Todas las canciones deben tener un título válido"
      });
    }

    const nuevasCanciones = datos.map(cancion => ({
      id: nextId++,
      titulo: cancion.titulo.trim(),
      escuchada: false
    }));

    canciones.push(...nuevasCanciones);

    return res.status(201).json(nuevasCanciones);
  }

  // Después procesar una sola canción
  if (
    !datos ||
    typeof datos.titulo !== "string" ||
    datos.titulo.trim() === ""
  ) {
    return res.status(400).json({
      error: "El título es obligatorio"
    });
  }

  const nuevaCancion = {
    id: nextId++,
    titulo: datos.titulo.trim(),
    escuchada: false
  };

  canciones.push(nuevaCancion);

  return res.status(201).json(nuevaCancion);
});

// PATCH /canciones/:id
app.patch("/canciones/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { escuchada } = req.body;

  const cancion = canciones.find(c => c.id === id);

  if (!cancion) {
    return res.status(404).json({ error: "Canción no encontrada" });
  }

  if (typeof escuchada !== "boolean") {
    return res.status(400).json({ error: "El campo escuchada debe ser booleano" });
  }

  cancion.escuchada = escuchada;

  res.status(200).json(cancion);
});

// DELETE /canciones/:id
app.delete("/canciones/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const existe = canciones.some(c => c.id === id);

  if (!existe) {
    return res.status(404).json({ error: "Canción no encontrada" });
  }

  canciones = canciones.filter(c => c.id !== id);

  res.status(204).send();
});

app.use((err, req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    "body" in err
  ) {
    return res.status(400).json({
      error: "JSON no válido",
      mensaje: "Verifica la sintaxis del cuerpo enviado."
    });
  }

  next(err);
});

app.listen(3000, () => {
  console.log("API escuchando en http://localhost:3000");
});