import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete process.env.METRICS_TOKEN;
});

describe("metrics endpoint", () => {
  it("does not exist without a configured token", async () => {
    expect((await GET(new Request("http://localhost/api/metrics"))).status).toBe(404);
  });

  it("requires the exact bearer token", async () => {
    process.env.METRICS_TOKEN = "m".repeat(40);
    expect((await GET(new Request("http://localhost/api/metrics", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    const response = await GET(new Request("http://localhost/api/metrics", { headers: { authorization: `Bearer ${"m".repeat(40)}` } }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("eduloop_build_info");
  });
});
