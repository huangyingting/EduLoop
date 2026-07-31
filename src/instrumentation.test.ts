import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "./instrumentation";

afterEach(() => vi.restoreAllMocks());

describe("request error instrumentation", () => {
  it("logs framework context without raw paths or exception messages", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("token=private-reset-token"), {
      digest: "render-digest-42",
    });

    await onRequestError(
      error,
      {
        path: "/reset-password?token=private-reset-token",
        method: "GET",
        headers: {},
      },
      {
        routeType: "render",
        routePath: "/reset-password",
        renderSource: "react-server-components",
      },
    );

    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(log.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(entry).toEqual({
      level: "error",
      event: "request_error",
      errorType: "Error",
      digest: "render-digest-42",
      method: "GET",
      routeType: "render",
      routePath: "/reset-password",
      renderSource: "react-server-components",
    });
    expect(JSON.stringify(entry)).not.toContain("private-reset-token");
  });
});
