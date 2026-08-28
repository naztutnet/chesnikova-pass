import test from "node:test";
import assert from "node:assert/strict";
import { createLoginLimiter, createSessionManager } from "../server/auth/session.js";

function request(headers = {}) { return { headers }; }

test("session cookie is opaque, HttpOnly, and required with a matching CSRF token", () => {
  let timestamp = 1_000;
  const manager = createSessionManager({ ttlMs: 60_000, secure: true, now: () => timestamp });
  const session = manager.create({ login: "employee", portal: { accessToken: "secret", refreshToken: "refresh" } });
  const header = manager.cookie(session);
  assert.match(header, /^chesnikova_pass_session=[A-Za-z0-9_-]+;/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Secure/);
  assert.doesNotMatch(header, /employee|secret|refresh/);

  const req = request({ cookie: header.split(";")[0], "x-csrf-token": session.csrfToken });
  assert.equal(manager.requireSession(req).user.login, "employee");
  assert.doesNotThrow(() => manager.requireCsrf(req, session));
  assert.throws(() => manager.requireCsrf(request({ cookie: req.headers.cookie, "x-csrf-token": "wrong" }), session), (error) => error.code === "CSRF_REJECTED");

  timestamp += 61_000;
  assert.equal(manager.get(req), null);
});

test("login limiter blocks repeated failures without storing the raw login key", () => {
  const limiter = createLoginLimiter({ maxAttempts: 2, windowMs: 60_000, now: () => 0 });
  limiter.check("127.0.0.1", "employee");
  limiter.failure("127.0.0.1", "employee");
  limiter.check("127.0.0.1", "employee");
  limiter.failure("127.0.0.1", "employee");
  assert.throws(() => limiter.check("127.0.0.1", "employee"), (error) => error.code === "LOGIN_RATE_LIMITED");
  limiter.success("127.0.0.1", "employee");
  assert.doesNotThrow(() => limiter.check("127.0.0.1", "employee"));
});
