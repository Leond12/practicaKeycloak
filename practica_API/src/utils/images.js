const fs = require("fs");
const path = require("path");

const IMAGES_DIR = path.resolve(process.cwd(), "public", "images");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Imágenes reservadas que nunca se asignan como "portada" única de una canción.
const RESERVED_IMAGES = new Set(["playlist.jpg"]);

function listImageFiles() {
  if (!fs.existsSync(IMAGES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(IMAGES_DIR)
    .filter(file => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .filter(file => !RESERVED_IMAGES.has(file));
}

// Devuelve una imagen disponible (no usada aún) o null si se agotaron.
function pickAvailableImage(usedSet) {
  const used = usedSet instanceof Set ? usedSet : new Set(usedSet || []);
  const available = listImageFiles().filter(file => !used.has(file));

  if (available.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * available.length);
  return available[index];
}

function buildImageUrl(publicBaseUrl, file) {
  if (!file) {
    return null;
  }

  return `${publicBaseUrl.replace(/\/$/, "")}/images/${file}`;
}

module.exports = {
  listImageFiles,
  pickAvailableImage,
  buildImageUrl
};
