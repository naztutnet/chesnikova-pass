import { ApiError } from "../errors.js";
import { hashRequest, REQUEST_STATUSES, validateCreateRequest, validateProviderResult } from "../domain/request.js";

export class RequestService {
  constructor({ store, provider }) {
    this.store = store;
    this.provider = provider;
  }

  async create({ userId, portalSession = null, idempotencyKey, input }) {
    if (!idempotencyKey || idempotencyKey.length > 160) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Передайте корректный Idempotency-Key");
    const request = validateCreateRequest(input);
    const requestHash = hashRequest(request);
    const claim = this.store.claim({ userId, idempotencyKey, requestHash, payload: request });
    if (claim.kind === "MISMATCH") throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "Этот Idempotency-Key уже использован с другими данными");
    if (claim.kind === "IN_PROGRESS") throw new ApiError(409, "REQUEST_IN_PROGRESS", "Заявка с этим ключом уже создаётся", { requestId: claim.request.id });
    if (claim.kind === "REPLAY") return { request: claim.request, replayed: true };

    try {
      const providerResult = validateProviderResult(await this.provider.submit(request, { requestId: claim.request.id, userId, portalSession }));
      const completed = this.store.complete(claim.request.id, userId, { status: REQUEST_STATUSES.VERIFIED, ...providerResult });
      return { request: completed, replayed: false };
    } catch (error) {
      const status = error?.outcomeUnknown === true ? REQUEST_STATUSES.UNKNOWN : REQUEST_STATUSES.REJECTED;
      this.store.complete(claim.request.id, userId, { status });
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, status === REQUEST_STATUSES.UNKNOWN ? "PASSOFFICE_RESULT_UNKNOWN" : "PASSOFFICE_REJECTED", status === REQUEST_STATUSES.UNKNOWN ? "Результат операции в PassOffice неизвестен" : "PassOffice отклонил заявку");
    }
  }

  get({ userId, requestId }) {
    const request = this.store.getByIdForUser(requestId, userId);
    if (!request) throw new ApiError(404, "REQUEST_NOT_FOUND", "Заявка не найдена");
    return request;
  }

  list({ userId, page = 1, pageSize = 20, status = null }) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ApiError(400, "INVALID_PAGINATION", "Некорректные параметры страницы");
    }
    return this.store.listByUser(userId, { page, pageSize, status });
  }
}
