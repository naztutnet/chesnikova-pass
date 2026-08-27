export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(error) {
  return {
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error instanceof ApiError ? error.message : "Внутренняя ошибка сервера",
      ...(error instanceof ApiError && error.details ? { details: error.details } : {}),
    },
  };
}
