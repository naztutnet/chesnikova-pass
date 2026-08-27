import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { ApiError, errorBody } from "./errors.js";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const PUBLIC_FILES = new Set(["index.html", "styles.css", "app.js", "free-text-parser.js"]);

export function createHttpServer({ requestService, authenticate, publicDir, providerName }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/health" && req.method === "GET") return json(res, 200, { status: "ok", provider: providerName });

      if (url.pathname.startsWith("/api/")) {
        const user = authenticate(req);
        if (url.pathname === "/api/session" && req.method === "GET") return json(res, 200, { data: { user } });
        if (url.pathname === "/api/requests" && req.method === "POST") {
          const input = await readJson(req);
          const result = await requestService.create({ userId: user.id, idempotencyKey: req.headers["idempotency-key"], input });
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

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Слишком большой запрос");
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
  return { id: request.id, status: request.status, externalId: request.externalId, externalStatus: request.externalStatus, createdAt: request.createdAt, updatedAt: request.updatedAt };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
