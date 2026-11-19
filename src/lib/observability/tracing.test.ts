import { trace, type Span } from "@opentelemetry/api";
import { describe, expect, it, vi } from "vitest";
import { activeTraceId, tracingEnabled } from "./tracing";

describe("tracing", () => {
  it("turns on only with an OTLP endpoint and respects OTEL_SDK_DISABLED", () => {
    expect(tracingEnabled({})).toBe(false);
    expect(tracingEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example:4318" })).toBe(true);
    expect(tracingEnabled({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://otel.example/v1/traces" })).toBe(true);
    expect(tracingEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example", OTEL_SDK_DISABLED: "true" })).toBe(false);
  });

  it("reports the active trace ID only for a sampled, valid span context", () => {
    expect(activeTraceId()).toBeUndefined();
    const span = { spanContext: () => ({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7", traceFlags: 1 }) } as unknown as Span;
    const getActiveSpan = vi.spyOn(trace, "getActiveSpan").mockReturnValue(span);
    expect(activeTraceId()).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    getActiveSpan.mockReturnValue({ spanContext: () => ({ traceId: "0".repeat(32) }) } as unknown as Span);
    expect(activeTraceId()).toBeUndefined();
    getActiveSpan.mockRestore();
  });
});
