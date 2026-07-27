export async function register() {
  console.info(JSON.stringify({
    level: "info",
    event: "application_started",
    runtime: process.env.NEXT_RUNTIME || "nodejs",
    version: process.env.APP_VERSION || process.env.npm_package_version || "development",
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
    message: error.message,
    digest: error.digest,
    method: request.method,
    path: request.path,
    routeType: context.routeType,
    routePath: context.routePath,
    renderSource: context.renderSource,
  }));
}
