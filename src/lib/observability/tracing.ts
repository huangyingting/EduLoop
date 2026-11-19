import { trace } from "@opentelemetry/api";

// Tracing is on only when an OTLP endpoint is configured, so local runs and
// deployments without a collector pay nothing for it.
type TracingEnvironment = { OTEL_EXPORTER_OTLP_ENDPOINT?: string; OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string; OTEL_SDK_DISABLED?: string };

export function tracingEnabled(environment: TracingEnvironment = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
  OTEL_SDK_DISABLED: process.env.OTEL_SDK_DISABLED,
}) {
  if (environment.OTEL_SDK_DISABLED === "true") return false;
  return Boolean(environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || environment.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());
}

// The current trace ID, for joining logs and alerts to their trace.
export function activeTraceId() {
  const context = trace.getActiveSpan()?.spanContext();
  return context && /^[0-9a-f]{32}$/.test(context.traceId) && !/^0+$/.test(context.traceId) ? context.traceId : undefined;
}
