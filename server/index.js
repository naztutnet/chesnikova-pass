import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoginLimiter, createSessionManager } from "./auth/session.js";
import { loadConfig } from "./config.js";
import { createHttpServer } from "./http.js";
import { DemoPassOfficeProvider } from "./integrations/demo-provider.js";
import { PassOfficeOpenApiProvider } from "./integrations/open-api-provider.js";
import { PassOfficeClient } from "./integrations/passoffice-client.js";
import { PassOfficeWebProvider } from "./integrations/passoffice-web-provider.js";
import { YandexSpeechKitClient } from "./integrations/yandex-speechkit.js";
import { RequestService } from "./service/requests.js";
import { createPayloadCipher } from "./storage/crypto.js";
import { RequestStore } from "./storage/requests.js";

const config = loadConfig();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cipher = createPayloadCipher(config.encryptionKey);
const store = new RequestStore({ path: config.databasePath, cipher });
const portalClient = new PassOfficeClient({ baseUrl: config.passOfficeBaseUrl });
const provider = createProvider(config, portalClient);
const requestService = new RequestService({ store, provider });
const sessionManager = createSessionManager({ ttlMs: config.sessionTtlMs, secure: config.secureCookies });
const loginLimiter = createLoginLimiter();
const speechClient = new YandexSpeechKitClient({ apiKey: config.yandexApiKey, folderId: config.yandexFolderId });
const server = createHttpServer({ requestService, portalClient, sessionManager, loginLimiter, speechClient, publicDir: root, providerName: provider.name, appVersion: config.appVersion });

server.listen(config.port, config.host, () => console.log(`CHESNIKOVA PASS listening on ${config.host}:${config.port} (${provider.name})`));

function shutdown() {
  server.close(() => { store.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function createProvider(settings, client) {
  if (settings.provider === "demo") return new DemoPassOfficeProvider();
  if (settings.provider === "open-api") return new PassOfficeOpenApiProvider({ baseUrl: settings.passOfficeOpenApiUrl, apiKey: settings.passOfficeApiKey });
  return new PassOfficeWebProvider({
    client,
    siteId: settings.passOfficeSiteId,
    accessGroupId: settings.passOfficeAccessGroupId,
    guestCategoryId: settings.passOfficeGuestCategoryId,
  });
}
