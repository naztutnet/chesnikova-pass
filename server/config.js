import { resolve } from "node:path";

export function loadConfig(env = process.env) {
  const isDemo = (env.PASSOFFICE_PROVIDER || "demo") === "demo";
  const allowDemoAuth = env.ALLOW_DEMO_AUTH === "true";
  const encryptionKey = parseEncryptionKey(env.DATA_ENCRYPTION_KEY, { allowGenerated: isDemo && allowDemoAuth });

  if (!allowDemoAuth && !env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required when demo authentication is disabled");
  }

  return {
    port: parsePort(env.PORT || "4173"),
    databasePath: resolve(env.DATABASE_PATH || "./data/amedia-pass.sqlite"),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || "",
    allowDemoAuth,
    encryptionKey,
    provider: env.PASSOFFICE_PROVIDER || "demo",
    passOfficeOpenApiUrl: env.PASSOFFICE_OPEN_API_URL || "",
    passOfficeApiKey: env.PASSOFFICE_API_KEY || "",
  };
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  return port;
}

function parseEncryptionKey(value, { allowGenerated }) {
  if (!value && allowGenerated) return Buffer.alloc(32, 7);
  if (!value) throw new Error("DATA_ENCRYPTION_KEY is required");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}
