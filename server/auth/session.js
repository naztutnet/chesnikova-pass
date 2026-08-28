import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors.js";

const DEFAULT_COOKIE = "chesnikova_pass_session";

export function createSessionManager({ ttlMs = 12 * 60 * 60 * 1000, cookieName = DEFAULT_COOKIE, secure = true, now = () => Date.now() } = {}) {
  const sessions = new Map();

  function create({ login, portal }) {
    prune();
    const id = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const normalizedLogin = String(login).trim().toLocaleLowerCase("ru-RU");
    const session = {
      id,
      csrfToken,
      user: {
        id: createHash("sha256").update(normalizedLogin).digest("hex"),
        login: String(login).trim(),
      },
      portal,
      expiresAt: now() + ttlMs,
    };
    sessions.set(id, session);
    return session;
  }

  function get(req) {
    prune();
    const id = parseCookies(req.headers.cookie || "")[cookieName];
    if (!id) return null;
    const session = sessions.get(id);
    if (!session || session.expiresAt <= now()) {
      sessions.delete(id);
      return null;
    }
    session.expiresAt = now() + ttlMs;
    return session;
  }

  function requireSession(req) {
    const session = get(req);
    if (!session) throw new ApiError(401, "AUTH_REQUIRED", "Войдите с логином и паролем от PassOffice");
    return session;
  }

  function requireCsrf(req, session) {
    const supplied = String(req.headers["x-csrf-token"] || "");
    const expected = session.csrfToken;
    if (!supplied || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new ApiError(403, "CSRF_REJECTED", "Обновите страницу и повторите действие");
    }
  }

  function destroy(req) {
    const id = parseCookies(req.headers.cookie || "")[cookieName];
    if (!id) return null;
    const session = sessions.get(id) || null;
    sessions.delete(id);
    return session;
  }

  function cookie(session) {
    const maxAge = Math.max(0, Math.floor((session.expiresAt - now()) / 1000));
    return `${cookieName}=${session.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  }

  function clearCookie() {
    return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
  }

  function prune() {
    const timestamp = now();
    for (const [id, session] of sessions) if (session.expiresAt <= timestamp) sessions.delete(id);
  }

  return { create, get, requireSession, requireCsrf, destroy, cookie, clearCookie, size: () => sessions.size };
}

export function createLoginLimiter({ windowMs = 15 * 60 * 1000, maxAttempts = 5, now = () => Date.now() } = {}) {
  const entries = new Map();

  function key(ip, login) {
    const normalized = `${String(ip || "unknown")}|${String(login || "").trim().toLocaleLowerCase("ru-RU")}`;
    return createHash("sha256").update(normalized).digest("hex");
  }

  function check(ip, login) {
    const id = key(ip, login);
    const current = entries.get(id);
    if (!current || current.resetAt <= now()) {
      entries.set(id, { count: 0, resetAt: now() + windowMs });
      return;
    }
    if (current.count >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now()) / 1000));
      throw new ApiError(429, "LOGIN_RATE_LIMITED", `Слишком много попыток входа. Повторите через ${retryAfter} сек.`, { retryAfter });
    }
  }

  function failure(ip, login) {
    const id = key(ip, login);
    const current = entries.get(id);
    if (!current || current.resetAt <= now()) entries.set(id, { count: 1, resetAt: now() + windowMs });
    else current.count += 1;
  }

  function success(ip, login) {
    entries.delete(key(ip, login));
  }

  return { check, failure, success };
}

function parseCookies(value) {
  const result = {};
  for (const item of value.split(";")) {
    const index = item.indexOf("=");
    if (index < 1) continue;
    const name = item.slice(0, index).trim();
    const raw = item.slice(index + 1).trim();
    try { result[name] = decodeURIComponent(raw); } catch { result[name] = raw; }
  }
  return result;
}
