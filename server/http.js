import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { ApiError, errorBody } from "./errors.js";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const PUBLIC_FILES = new Set(["index.html", "styles.css", "app.js", "free-text-parser.js"]);

export function createHttpServer({ requestService, portalClient, sessionManager, loginLimiter, publicDir, providerName, appVersion = "dev" }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/health" && req.method === "GET") return json(res, 200, { status: "ok", provider: providerName, version: appVersion });

      if (url.pathname === "/api/auth/login" && req.method === "POST") {
        assertSameOrigin(req);
        const input = await readJson(req, 16 * 1024);
        const login = typeof input.login === "string" ? input.login.trim() : "";
        const password = typeof input.password === "string" ? input.password : "";
        const ip = clientIp(req);
        loginLimiter.check(ip, login);
        try {
          const { portal } = await portalClient.login({ login, password });
          loginLimiter.success(ip, login);
          const session = sessionManager.create({ login, portal });
          return json(res, 200, { data: publicSession(session) }, { "set-cookie": sessionManager.cookie(session) });
        } catch (error) {
          loginLimiter.failure(ip, login);
          throw error;
        } finally {
          input.password = "";
        }
      }

      if (url.pathname === "/api/session" && req.method === "GET") {
        const session = sessionManager.requireSession(req);
        return json(res, 200, { data: publicSession(session) });
      }

      if (url.pathname === "/api/auth/logout" && req.method === "POST") {
        assertSameOrigin(req);
        const session = sessionManager.requireSession(req);
        sessionManager.requireCsrf(req, session);
        sessionManager.destroy(req);
        await portalClient.revoke(session.portal);
        return json(res, 200, { data: { loggedOut: true } }, { "set-cookie": sessionManager.clearCookie() });
      }

      if (url.pathname.startsWith("/api/")) {
        const session = sessionManager.requireSession(req);
        const user = session.user;
        if (url.pathname === "/api/requests" && req.method === "POST") {
          assertSameOrigin(req);
          sessionManager.requireCsrf(req, session);
          const input = await readJson(req);
          const result = await requestService.create({ userId: user.id, portalSession: session.portal, idempotencyKey: req.headers["idempotency-key"], input });
          return json(res, result.replayed ? 200 : 201, { data: publicRequest(result.request), meta: { replayed: result.replayed } });
        }
        if (url.pathname === "/api/requests" && req.method === "GET") {
          const result = requestService.list({ userId: user.id, page: numberParam(url, "page", 1), pageSize: numberParam(url, "pageSize", 20), status: url.searchParams.get("status") });
          return json(res, 200, { data: result.data.map(publicRequest), pagination: result.pagination });
        }
        const match = url.pathname.match(/^\/api\/requests\/([a-f0-9-]+)$/i);
        if (match && req.method === "GET") return json(res, 200, { data: publicRequest(requestService.get({ userId: user.id, requestId: match[1] })) });
        throw new ApiError(404, "NOT_FOUND", "Маршрут не найден");
      }

      return serveStatic(res, publicDir, url.pathname);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (!(error instanceof ApiError)) console.error("request_failed", { name: error?.name, message: error?.message });
      return json(res, status, errorBody(error));
    }
  });
}

async function readJson(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Слишком большой запрос");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new ApiError(400, "INVALID_JSON", "Некорректный JSON"); }
}

async function serveStatic(res, publicDir, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const safe = normalize(relative);
  if (!PUBLIC_FILES.has(safe)) throw new ApiError(404, "NOT_FOUND", "Файл не найден");
  try {
    const body = await readFile(join(publicDir, safe));
    res.writeHead(200, { "content-type": MIME[extname(safe)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (error) {
    if (error?.code === "ENOENT") throw new ApiError(404, "NOT_FOUND", "Файл не найден");
    throw error;
  }
}

function numberParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  return raw === null ? fallback : Number(raw);
}

function publicRequest(request) {
  const primary = request.payload?.visitors?.[0];
  return {
    id: request.id,
    status: request.status,
    externalId: request.externalId,
    externalStatus: request.externalStatus,
    visitDate: request.payload?.visitDate || null,
    room: request.payload?.room || null,
    organization: request.payload?.organization || null,
    visitorCount: request.payload?.visitors?.length || 0,
    primaryVisitor: primary ? [primary.lastName, primary.firstName, primary.middleName].filter(Boolean).join(" ") : null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function publicSession(session) {
  return { user: session.user, csrfToken: session.csrfToken, expiresAt: new Date(session.expiresAt).toISOString() };
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  let parsedOrigin;
  try { parsedOrigin = new URL(origin).origin; } catch { parsedOrigin = ""; }
  if (!forwardedHost || parsedOrigin !== `${forwardedProto}://${forwardedHost}`) {
    throw new ApiError(403, "ORIGIN_REJECTED", "Запрос с другого сайта отклонён");
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
  res.end(JSON.stringify(body));
}
