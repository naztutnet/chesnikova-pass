import test from "node:test";
import assert from "node:assert/strict";
import { parseFreeTextRequest } from "../free-text-parser.js";

const today = new Date(2026, 7, 26, 12);

test("parses a structured free-text visit with several guests", () => {
  const result = parseFreeTextRequest(
    "27 августа 2026, БП — 10. Гости: Иванов Иван Иванович, Петрова Анна Сергеевна. Организация: Киносервис.",
    { today },
  );

  assert.equal(result.draft.date, "2026-08-27");
  assert.equal(result.draft.room, "БП — 10");
  assert.equal(result.draft.organization, "Киносервис");
  assert.deepEqual(result.draft.visitors, [
    { lastName: "Иванов", firstName: "Иван", middleName: "Иванович", birthDate: "", foreignCitizen: false },
    { lastName: "Петрова", firstName: "Анна", middleName: "Сергеевна", birthDate: "", foreignCitizen: false },
  ]);
  assert.deepEqual(result.missing, []);
});

test("understands relative dates and reports a missing patronymic", () => {
  const result = parseFreeTextRequest("Завтра, павильон 4. Гости: Воронова Елена.", { today });

  assert.equal(result.draft.date, "2026-08-27");
  assert.equal(result.draft.room, "Павильон 4");
  assert.equal(result.draft.visitors[0].lastName, "Воронова");
  assert.equal(result.draft.visitors[0].firstName, "Елена");
  assert.deepEqual(result.missing.map((item) => item.path), ["visitors.0.middleName"]);
});

test("keeps birth dates attached to visitors", () => {
  const result = parseFreeTextRequest(
    "28.08.2026, комната 12. Гости: Смит Джон Роберт (05.04.1991), иностранный гражданин.",
    { today },
  );

  assert.equal(result.draft.date, "2026-08-28");
  assert.equal(result.draft.visitors[0].birthDate, "1991-04-05");
  assert.equal(result.draft.visitors[0].foreignCitizen, true);
});

test("returns an editable empty draft when nothing can be recognized", () => {
  const result = parseFreeTextRequest("Нужно оформить пропуск", { today });

  assert.equal(result.draft.visitors.length, 1);
  assert.deepEqual(result.missing.map((item) => item.path), ["date", "room", "visitors"]);
});
