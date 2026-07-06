const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(process.cwd(), ".env")
});

const port = Number(process.env.PORT || 3000);
const shouldEnableTunnel = (process.env.ENABLE_TUNNEL || "true").toLowerCase() !== "false";
const nodeArgs = process.argv.slice(2);

if (nodeArgs.length === 0) {
  console.error("[Tunnel] Debes indicar el comando de Node que se ejecutara.");
  process.exit(1);
}

let tunnelUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
let tunnelProcess = null;
let childProcess = null;
let isShuttingDown = false;

function canStartTunnel() {
  if (!shouldEnableTunnel) {
    console.info("[Tunnel] Tunel deshabilitado por ENABLE_TUNNEL=false.");
    return false;
  }

  return true;
}

function resolveCloudflaredPath() {
  const configuredPath = process.env.CLOUDFLARED_BIN;

  if (configuredPath) {
    const absoluteConfiguredPath = path.resolve(process.cwd(), configuredPath);

    if (fs.existsSync(absoluteConfiguredPath)) {
      return absoluteConfiguredPath;
    }

    throw new Error(
      `No se encontro cloudflared en la ruta configurada: ${absoluteConfiguredPath}`
    );
  }

  const localBinary = path.resolve(
    process.cwd(),
    "tools",
    process.platform === "win32" ? "cloudflared.exe" : "cloudflared"
  );

  if (fs.existsSync(localBinary)) {
    return localBinary;
  }

  return process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
}

async function startTunnel() {
  if (!canStartTunnel()) {
    return;
  }

  const cloudflaredPath = resolveCloudflaredPath();
  const args = [
    "tunnel",
    "--url",
    `http://127.0.0.1:${port}`,
    "--no-autoupdate"
  ];

  tunnelUrl = await waitForTunnelUrl(cloudflaredPath, args);

  console.info(`[Tunnel] URL publica: ${tunnelUrl}`);
  console.info(`[Tunnel] Webhook WhatsApp: ${tunnelUrl.replace(/\/$/, "")}/webhook/whatsapp`);
}

function waitForTunnelUrl(command, args) {
  return new Promise((resolve, reject) => {
    const urlPattern = /https:\/\/[a-z0-9.-]+trycloudflare\.com/i;
    let settled = false;

    tunnelProcess = spawn(command, args, {
      cwd: process.cwd(),
      windowsHide: true
    });

    const handleOutput = chunk => {
      const message = chunk.toString();
      const match = message.match(urlPattern);

      if (!settled && match) {
        settled = true;
        resolve(match[0]);
      }
    };

    tunnelProcess.stdout.on("data", handleOutput);
    tunnelProcess.stderr.on("data", handleOutput);

    tunnelProcess.on("error", error => {
      if (settled) {
        return;
      }

      settled = true;

      if (error.code === "ENOENT") {
        reject(
          new Error(
            'cloudflared no esta instalado. Ejecuta "npm run tunnel:install" o configura CLOUDFLARED_BIN.'
          )
        );
        return;
      }

      reject(error);
    });

    tunnelProcess.on("exit", code => {
      tunnelProcess = null;

      if (settled) {
        return;
      }

      settled = true;
      reject(
        new Error(
          `cloudflared finalizo antes de abrir el tunel (exit code ${code ?? "unknown"})`
        )
      );
    });
  });
}

async function stopTunnel() {
  if (!tunnelProcess) {
    return;
  }

  try {
    tunnelProcess.kill("SIGTERM");
  } catch (error) {
    console.warn(`[Tunnel] No se pudo cerrar cloudflared limpiamente: ${error.message}`);
  } finally {
    tunnelProcess = null;
  }
}

async function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (childProcess && !childProcess.killed) {
    childProcess.kill("SIGINT");
  }

  await stopTunnel();
  process.exit(exitCode);
}

async function main() {
  try {
    await startTunnel();
  } catch (error) {
    console.error(`[Tunnel] No se pudo iniciar cloudflared: ${error.message}`);
    process.exit(1);
  }

  childProcess = spawn(process.execPath, nodeArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PUBLIC_BASE_URL: tunnelUrl
    },
    stdio: "inherit"
  });

  childProcess.on("exit", async code => {
    await stopTunnel();
    process.exit(code ?? 0);
  });

  childProcess.on("error", async error => {
    console.error(`[Tunnel] No se pudo iniciar la API: ${error.message}`);
    await shutdown(1);
  });
}

process.on("SIGINT", async () => {
  await shutdown(0);
});

process.on("SIGTERM", async () => {
  await shutdown(0);
});

main();
