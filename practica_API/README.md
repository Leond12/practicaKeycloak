# MiniBot Playlist API

API en Node.js y Express que conserva el contrato público de `/canciones` y lo amplía con:

- PostgreSQL para persistencia real.
- Flujo conversacional en `POST /messages`.
- Imagen estática en el paso de confirmación.
- Webhook protegido e idempotente.
- CRM simple en `/crm`.

## Requisitos

- Node.js 18 o superior
- PostgreSQL 14 o superior

## Instalación

```bash
npm install
```

## Variables de entorno

Crear `.env` a partir de `.env.example`.

## Base de datos

```sql
CREATE DATABASE minibot_playlist;
```

Ejecutar:

```bash
psql -d minibot_playlist -f sql/001_create_tables.sql
psql -d minibot_playlist -f sql/002_seed_data.sql
```

## Ejecución

```bash
npm start
```

## Endpoints

- `GET /health`
- `GET /canciones`
- `POST /canciones`
- `PATCH /canciones/:id`
- `DELETE /canciones/:id`
- `POST /messages`
- `POST /webhook/confirmacion`
- `GET /crm`
- `GET /api/crm`

## Flujo conversacional

1. `POST /messages` con `{"from":"59170000000","text":"Hola"}`
2. `POST /messages` con el nombre
3. `POST /messages` con la canción
4. `POST /messages` con `confirmar` o `cancelar`

## Webhook

Enviar `x-webhook-secret` y un body como:

```json
{
  "eventId": "reproduccion-001",
  "eventType": "song.listened",
  "songId": 1,
  "status": "listened"
}
```

## Nota

La aplicación usa transacciones para:

- registrar mensajes y avanzar el flujo;
- crear la canción al confirmar;
- procesar el webhook con idempotencia;
- evitar que la canción cambie sin registrar el evento.
