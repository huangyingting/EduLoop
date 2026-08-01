import { errorLogMetadata, safeLogToken } from "@/lib/logging";
import { applicationRelease } from "@/lib/release";

export async function register() {
  console.info(JSON.stringify({
    level: "info",
    event: "application_started",
    runtime: process.env.NEXT_RUNTIME || "nodejs",
    version: applicationRelease() ?? "unavailable",
  }));
}

export async function onRequestError(
  error: { digest?: string } & Error,
  request: { path: string; method: string; headers: Record<string, string> },
  context: { routeType: string; routePath: string; renderSource: string },
) {
  console.error(JSON.stringify({
    level: "error",
    event: "request_error",
    ...errorLogMetadata(error),
    digest: safeLogToken(error.digest),
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
    renderSource: context.renderSource,
  }));
}
