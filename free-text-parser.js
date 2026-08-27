const MONTHS = new Map([
  ["января", 1], ["январь", 1], ["февраля", 2], ["февраль", 2],
  ["марта", 3], ["март", 3], ["апреля", 4], ["апрель", 4],
  ["мая", 5], ["май", 5], ["июня", 6], ["июнь", 6],
  ["июля", 7], ["июль", 7], ["августа", 8], ["август", 8],
  ["сентября", 9], ["сентябрь", 9], ["октября", 10], ["октябрь", 10],
  ["ноября", 11], ["ноябрь", 11], ["декабря", 12], ["декабрь", 12],
]);

const MONTH_PATTERN = [...MONTHS.keys()].join("|");

export function parseFreeTextRequest(value, { today = new Date() } = {}) {
  const text = String(value || "").replace(/\r/g, "").trim().slice(0, 4000);
  const visitPart = text.split(/(?:гости?|посетители?)\s*:/iu)[0];
  const date = parseVisitDate(visitPart, today);
  const room = parseRoom(visitPart);
  const organization = parseOrganization(text);
  const visitors = parseVisitors(text);
  const missing = [];

  if (!date) missing.push({ path: "date", label: "дата посещения" });
  if (!room) missing.push({ path: "room", label: "комната или павильон" });
  if (!visitors.length) missing.push({ path: "visitors", label: "ФИО хотя бы одного гостя" });
  visitors.forEach((visitor, index) => {
    if (!visitor.lastName) missing.push({ path: `visitors.${index}.lastName`, label: `фамилия гостя ${index + 1}` });
    if (!visitor.firstName) missing.push({ path: `visitors.${index}.firstName`, label: `имя гостя ${index + 1}` });
    if (!visitor.middleName) missing.push({ path: `visitors.${index}.middleName`, label: `отчество гостя ${index + 1}` });
  });

  return {
    source: text,
    draft: {
      requestType: "single",
      date: date || "",
      organization,
      room,
      visitors: visitors.length ? visitors : [emptyVisitor()],
    },
    missing,
  };
}

function parseVisitDate(text, today) {
  const normalized = text.toLocaleLowerCase("ru-RU");
  if (/послезавтра/u.test(normalized)) return relativeIso(today, 2);
  if (/завтра/u.test(normalized)) return relativeIso(today, 1);
  if (/сегодня/u.test(normalized)) return relativeIso(today, 0);

  const numeric = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/u);
  if (numeric) {
    const year = normalizeYear(numeric[3], today.getFullYear());
    return validIso(year, Number(numeric[2]), Number(numeric[1]));
  }

  const words = normalized.match(new RegExp(`(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, "iu"));
  if (!words) return "";
  const month = MONTHS.get(words[2].toLocaleLowerCase("ru-RU"));
  return validIso(Number(words[3] || today.getFullYear()), month, Number(words[1]));
}

function parseRoom(text) {
  const code = text.match(/([А-ЯЁA-Z]{1,5}\s*[—-]\s*\d+[А-ЯЁA-Zа-яёa-z]?)/u);
  if (code) return normalizeDash(code[1]);

  const named = text.match(/(павильон|комната|кабинет|корпус)\s*(?:№|номер)?\s*[:—-]?\s*([\dА-ЯЁA-Z][\dА-ЯЁA-Zа-яёa-z/-]{0,11})/iu);
  if (!named) return "";
  return `${capitalize(named[1])} ${named[2]}`;
}

function parseOrganization(text) {
  const marked = text.match(/(?:организация|компания)\s*[:—-]\s*([^.;\n]+)/iu);
  if (marked) return marked[1].trim();
  const legal = text.match(/(?:из|от)\s+((?:ООО|АО|ПАО|ИП)\s+[«"]?[^,.;\n]+[»"]?)/u);
  return legal?.[1]?.trim() || "";
}

function parseVisitors(text) {
  const marker = text.match(/(?:гости?|посетители?)\s*:\s*/iu);
  if (!marker) return [];
  const start = (marker.index || 0) + marker[0].length;
  const tail = text.slice(start).split(/(?:организация|компания)\s*[:—-]/iu)[0]
    .replace(/,\s*(иностранец|иностранный гражданин)/giu, " $1");
  const entries = tail
    .split(/\s*(?:,|;|\n|\s+и\s+)\s*/iu)
    .map((entry) => entry.trim().replace(/[.!]+$/u, "").trim())
    .filter(Boolean)
    .slice(0, 20);

  return entries.map((entry) => {
    const birthMatch = entry.match(/\((\d{1,2})[./-](\d{1,2})[./-](\d{4})\)/u);
    const foreignCitizen = /(?:иностранец|иностранный гражданин)/iu.test(entry);
    const namePart = entry
      .replace(/\([^)]*\)/gu, " ")
      .replace(/(?:иностранец|иностранный гражданин)/giu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = namePart.split(" ").filter((part) => /^[А-ЯЁA-Z][А-ЯЁA-Zа-яёa-z'-]+$/u.test(part)).slice(0, 3);
    return {
      lastName: parts[0] || "",
      firstName: parts[1] || "",
      middleName: parts[2] || "",
      birthDate: birthMatch ? validIso(Number(birthMatch[3]), Number(birthMatch[2]), Number(birthMatch[1])) : "",
      foreignCitizen,
    };
  }).filter((visitor) => visitor.lastName || visitor.firstName || visitor.middleName);
}

function emptyVisitor() {
  return { lastName: "", firstName: "", middleName: "", birthDate: "", foreignCitizen: false };
}

function normalizeYear(value, fallback) {
  if (!value) return fallback;
  const year = Number(value);
  return year < 100 ? 2000 + year : year;
}

function relativeIso(value, days) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate() + days, 12);
  return localIso(date);
}

function validIso(year, month, day) {
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return localIso(date);
}

function localIso(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function normalizeDash(value) {
  return value.replace(/\s*[—-]\s*/u, " — ").trim();
}

function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase("ru-RU") + value.slice(1).toLocaleLowerCase("ru-RU");
}
