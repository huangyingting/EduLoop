import { beforeEach, describe, expect, it } from "vitest";
import { incrementCounter, recordRequestMetric, renderMetrics, resetMetrics, statusClass } from "./metrics";

describe("metrics registry", () => {
  beforeEach(() => resetMetrics());

  it("groups requests by route template, method, and status class with latency buckets", () => {
    recordRequestMetric("GET /api/questions/next", "GET", 200, 8);
    recordRequestMetric("GET /api/questions/next", "GET", 200, 120);
    recordRequestMetric("GET /api/questions/next", "GET", 503, 30);
    const text = renderMetrics("release-1");
    expect(text).toContain('eduloop_build_info{release="release-1"} 1');
    expect(text).toContain('eduloop_http_request_duration_ms_count{route="GET /api/questions/next",method="GET",status="2xx"} 2');
    expect(text).toContain('eduloop_http_request_duration_ms_bucket{route="GET /api/questions/next",method="GET",status="2xx",le="10"} 1');
    expect(text).toContain('eduloop_http_request_duration_ms_bucket{route="GET /api/questions/next",method="GET",status="2xx",le="250"} 2');
    expect(text).toContain('eduloop_http_request_duration_ms_count{route="GET /api/questions/next",method="GET",status="5xx"} 1');
    expect(statusClass(404)).toBe("4xx");
  });

  it("renders counters and escapes label values", () => {
    incrementCounter("eduloop_slow_queries_total");
    incrementCounter("eduloop_slow_queries_total");
    incrementCounter("eduloop_events_total", { kind: "a\"b" });
    const text = renderMetrics("r");
    expect(text).toContain("eduloop_slow_queries_total 2");
    expect(text).toContain('eduloop_events_total{kind="a\\"b"} 1');
  });
});
