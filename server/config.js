import { resolve } from "node:path";

export function loadConfig(env = process.env) {
  const provider = env.PASSOFFICE_PROVIDER || "demo";
  if (!["demo", "open-api", "passoffice-web"].includes(provider)) {
    throw new Error("PASSOFFICE_PROVIDER must be demo, open-api, or passoffice-web");
  }
  const isDemo = provider === "demo";
  const allowDemoAuth = env.ALLOW_DEMO_AUTH === "true";
  const encryptionKey = parseEncryptionKey(env.DATA_ENCRYPTION_KEY, { allowGenerated: isDemo && allowDemoAuth });
  const nodeEnv = env.NODE_ENV || "development";
  if (nodeEnv === "production" && allowDemoAuth) throw new Error("ALLOW_DEMO_AUTH must be false in production");

  return {
    nodeEnv,
    appVersion: env.APP_VERSION || "dev",
    host: env.HOST || "127.0.0.1",
    port: parsePort(env.PORT || "4173"),
    databasePath: resolve(env.DATABASE_PATH || "./data/amedia-pass.sqlite"),
    allowDemoAuth,
    encryptionKey,
    provider,
    passOfficeBaseUrl: env.PASSOFFICE_BASE_URL || "https://po.amediastudio.ru/",
    passOfficeOpenApiUrl: env.PASSOFFICE_OPEN_API_URL || "",
    passOfficeApiKey: env.PASSOFFICE_API_KEY || "",
    passOfficeSiteId: parseOptionalPositiveInteger(env.PASSOFFICE_SITE_ID, "PASSOFFICE_SITE_ID"),
    passOfficeAccessGroupId: parseOptionalPositiveInteger(env.PASSOFFICE_ACCESS_GROUP_ID, "PASSOFFICE_ACCESS_GROUP_ID"),
    passOfficeGuestCategoryId: parseOptionalPositiveInteger(env.PASSOFFICE_GUEST_CATEGORY_ID, "PASSOFFICE_GUEST_CATEGORY_ID"),
    sessionTtlMs: parsePositiveInteger(env.SESSION_TTL_SECONDS || "43200", "SESSION_TTL_SECONDS") * 1000,
    secureCookies: env.COOKIE_SECURE ? env.COOKIE_SECURE !== "false" : nodeEnv === "production",
  };
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535");
  return port;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseOptionalPositiveInteger(value, name) {
  if (value === undefined || value === "") return null;
  return parsePositiveInteger(value, name);
}

function parseEncryptionKey(value, { allowGenerated }) {
  if (!value && allowGenerated) return Buffer.alloc(32, 7);
  if (!value) throw new Error("DATA_ENCRYPTION_KEY is required");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}
