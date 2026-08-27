import { createHash } from "node:crypto";
import { ApiError } from "../errors.js";

export const REQUEST_STATUSES = Object.freeze({
  SUBMITTING: "SUBMITTING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  UNKNOWN: "UNKNOWN",
});

export function validateCreateRequest(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(422, "VALIDATION_ERROR", "Некорректные данные заявки", [{ field: "$", message: "Ожидается объект" }]);
  }

  const visitDate = cleanString(value.visitDate);
  const room = cleanString(value.room);
  const organization = cleanString(value.organization);
  if (!isIsoDate(visitDate)) issues.push({ field: "visitDate", message: "Укажите дату в формате YYYY-MM-DD" });
  if (!room) issues.push({ field: "room", message: "Укажите комнату или павильон" });

  const rawVisitors = Array.isArray(value.visitors) ? value.visitors : [];
  if (rawVisitors.length < 1 || rawVisitors.length > 20) {
    issues.push({ field: "visitors", message: "Добавьте от 1 до 20 посетителей" });
  }

  const visitors = rawVisitors.slice(0, 20).map((visitor, index) => {
    const lastName = cleanString(visitor?.lastName);
    const firstName = cleanString(visitor?.firstName);
    const middleName = cleanString(visitor?.middleName);
    const birthDate = cleanString(visitor?.birthDate);
    if (!lastName) issues.push({ field: `visitors.${index}.lastName`, message: "Укажите фамилию" });
    if (!firstName) issues.push({ field: `visitors.${index}.firstName`, message: "Укажите имя" });
    if (!middleName) issues.push({ field: `visitors.${index}.middleName`, message: "Укажите отчество" });
    if (birthDate && !isIsoDate(birthDate)) issues.push({ field: `visitors.${index}.birthDate`, message: "Некорректная дата рождения" });
    return { lastName, firstName, middleName, birthDate: birthDate || null, isForeignCitizen: visitor?.isForeignCitizen === true };
  });

  if (issues.length) throw new ApiError(422, "VALIDATION_ERROR", "Проверьте поля заявки", issues);
  return { visitDate, room, organization: organization || null, visitors };
}

export function hashRequest(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function validateProviderResult(value) {
  if (!value || typeof value.externalId !== "string" || !value.externalId || typeof value.externalStatus !== "string" || !value.externalStatus) {
    throw new ApiError(502, "INVALID_PROVIDER_RESPONSE", "PassOffice вернул неожиданный ответ");
  }
  return { externalId: value.externalId, externalStatus: value.externalStatus };
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
