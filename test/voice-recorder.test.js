import test from "node:test";
import assert from "node:assert/strict";
import {
  getVoiceRecorderSupport,
  preferredRecordingMimeType,
  recordingErrorMessage,
} from "../voice-recorder.js";

test("detects whether the browser can record microphone audio", () => {
  class Recorder {}
  assert.equal(getVoiceRecorderSupport({ navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder: Recorder }), true);
  assert.equal(getVoiceRecorderSupport({ navigator: {}, MediaRecorder: Recorder }), false);
  assert.equal(getVoiceRecorderSupport({ navigator: { mediaDevices: { getUserMedia() {} } } }), false);
});

test("prefers Ogg Opus and falls back to a browser-supported container", () => {
  const supported = new Set(["audio/webm;codecs=opus", "audio/mp4"]);
  const Recorder = { isTypeSupported: (type) => supported.has(type) };
  assert.equal(preferredRecordingMimeType(Recorder), "audio/webm;codecs=opus");
  assert.equal(preferredRecordingMimeType({ isTypeSupported: () => false }), "");
});

test("returns actionable microphone errors", () => {
  assert.match(recordingErrorMessage({ name: "NotAllowedError" }), /Разрешите доступ/);
  assert.match(recordingErrorMessage({ name: "NotFoundError" }), /не найден/);
  assert.match(recordingErrorMessage({ name: "NotReadableError" }), /занят/);
});
