import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHttpServer } from "../server/http.js";
import { createLoginLimiter, createSessionManager } from "../server/auth/session.js";
import { DemoPassOfficeProvider } from "../server/integrations/demo-provider.js";
import { RequestService } from "../server/service/requests.js";
import { createPayloadCipher } from "../server/storage/crypto.js";
import { RequestStore } from "../server/storage/requests.js";

async function setup({ speechClient = null } = {}) {
  const store = new RequestStore({ path: ":memory:", cipher: createPayloadCipher(Buffer.alloc(32, 2)) });
  const portalClient = {
    async login({ login, password }) {
      assert.equal(login, "employee");
      assert.equal(password, "secret");
      return { portal: { accessToken: "access-secret", refreshToken: "refresh-secret" }, profile: {} };
    },
    async revoke(portal) { assert.equal(portal.accessToken, "access-secret"); },
  };
  const server = createHttpServer({
    requestService: new RequestService({ store, provider: new DemoPassOfficeProvider() }),
    portalClient,
    sessionManager: createSessionManager({ secure: false }),
    loginLimiter: createLoginLimiter(),
    speechClient,
    publicDir: process.cwd(),
    providerName: "demo",
    appVersion: "test-release",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  return { store, server, origin };
}

test("health endpoint identifies the running release", async (t) => {
  const { store, server, origin } = await setup();
  t.after(() => { server.close(); store.close(); });
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", provider: "demo", version: "test-release" });
});

test("missing static files return 404 without crashing the server", async (t) => {
  const { store, server, origin } = await setup();
  t.after(() => { server.close(); store.close(); });
  const missing = await fetch(`${origin}/favicon.ico`);
  assert.equal(missing.status, 404);
  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
});

test("web login creates only an opaque cookie and supports logout with CSRF", async (t) => {
  const { store, server, origin } = await setup();
  t.after(() => { server.close(); store.close(); });

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ login: "employee", password: "secret" }),
  });
  assert.equal(login.status, 200);
  const body = await login.json();
  const cookie = login.headers.get("set-cookie");
  assert.ok(cookie);
  assert.doesNotMatch(cookie, /employee|secret/);
  assert.equal(body.data.user.login, "employee");
  assert.ok(body.data.csrfToken);

  const session = await fetch(`${origin}/api/session`, { headers: { cookie } });
  assert.equal(session.status, 200);

  const rejected = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie, origin } });
  assert.equal(rejected.status, 403);

  const logout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie, origin, "x-csrf-token": body.data.csrfToken },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});

test("credential posts from another origin are rejected before portal login", async (t) => {
  const { store, server, origin } = await setup();
  t.after(() => { server.close(); store.close(); });
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ login: "employee", password: "secret" }),
  });
  assert.equal(response.status, 403);
});

test("authenticated audio is transcribed without storing it in the request API", async (t) => {
  let received;
  const speechClient = {
    isConfigured: true,
    async transcribe(input) { received = input; return "Завтра D212, Иванов Иван Иванович"; },
  };
  const { store, server, origin } = await setup({ speechClient });
  t.after(() => { server.close(); store.close(); });

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ login: "employee", password: "secret" }),
  });
  const session = await login.json();
  const cookie = login.headers.get("set-cookie");
  const response = await fetch(`${origin}/api/transcriptions`, {
    method: "POST",
    headers: {
      cookie,
      origin,
      "content-type": "audio/webm;codecs=opus",
      "x-csrf-token": session.data.csrfToken,
    },
    body: Buffer.from("browser-audio"),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { text: "Завтра D212, Иванов Иван Иванович", provider: "yandex-speechkit" } });
  assert.equal(received.contentType, "audio/webm");
  assert.deepEqual(received.audio, Buffer.from("browser-audio"));
});

test("audio uploads require a supported type and configured SpeechKit", async (t) => {
  const { store, server, origin } = await setup();
  t.after(() => { server.close(); store.close(); });
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ login: "employee", password: "secret" }),
  });
  const session = await login.json();
  const response = await fetch(`${origin}/api/transcriptions`, {
    method: "POST",
    headers: {
      cookie: login.headers.get("set-cookie"),
      origin,
      "content-type": "audio/webm",
      "x-csrf-token": session.data.csrfToken,
    },
    body: Buffer.from("audio"),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "SPEECH_NOT_CONFIGURED");
});
