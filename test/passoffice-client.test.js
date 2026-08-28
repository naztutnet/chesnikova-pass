import test from "node:test";
import assert from "node:assert/strict";
import { PassOfficeClient, decryptTransport, encryptTransport } from "../server/integrations/passoffice-client.js";

test("PassOffice transport codec round-trips UTF-8 JSON", () => {
  const value = { loginOrEmail: "Координатор", password: "пароль", type: "ad" };
  assert.deepEqual(JSON.parse(decryptTransport(encryptTransport(value))), value);
});

test("login sends the AD contract and validates the returned portal session", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/api/public/auth/token")) {
      assert.deepEqual(JSON.parse(decryptTransport(options.body)), { loginOrEmail: "employee", password: "secret", type: "ad" });
      return new Response(JSON.stringify(encryptTransport({ bearer: "Bearer", token: "access", refreshKey: "refresh" })), { status: 200 });
    }
    assert.equal(options.headers.Authorization, "Bearer access");
    return new Response(JSON.stringify(encryptTransport({ me: { id: 7, login: "employee" }, profiles: [] })), { status: 200 });
  };
  const client = new PassOfficeClient({ baseUrl: "https://po.example.test/", fetchImpl });
  const result = await client.login({ login: "employee", password: "secret" });
  assert.deepEqual(result.portal, { accessToken: "Bearer access", refreshToken: "Bearer refresh" });
  assert.equal(result.profile.me.login, "employee");
  assert.equal(calls.length, 2);
});

test("invalid credentials are distinct from portal downtime", async () => {
  const denied = new PassOfficeClient({
    baseUrl: "https://po.example.test/",
    fetchImpl: async () => new Response(JSON.stringify(encryptTransport({ result: "Неверные данные" })), { status: 401 }),
  });
  await assert.rejects(() => denied.login({ login: "employee", password: "wrong" }), (error) => error.code === "PASSOFFICE_INVALID_CREDENTIALS");

  const offline = new PassOfficeClient({ baseUrl: "https://po.example.test/", fetchImpl: async () => { throw new TypeError("offline"); } });
  await assert.rejects(() => offline.login({ login: "employee", password: "secret" }), (error) => error.code === "PASSOFFICE_UNAVAILABLE");
});
