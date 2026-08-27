import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTelegramAuthenticator } from "./auth/telegram.js";
import { loadConfig } from "./config.js";
import { createHttpServer } from "./http.js";
import { DemoPassOfficeProvider } from "./integrations/demo-provider.js";
import { PassOfficeOpenApiProvider } from "./integrations/open-api-provider.js";
import { RequestService } from "./service/requests.js";
import { createPayloadCipher } from "./storage/crypto.js";
import { RequestStore } from "./storage/requests.js";

const config = loadConfig();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cipher = createPayloadCipher(config.encryptionKey);
const store = new RequestStore({ path: config.databasePath, cipher });
const provider = config.provider === "open-api"
  ? new PassOfficeOpenApiProvider({ baseUrl: config.passOfficeOpenApiUrl, apiKey: config.passOfficeApiKey })
  : new DemoPassOfficeProvider();
const requestService = new RequestService({ store, provider });
const authenticate = createTelegramAuthenticator({ botToken: config.telegramBotToken, allowDemo: config.allowDemoAuth });
const server = createHttpServer({ requestService, authenticate, publicDir: root, providerName: provider.name });

server.listen(config.port, "127.0.0.1", () => console.log(`Amedia Pass listening on http://127.0.0.1:${config.port} (${provider.name})`));

function shutdown() {
  server.close(() => { store.close(); process.exit(0); });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
