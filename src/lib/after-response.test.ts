import { afterEach, describe, expect, it, vi } from "vitest";
import { after } from "next/server";
import { runAfterResponse } from "./after-response";

vi.mock("next/server", () => ({ after: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(after).mockReset();
});

describe("post-response tasks", () => {
  it("runs successful tasks without logging a failure", async () => {
    const task = vi.fn(async () => undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runAfterResponse("password_change_notice", task);

    expect(task).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });

  it("contains failures and logs only bounded structured metadata", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("learner@example.com token=private"), {
      code: "P1001",
    });

    await expect(runAfterResponse("email_verification_delivery", async () => {
      throw error;
    })).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledOnce();
    const entry = JSON.parse(log.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(entry).toEqual({
      level: "error",
      event: "after_response_task_failed",
      task: "email_verification_delivery",
      errorType: "Error",
      errorCode: "P1001",
    });
    expect(JSON.stringify(entry)).not.toContain("learner@example.com");
    expect(JSON.stringify(entry)).not.toContain("private");
  });

  it("registers the same monitored task with the production lifecycle", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const task = vi.fn(async () => undefined);
    let scheduledTask: (() => Promise<void>) | undefined;
    vi.mocked(after).mockImplementation((callback) => {
      scheduledTask = callback as () => Promise<void>;
    });

    await runAfterResponse("session_revocation_notice", task);

    expect(after).toHaveBeenCalledOnce();
    expect(task).not.toHaveBeenCalled();
    expect(scheduledTask).toBeTypeOf("function");
    await scheduledTask!();
    expect(task).toHaveBeenCalledOnce();
  });
});
