export function getSpeechRecognitionConstructor(scope = globalThis) {
  return scope?.SpeechRecognition || scope?.webkitSpeechRecognition || null;
}

export function mergeSpeechTranscript(baseText = "", spokenText = "") {
  const base = String(baseText).trim();
  const spoken = String(spokenText).trim();
  if (!base) return spoken;
  if (!spoken) return base;
  return `${base} ${spoken}`;
}

export function speechRecognitionErrorMessage(code = "") {
  const messages = {
    "not-allowed": "Разрешите доступ к микрофону в настройках браузера и попробуйте снова.",
    "service-not-allowed": "Разрешите распознавание речи в браузере. В Safari также проверьте, что Siri включена.",
    "audio-capture": "Микрофон не найден или занят другим приложением.",
    "no-speech": "Речь не распознана. Нажмите кнопку и попробуйте говорить чуть громче.",
    network: "Не удалось подключиться к сервису распознавания. Проверьте интернет.",
    aborted: "Запись остановлена.",
    "language-not-supported": "Русский язык не поддерживается этим браузером.",
  };
  return messages[code] || "Не удалось распознать речь. Попробуйте ещё раз или введите текст вручную.";
}
