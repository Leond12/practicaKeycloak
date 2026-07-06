# MiniBot Playlist API

API en Node.js y Express que conserva el contrato publico de `/canciones` y lo amplia con:

- PostgreSQL para persistencia real.
- Flujo conversacional en `POST /messages`.
- Adaptador opcional para WhatsApp Cloud API en `/webhook/whatsapp`.
- Imagen estatica en el paso de confirmacion.
- Webhook protegido e idempotente.
- CRM simple en `/crm`.

## Requisitos

- Node.js 18 o superior
- PostgreSQL 14 o superior

## Instalacion

```bash
npm install
```

Para usar Cloudflare Tunnel en Windows, instala `cloudflared` dentro del proyecto:

```bash
npm run tunnel:install
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

## Ejecucion

```bash
npm start
```

`npm start` y `npm run dev` levantan la API con un bootstrap que intenta abrir un Quick Tunnel de Cloudflare automaticamente. Si `tools/cloudflared.exe` existe, la app usa la URL publica generada como `PUBLIC_BASE_URL` durante ese arranque.

## Endpoints

- `GET /health`
- `GET /canciones`
- `POST /canciones`
- `PATCH /canciones/:id`
- `DELETE /canciones/:id`
- `POST /messages`
- `POST /webhook/confirmacion`
- `GET /webhook/whatsapp`
- `POST /webhook/whatsapp`
- `GET /crm`
- `GET /api/crm`

## Flujo conversacional

1. `POST /messages` con `{"from":"59170000000","text":"Hola"}`
2. `POST /messages` con el nombre
3. `POST /messages` con la cancion
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

## WhatsApp Cloud API

Configurar en `.env`:

```env
WHATSAPP_ACCESS_TOKEN=token_de_meta
META_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=token_de_verificacion
WHATSAPP_GRAPH_VERSION=v25.0
```

Luego registrar en Meta:

- `GET /webhook/whatsapp` para verificacion.
- `POST /webhook/whatsapp` para recibir mensajes.

El webhook recibe mensajes de texto, reutiliza el flujo interno del bot y responde por la Cloud API de WhatsApp.

Si `WHATSAPP_ACCESS_TOKEN` o `META_ACCESS_TOKEN` esta configurado, la app valida el token al iniciar contra `/{version}/me` y deja un log informativo.

## Exponer con Cloudflare Tunnel

1. Instalar `cloudflared` en el proyecto:

```bash
npm run tunnel:install
```

2. Verificar `.env`:

```env
ENABLE_TUNNEL=true
CLOUDFLARED_BIN=tools/cloudflared.exe
```

3. Arrancar la API:

```bash
npm start
```

Tambien puedes usar:

```bash
npm run dev
```

4. El proceso mostrara una URL HTTPS publica de Cloudflare, por ejemplo:

```text
https://random-subdomain.trycloudflare.com
```

5. Configurar en Meta:

- Callback URL: `https://random-subdomain.trycloudflare.com/webhook/whatsapp`
- Verify Token: el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

Si necesitas arrancar sin tunel, define `ENABLE_TUNNEL=false`.

## Nota

La aplicacion usa transacciones para:

- registrar mensajes y avanzar el flujo;
- crear la cancion al confirmar;
- procesar el webhook con idempotencia;
- evitar que la cancion cambie sin registrar el evento.
