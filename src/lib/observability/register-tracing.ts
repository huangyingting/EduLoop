import { PrismaInstrumentation } from "@prisma/instrumentation";
import { registerOTel } from "@vercel/otel";
import { applicationRelease } from "@/lib/release";

// Next.js already emits spans for routes and rendering; this adds outgoing
// fetch spans and one span per Prisma query, exported over OTLP using the
// standard OTEL_EXPORTER_OTLP_* variables.
export function registerTracing() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME?.trim() || "eduloop",
    attributes: { "service.version": applicationRelease() ?? "unavailable" },
    instrumentations: ["fetch", new PrismaInstrumentation()],
  });
}
