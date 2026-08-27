import { ApiError } from "../errors.js";

export class PassOfficeOpenApiProvider {
  name = "passoffice-open-api";

  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async submit() {
    if (!this.baseUrl || !this.apiKey) {
      throw new ApiError(503, "PASSOFFICE_NOT_CONFIGURED", "Для PassOffice Open API нужны Integration Server и API-ключ");
    }
    throw new ApiError(501, "PASSOFFICE_CONTRACT_PENDING", "Нужно получить Swagger конкретной установки PassOffice перед включением реальных запросов");
  }
}
