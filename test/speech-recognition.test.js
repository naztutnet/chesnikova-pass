import test from "node:test";
import assert from "node:assert/strict";
import {
  getSpeechRecognitionConstructor,
  mergeSpeechTranscript,
  speechRecognitionErrorMessage,
} from "../speech-recognition.js";

test("uses the standard speech recognition API when available", () => {
  class StandardRecognition {}
  class PrefixedRecognition {}
  assert.equal(getSpeechRecognitionConstructor({
    SpeechRecognition: StandardRecognition,
    webkitSpeechRecognition: PrefixedRecognition,
  }), StandardRecognition);
});

test("falls back to the WebKit-prefixed speech recognition API", () => {
  class PrefixedRecognition {}
  assert.equal(getSpeechRecognitionConstructor({ webkitSpeechRecognition: PrefixedRecognition }), PrefixedRecognition);
  assert.equal(getSpeechRecognitionConstructor({}), null);
});

test("appends dictation to editable text with clean spacing", () => {
  assert.equal(mergeSpeechTranscript("Завтра, D212.", "Иванов Иван Иванович"), "Завтра, D212. Иванов Иван Иванович");
  assert.equal(mergeSpeechTranscript("", "  Два гостя  "), "Два гостя");
  assert.equal(mergeSpeechTranscript("Уже введено", ""), "Уже введено");
});

test("returns actionable messages for common microphone errors", () => {
  assert.match(speechRecognitionErrorMessage("not-allowed"), /Разрешите доступ к микрофону/);
  assert.match(speechRecognitionErrorMessage("service-not-allowed"), /Safari/);
  assert.match(speechRecognitionErrorMessage("network"), /Проверьте интернет/);
  assert.match(speechRecognitionErrorMessage("unknown"), /введите текст вручную/);
});
