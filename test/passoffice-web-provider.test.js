import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../server/errors.js";
import { PassOfficeWebProvider } from "../server/integrations/passoffice-web-provider.js";

const input = {
  visitDate: "2026-08-29",
  room: "БП - 10",
  organization: "Кинокомпания Лунапарк",
  visitors: [{ lastName: "Тестов", firstName: "Тест", middleName: "Тестович", birthDate: "1990-05-20", isForeignCitizen: false }],
};
const portalSession = { accessToken: "access", refreshToken: "refresh" };

function setup({ validation = [], confirmation = { id: 153500, state: 2 }, confirmError = null } = {}) {
  const calls = [];
  const objects = {
    "Person:7429": { id: 7429, type: "Person", organization: { id: 851, type: "Organization" } },
    "Site:8792": { id: 8792, type: "Site" },
    "AccessGroup:2166": { id: 2166, type: "AccessGroup" },
    "PersonCategory:16": { id: 16, type: "PersonCategory", parentId: 11 },
  };
  const client = {
    async getMe() { calls.push(["getMe"]); return { me: { personal: { id: 7429 }, organization: objects["Person:7429"].organization } }; },
    async getObject(_portal, type, id) { calls.push(["getObject", type, id]); return objects[`${type}:${id}`]; },
    async addObject(_portal, type, value) { calls.push(["addObject", type, value]); return { ...value, id: 113100 }; },
    async validateDraft(_portal, value) { calls.push(["validateDraft", value]); return validation; },
    async confirmDraft(_portal, value) { calls.push(["confirmDraft", value]); if (confirmError) throw confirmError; return confirmation; },
  };
  return { provider: new PassOfficeWebProvider({ client, siteId: 8792, accessGroupId: 2166, guestCategoryId: 16 }), calls };
}

test("creates visitors, validates the full draft, and confirms it once", async () => {
  const { provider, calls } = setup();
  const result = await provider.submit(input, { portalSession });
  assert.deepEqual(result, { externalId: "153500", externalStatus: "ON_CONFIRMATION" });
  assert.deepEqual(calls.map((call) => call[0]), ["getMe", "getObject", "getObject", "getObject", "getObject", "addObject", "validateDraft", "confirmDraft"]);

  const person = calls.find((call) => call[0] === "addObject")[2];
  assert.equal(person.category.id, 16);
  assert.equal(person.organization.id, 851);
  assert.equal(person.birthday, "1990-05-19T21:00:00.000Z");

  const draft = calls.find((call) => call[0] === "validateDraft")[1];
  assert.equal(draft.activateDateTime, "2026-08-28T21:00:00.000Z");
  assert.equal(draft.deactivateDateTime, "2026-08-29T20:59:00.000Z");
  assert.equal(draft.addField1, "БП - 10");
  assert.equal(draft.visitors[0].id, 113100);
  assert.equal(draft.meetingPerson.id, 7429);
  assert.equal(draft.sites[0].id, 8792);
  assert.equal(draft.accessGroups[0].id, 2166);
  assert.strictEqual(calls.find((call) => call[0] === "confirmDraft")[1], draft);
});

test("does not confirm a draft rejected by PassOffice validation", async () => {
  const { provider, calls } = setup({ validation: [{ ok: false, message: "Нужно заполнить обязательное поле", allowIgnore: false }] });
  await assert.rejects(() => provider.submit(input, { portalSession }), (error) => error.code === "PASSOFFICE_VALIDATION_FAILED" && error.status === 422);
  assert.equal(calls.some((call) => call[0] === "confirmDraft"), false);
});

test("marks a network failure during confirmation as an unknown outcome", async () => {
  const failure = new ApiError(504, "PASSOFFICE_TIMEOUT", "timeout");
  const { provider } = setup({ confirmError: failure });
  await assert.rejects(() => provider.submit(input, { portalSession }), (error) => error === failure && error.outcomeUnknown === true);
});

test("marks an incomplete confirmation response as an unknown outcome", async () => {
  const { provider } = setup({ confirmation: { id: 153500, state: 1 } });
  await assert.rejects(() => provider.submit(input, { portalSession }), (error) => error.code === "PASSOFFICE_RESULT_UNKNOWN" && error.outcomeUnknown === true);
});
