import test from "node:test";
import assert from "node:assert/strict";
import { validateCreateRequest } from "../server/domain/request.js";

const valid = {
  visitDate: "2026-08-27",
  room: "БП — 10",
  organization: "Кинокомпания Лунапарк",
  visitors: [{ lastName: "Воронова", firstName: "Елена", middleName: "Сергеевна", birthDate: "1990-05-20", isForeignCitizen: false }],
};

test("normalizes a valid guest request", () => {
  assert.deepEqual(validateCreateRequest(valid), valid);
});

test("requires portal-mandatory fields", () => {
  assert.throws(() => validateCreateRequest({ visitDate: "", room: "", visitors: [{}] }), (error) => error.code === "VALIDATION_ERROR" && error.details.length === 5);
});

test("limits a request to 20 visitors", () => {
  assert.throws(() => validateCreateRequest({ ...valid, visitors: Array.from({ length: 21 }, () => valid.visitors[0]) }), (error) => error.code === "VALIDATION_ERROR");
});
