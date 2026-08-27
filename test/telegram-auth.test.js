import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validateTelegramInitData } from "../server/auth/telegram.js";

test("validates signed Telegram initData", () => {
  const botToken = "123:test-token";
  const authDate = 1_700_000_000;
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: "query", user: JSON.stringify({ id: 42, first_name: "Елена", username: "elena" }) });
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  assert.deepEqual(validateTelegramInitData(params.toString(), { botToken, now: () => authDate * 1000 }), { id: "42", firstName: "Елена", username: "elena" });
});

test("rejects tampered Telegram initData", () => {
  assert.throws(() => validateTelegramInitData("auth_date=1700000000&user=%7B%22id%22%3A42%7D&hash=00", { botToken: "123:test", now: () => 1_700_000_000_000 }), (error) => error.code === "INVALID_INIT_DATA");
});
