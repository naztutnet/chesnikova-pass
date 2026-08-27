export class DemoPassOfficeProvider {
  name = "demo";

  async submit(_request, { requestId }) {
    return { externalId: `DEMO-${requestId.slice(0, 8).toUpperCase()}`, externalStatus: "DEMO_VERIFIED" };
  }
}
