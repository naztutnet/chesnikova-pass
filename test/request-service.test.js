import test from "node:test";
import assert from "node:assert/strict";
import { RequestService } from "../server/service/requests.js";
import { createPayloadCipher } from "../server/storage/crypto.js";
import { RequestStore } from "../server/storage/requests.js";

const input = {
  visitDate: "2026-08-27",
  room: "БП — 10",
  organization: null,
  visitors: [{ lastName: "Воронова", firstName: "Елена", middleName: "Сергеевна", birthDate: null, isForeignCitizen: false }],
};

function setup() {
  let calls = 0;
  const provider = { name: "test", async submit(_input, { requestId }) { calls += 1; return { externalId: `EXT-${requestId}`, externalStatus: "ACCEPTED" }; } };
  const store = new RequestStore({ path: ":memory:", cipher: createPayloadCipher(Buffer.alloc(32, 1)) });
  return { service: new RequestService({ store, provider }), store, calls: () => calls };
}

test("replays the same idempotent result without a second provider call", async () => {
  const { service, store, calls } = setup();
  const first = await service.create({ userId: "42", idempotencyKey: "intent-1", input });
  const second = await service.create({ userId: "42", idempotencyKey: "intent-1", input });
  assert.equal(first.request.id, second.request.id);
  assert.equal(second.replayed, true);
  assert.equal(calls(), 1);
  store.close();
});

test("rejects reuse of a key with a different payload", async () => {
  const { service, store } = setup();
  await service.create({ userId: "42", idempotencyKey: "intent-2", input });
  await assert.rejects(() => service.create({ userId: "42", idempotencyKey: "intent-2", input: { ...input, room: "Павильон 4" } }), (error) => error.code === "IDEMPOTENCY_KEY_REUSED");
  store.close();
});
