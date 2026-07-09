const fs = require("fs");
const path = require("path");

const sourceDir = "C:\\Users\\usuario\\.gemini\\antigravity-ide\\brain\\4c555ba0-5ae6-4368-917f-327d9dc82194";
const destDir = path.join(__dirname, "..", "public", "images");

const mappings = [
  { src: "cyberpunk_beats_1783623728040.png", dest: "cyberpunk_beats.png" },
  { src: "lofi_chills_1783623765336.png", dest: "lofi_chills.png" },
  { src: "acoustic_vibes_1783623803032.png", dest: "acoustic_vibes.png" }
];

mappings.forEach(m => {
  const srcPath = path.join(sourceDir, m.src);
  const destPath = path.join(destDir, m.dest);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copiado exitosamente: ${m.src} -> ${m.dest}`);
  } else {
    console.error(`Archivo origen no encontrado: ${srcPath}`);
  }
});
