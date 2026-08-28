import test from "node:test";
import assert from "node:assert/strict";
import { YandexSpeechKitClient } from "../server/integrations/yandex-speechkit.js";

test("converts browser audio and sends only Ogg Opus to Yandex SpeechKit", async () => {
  const converted = Buffer.from("ogg-opus");
  let request;
  const client = new YandexSpeechKitClient({
    apiKey: "test-key",
    folderId: "folder-id",
    convertAudio: async (audio, options) => {
      assert.deepEqual(audio, Buffer.from("browser-audio"));
      assert.equal(options.contentType, "audio/mp4");
      return converted;
    },
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ result: "  Завтра D212  " }), { status: 200 });
    },
  });

  const text = await client.transcribe({ audio: Buffer.from("browser-audio"), contentType: "audio/mp4" });
  assert.equal(text, "Завтра D212");
  assert.match(request.url, /folderId=folder-id/);
  assert.match(request.url, /format=oggopus/);
  assert.equal(request.options.headers.Authorization, "Api-Key test-key");
  assert.deepEqual(request.options.body, converted);
});

test("fails closed when SpeechKit is not configured or returns no text", async () => {
  const missing = new YandexSpeechKitClient();
  await assert.rejects(() => missing.transcribe({ audio: Buffer.from("a"), contentType: "audio/webm" }), (error) => error.code === "SPEECH_NOT_CONFIGURED");

  const empty = new YandexSpeechKitClient({
    apiKey: "test-key",
    folderId: "folder-id",
    convertAudio: async () => Buffer.from("ogg"),
    fetchImpl: async () => new Response(JSON.stringify({ result: "" }), { status: 200 }),
  });
  await assert.rejects(() => empty.transcribe({ audio: Buffer.from("a"), contentType: "audio/webm" }), (error) => error.code === "SPEECH_NOT_RECOGNIZED");
});

test("does not expose the provider response when Yandex rejects audio", async () => {
  const client = new YandexSpeechKitClient({
    apiKey: "test-key",
    folderId: "folder-id",
    convertAudio: async () => Buffer.from("ogg"),
    fetchImpl: async () => new Response(JSON.stringify({ error_message: "provider-internal-details" }), { status: 400 }),
  });
  await assert.rejects(
    () => client.transcribe({ audio: Buffer.from("a"), contentType: "audio/webm" }),
    (error) => error.code === "SPEECH_PROVIDER_ERROR" && !error.message.includes("provider-internal-details"),
  );
});
