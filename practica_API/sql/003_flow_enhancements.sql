-- Ampliaciones para el flujo conversacional mejorado del MiniBot Playlist.
-- Idempotente: se puede ejecutar varias veces sin romper un esquema existente.

-- 1. Nuevo estado 'playing' (canción reproduciéndose en este momento).
ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_status_check;
ALTER TABLE songs
    ADD CONSTRAINT songs_status_check
    CHECK (status IN ('pending', 'confirmed', 'listened', 'cancelled', 'playing'));

-- 2. Imagen única asignada a cada canción (estilo "QR generado"), sin repetir.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS image_file VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_image_file
    ON songs (image_file)
    WHERE image_file IS NOT NULL;

-- 3. Canción seleccionada temporalmente durante el flujo de cambio de estado.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS pending_song_id BIGINT REFERENCES songs(id);
