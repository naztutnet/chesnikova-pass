import { createCipheriv, createDecipheriv } from "node:crypto";
import { ApiError } from "../errors.js";

// PassOffice's public SPA uses this client-side transport codec for JSON bodies.
// It is protocol compatibility, not a secret or a replacement for HTTPS.
const TRANSPORT_KEY = Buffer.from("QWt1bERpRDdra0Z6MmJKYllYZG1yWXhjRFJUTThjVTY=", "base64");

export class PassOfficeClient {
  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") throw new Error("PASSOFFICE_BASE_URL must use HTTPS");
    this.baseUrl = url;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async login({ login, password }) {
    const loginOrEmail = cleanCredential(login, "Логин", 256);
    const secret = cleanCredential(password, "Пароль", 1024, false);
    const tokens = await this.request("/api/public/auth/token", {
      method: "POST",
      body: { loginOrEmail, password: secret, type: "ad" },
      publicRequest: true,
    });
    if (!tokens?.token || !tokens?.refreshKey || !tokens?.bearer) {
      throw new ApiError(502, "PASSOFFICE_INVALID_AUTH_RESPONSE", "PassOffice вернул неожиданный ответ при входе");
    }
    const portal = {
      accessToken: `${tokens.bearer} ${tokens.token}`,
      refreshToken: `${tokens.bearer} ${tokens.refreshKey}`,
    };
    const profile = await this.getMe(portal);
    return { portal, profile };
  }

  async getMe(portal) {
    return this.authorizedRequest(portal, "/api/secure/account/getMe");
  }

  async getObject(portal, type, id) {
    return this.authorizedRequest(portal, `/api/secure/${objectType(type)}/${positiveId(id)}`);
  }

  async addObject(portal, type, value) {
    return this.authorizedRequest(portal, `/api/secure/${objectType(type)}`, { method: "POST", body: value });
  }

  async validateDraft(portal, value) {
    return this.authorizedRequest(portal, "/api/secure/Request/validateDraft", { method: "POST", body: value });
  }

  async confirmDraft(portal, value) {
    return this.authorizedRequest(portal, "/api/secure/Request/confirmDraft", { method: "POST", body: value });
  }

  async authorizedRequest(portal, path, options = {}) {
    try {
      return await this.request(path, { ...options, token: portal.accessToken });
    } catch (error) {
      if (error?.code !== "PASSOFFICE_SESSION_EXPIRED") throw error;
      await this.refresh(portal);
      return this.request(path, { ...options, token: portal.accessToken, retry: false });
    }
  }

  async refresh(portal) {
    const tokens = await this.request("/api/secure/auth/token", { method: "PUT", token: portal.refreshToken });
    if (!tokens?.token || !tokens?.refreshKey || !tokens?.bearer) throw new ApiError(401, "PASSOFFICE_SESSION_EXPIRED", "Сессия PassOffice истекла. Войдите снова");
    portal.accessToken = `${tokens.bearer} ${tokens.token}`;
    portal.refreshToken = `${tokens.bearer} ${tokens.refreshKey}`;
    return portal;
  }

  async revoke(portal) {
    try { await this.request("/api/secure/auth/token", { method: "DELETE", token: portal.accessToken }); } catch {}
  }

  async request(path, { method = "GET", body, token, publicRequest = false, retry = true } = {}) {
    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) throw new Error("PassOffice request must stay on the configured origin");
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = token;
    let encodedBody;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      encodedBody = encryptTransport(body);
    }

    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: encodedBody,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new ApiError(504, "PASSOFFICE_TIMEOUT", "PassOffice не ответил вовремя");
      throw new ApiError(502, "PASSOFFICE_UNAVAILABLE", "Не удалось связаться с PassOffice");
    }

    const raw = await response.text();
    const payload = decodeResponse(raw);
    if (response.status === 401 && token && !publicRequest && retry) {
      throw new ApiError(401, "PASSOFFICE_SESSION_EXPIRED", "Сессия PassOffice истекла. Войдите снова");
    }
    if (!response.ok) {
      const invalidCredentials = publicRequest && [400, 401, 403].includes(response.status);
      const message = typeof payload?.result === "string" && payload.result.trim()
        ? payload.result.trim()
        : invalidCredentials
          ? "Неверный логин или пароль"
          : "PassOffice отклонил запрос";
      const code = invalidCredentials ? "PASSOFFICE_INVALID_CREDENTIALS" : "PASSOFFICE_REQUEST_FAILED";
      throw new ApiError(invalidCredentials ? 401 : 502, code, message, { upstreamStatus: response.status });
    }
    return payload;
  }
}

function objectType(value) {
  const type = String(value || "");
  if (!/^[A-Z][A-Za-z0-9]{0,63}$/.test(type)) throw new Error("Invalid PassOffice object type");
  return type;
}

function positiveId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid PassOffice object id");
  return id;
}

export function encryptTransport(value) {
  const cipher = createCipheriv("aes-256-ecb", TRANSPORT_KEY, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]).toString("base64");
}

export function decryptTransport(value) {
  const decipher = createDecipheriv("aes-256-ecb", TRANSPORT_KEY, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(String(value), "base64"), decipher.final()]).toString("utf8");
}

function decodeResponse(raw) {
  if (!raw) return null;
  let candidate = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "string") return parsed;
    candidate = parsed;
  } catch {}
  try { return JSON.parse(decryptTransport(candidate)); }
  catch {
    try { return JSON.parse(candidate); } catch { return candidate; }
  }
}

function cleanCredential(value, label, max, trim = true) {
  const result = trim ? String(value || "").trim() : String(value || "");
  if (!result || result.length > max) throw new ApiError(422, "INVALID_CREDENTIALS", `${label}: проверьте значение`);
  return result;
}
