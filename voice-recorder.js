const MIME_TYPES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/mp4",
];

export function getVoiceRecorderSupport(scope = globalThis) {
  return Boolean(
    scope?.navigator?.mediaDevices?.getUserMedia
    && scope?.MediaRecorder,
  );
}

export function preferredRecordingMimeType(MediaRecorderApi) {
  if (!MediaRecorderApi?.isTypeSupported) return "";
  return MIME_TYPES.find((mimeType) => MediaRecorderApi.isTypeSupported(mimeType)) || "";
}

export function recordingErrorMessage(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Разрешите доступ к микрофону в настройках браузера и попробуйте снова.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Микрофон не найден. Проверьте устройство и попробуйте снова.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Микрофон занят другим приложением. Закройте его и попробуйте снова.";
  }
  return "Не удалось начать запись. Попробуйте ещё раз или введите текст вручную.";
}
