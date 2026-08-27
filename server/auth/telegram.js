import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "../errors.js";

export function createTelegramAuthenticator({ botToken, allowDemo = false, maxAgeSeconds = 3600, now = () => Date.now() }) {
  return function authenticate(request) {
    const authorization = request.headers.authorization || "";
    if (allowDemo && authorization === "demo") return { id: "demo-user", firstName: "Демо", username: null };
    if (!authorization.startsWith("tma ")) throw new ApiError(401, "UNAUTHENTICATED", "Откройте приложение из Telegram");
    return validateTelegramInitData(authorization.slice(4), { botToken, maxAgeSeconds, now });
  };
}

export function validateTelegramInitData(initData, { botToken, maxAgeSeconds = 3600, now = () => Date.now() }) {
  if (!botToken) throw new ApiError(500, "AUTH_NOT_CONFIGURED", "Авторизация Telegram не настроена");
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") || "";
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqualHex(receivedHash, expectedHash)) throw new ApiError(401, "INVALID_INIT_DATA", "Не удалось подтвердить запуск из Telegram");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Math.abs(now() / 1000 - authDate) > maxAgeSeconds) {
    throw new ApiError(401, "EXPIRED_INIT_DATA", "Сессия Telegram устарела, откройте приложение заново");
  }

  let user;
  try { user = JSON.parse(params.get("user") || "null"); } catch { user = null; }
  if (!user || !Number.isSafeInteger(user.id)) throw new ApiError(401, "INVALID_INIT_DATA", "Telegram не передал пользователя");
  return { id: String(user.id), firstName: typeof user.first_name === "string" ? user.first_name : "", username: typeof user.username === "string" ? user.username : null };
}

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
