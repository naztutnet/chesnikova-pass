import { spawn } from "node:child_process";
import { ApiError } from "../errors.js";

const STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";
const MAX_YANDEX_BYTES = 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 20_000;

export class YandexSpeechKitClient {
  constructor({ apiKey, folderId, fetchImpl = fetch, convertAudio = convertToOggOpus } = {}) {
    this.apiKey = apiKey || "";
    this.folderId = folderId || "";
    this.fetchImpl = fetchImpl;
    this.convertAudio = convertAudio;
  }

  get isConfigured() {
    return Boolean(this.apiKey && this.folderId);
  }

  async transcribe({ audio, contentType }) {
    if (!this.isConfigured) {
      throw new ApiError(503, "SPEECH_NOT_CONFIGURED", "Распознавание речи пока не настроено");
    }
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      throw new ApiError(422, "EMPTY_AUDIO", "Запись получилась пустой. Попробуйте ещё раз");
    }

    let oggAudio;
    try {
      oggAudio = await this.convertAudio(audio, { contentType });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(422, "AUDIO_CONVERSION_FAILED", "Не удалось обработать запись. Попробуйте ещё раз");
    }
    if (!oggAudio.length || oggAudio.length > MAX_YANDEX_BYTES) {
      throw new ApiError(413, "AUDIO_TOO_LARGE", "Голосовая заявка слишком длинная. Запишите не больше 30 секунд");
    }

    const url = new URL(STT_URL);
    url.searchParams.set("folderId", this.folderId);
    url.searchParams.set("lang", "ru-RU");
    url.searchParams.set("topic", "general");
    url.searchParams.set("format", "oggopus");

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Api-Key ${this.apiKey}` },
        body: oggAudio,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ApiError(502, "SPEECH_PROVIDER_UNAVAILABLE", "Яндекс SpeechKit временно недоступен. Попробуйте ещё раз");
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(502, "SPEECH_PROVIDER_ERROR", "Яндекс SpeechKit не смог обработать запись");
    }
    const text = typeof payload.result === "string" ? payload.result.trim() : "";
    if (!text) {
      throw new ApiError(422, "SPEECH_NOT_RECOGNIZED", "Не разобрал, что сказано. Попробуйте ещё раз или напишите текстом");
    }
    return text;
  }
}

export function convertToOggOpus(audio) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-i", "pipe:0", "-t", "30", "-vn", "-ac", "1", "-ar", "16000",
      "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const output = [];
    let outputSize = 0;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new ApiError(422, "AUDIO_CONVERSION_TIMEOUT", "Не удалось обработать запись. Попробуйте короче"));
    }, CONVERSION_TIMEOUT_MS);

    child.once("error", () => finish(reject, new ApiError(503, "AUDIO_CONVERTER_UNAVAILABLE", "Обработка голосовых временно недоступна")));
    child.stdout.on("data", (chunk) => {
      outputSize += chunk.length;
      if (outputSize > MAX_YANDEX_BYTES) {
        child.kill("SIGKILL");
        finish(reject, new ApiError(413, "AUDIO_TOO_LARGE", "Голосовая заявка слишком длинная. Запишите не больше 30 секунд"));
        return;
      }
      output.push(chunk);
    });
    child.stderr.resume();
    child.once("close", (code) => {
      if (code !== 0) {
        finish(reject, new ApiError(422, "INVALID_AUDIO", "Не удалось прочитать запись. Попробуйте записать её заново"));
        return;
      }
      finish(resolve, Buffer.concat(output));
    });
    child.stdin.once("error", () => {});
    child.stdin.end(audio);
  });
}
