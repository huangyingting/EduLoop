import { describe, expect, it, vi } from "vitest";
import {
  DeploymentCapacityProbeError,
  deploymentCapacityProbeConfiguration,
  runDeploymentCapacityProbe,
} from "./deployment-capacity-probe";

const origin = "https://learn.example";

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("Expected capacity probe configuration to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(DeploymentCapacityProbeError);
    expect(error).toMatchObject({ code, phase: "configuration" });
  }
}

function healthyFetcher(version = "release-123") {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "ok",
        database: "ready",
        schema: { status: "ready" },
        version,
      });
    }
    if (url.pathname === "/api/questions/next") {
      return Response.json({
        id: "question-123",
        stem: "Private capacity question",
        options: [{ label: "A", text: "Private choice" }],
      });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      questionId: "question-123",
      response: ["A"],
      secondsSpent: 0,
    });
    expect(new Headers(init.headers).get("origin")).toBe(origin);
    return Response.json({
      persisted: false,
      attemptId: null,
      session: null,
      earnedXp: 0,
      answer: "Private reference answer",
    });
  });
  return { calls, fetcher };
}

const validConfiguration = {
  confirmation: "1",
  expectedVersion: "release-123",
  origin,
  maxP95Ms: "2000",
  maxErrorRate: "0.01",
};

describe("deployment capacity probe configuration", () => {
  it("requires explicit traffic confirmation before parsing the target", () => {
    expectCode(() => deploymentCapacityProbeConfiguration({
      origin: "https://user:secret@private.example",
      expectedVersion: "release-123",
      maxP95Ms: "2000",
      maxErrorRate: "0.01",
    }), "ECAPACITY_PROBE_CONFIRMATION");
  });

  it("accepts a bounded workload and explicit thresholds", () => {
    expect(deploymentCapacityProbeConfiguration({
      ...validConfiguration,
      journeys: "60",
      intervalMs: "3000",
      concurrency: "4",
      timeoutMs: "5000",
    })).toEqual({
      origin,
      expectedVersion: "release-123",
      journeys: 60,
      intervalMs: 3000,
      concurrency: 4,
      timeoutMs: 5000,
      maxP95Ms: 2000,
      maxErrorRate: 0.01,
    });
  });

  it("rejects unsafe origins, ambiguous releases, and rate-limit-hostile settings", () => {
    for (const target of [
      "http://learn.example",
      "https://user:secret@learn.example",
      "https://learn.example/practice",
    ]) {
      expectCode(() => deploymentCapacityProbeConfiguration({
        ...validConfiguration,
        origin: target,
      }), "ECAPACITY_PROBE_ORIGIN");
    }
    expectCode(() => deploymentCapacityProbeConfiguration({
      ...validConfiguration,
      expectedVersion: "private release value",
    }), "ECAPACITY_PROBE_EXPECTED_VERSION");
    for (const settings of [
      { intervalMs: "1999" },
      { journeys: "301" },
      { concurrency: "9" },
      { maxP95Ms: "" },
      { maxErrorRate: "" },
      { maxErrorRate: "0.21" },
    ]) {
      expectCode(() => deploymentCapacityProbeConfiguration({
        ...validConfiguration,
        ...settings,
      }), "ECAPACITY_PROBE_CONFIGURATION");
    }
  });
});

describe("deployed guest-practice capacity probe", () => {
  it("checks the exact release and measures a non-persistent guest journey", async () => {
    const { calls, fetcher } = healthyFetcher();
    let tick = 0;
    await expect(runDeploymentCapacityProbe({
      ...validConfiguration,
      journeys: "1",
      fetcher,
      monotonicNow: () => tick += 10,
      probeIdFactory: () => "probe-123",
    })).resolves.toEqual({
      probeId: "probe-123",
      release: "release-123",
      workload: "guest-practice",
      configuration: {
        journeys: 1,
        intervalMs: 2000,
        journeysPerMinute: 30,
        concurrency: 2,
        timeoutMs: 10000,
        thresholds: {
          maxP95Ms: 2000,
          maxErrorRate: 0.01,
          droppedJourneys: 0,
        },
      },
      results: {
        scheduled: 1,
        durationMs: 30,
        passed: true,
        failedThresholds: [],
        successful: 1,
        failed: 0,
        errorRate: 0,
        latencyMs: { p50: 10, p95: 10, p99: 10, max: 10 },
        failureCounts: {
          grading_contract: 0,
          grading_request: 0,
          question_contract: 0,
          question_request: 0,
          worker_internal: 0,
          worker_saturation: 0,
        },
        httpStatusCounts: {},
      },
      checks: [
        "release-preflight",
        "question-selection",
        "guest-grading",
        "no-persistence",
        "error-rate",
        "p95-latency",
        "worker-saturation",
      ],
    });
    expect(calls.map(({ url }) => url.pathname)).toEqual([
      "/api/health",
      "/api/questions/next",
      "/api/attempts",
    ]);
  });

  it("fails closed before load when the deployment reports another release", async () => {
    const { calls, fetcher } = healthyFetcher("private-wrong-release");
    let error: unknown;
    try {
      await runDeploymentCapacityProbe({
        ...validConfiguration,
        journeys: "1",
        fetcher,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "ECAPACITY_PROBE_RELEASE_MISMATCH",
      phase: "preflight",
    });
    expect(String(error)).not.toContain("private-wrong-release");
    expect(calls).toHaveLength(1);
  });

  it("returns aggregate threshold failures without response contents", async () => {
    const privateBody = "private database failure".repeat(4_000);
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/api/health") {
        return Response.json({
          status: "ok",
          database: "ready",
          schema: { status: "ready" },
          version: "release-123",
        });
      }
      return new Response(privateBody, {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    });
    const result = await runDeploymentCapacityProbe({
      ...validConfiguration,
      maxErrorRate: "0",
      journeys: "1",
      fetcher,
      probeIdFactory: () => "probe-failed",
    });
    expect(result.results).toMatchObject({
      passed: false,
      failedThresholds: ["no-successful-journeys", "error-rate"],
      successful: 0,
      failed: 1,
      errorRate: 1,
      failureCounts: { question_request: 1 },
      httpStatusCounts: { "503": 1 },
    });
    expect(JSON.stringify(result)).not.toContain("private database failure");
  });

  it("enforces the declared p95 journey threshold", async () => {
    const { fetcher } = healthyFetcher();
    let tick = 0;
    const result = await runDeploymentCapacityProbe({
      ...validConfiguration,
      maxP95Ms: "4",
      journeys: "1",
      fetcher,
      monotonicNow: () => tick += 5,
      probeIdFactory: () => "probe-slow",
    });
    expect(result.results).toMatchObject({
      passed: false,
      failedThresholds: ["p95-latency"],
      latencyMs: { p95: 5 },
    });
  });

  it("fails when the load worker cannot start the scheduled arrival", async () => {
    const healthy = healthyFetcher();
    let releaseQuestion: (() => void) | undefined;
    const blockedQuestion = new Promise<Response>((resolve) => {
      releaseQuestion = () => resolve(Response.json({
        id: "question-123",
        stem: "Private capacity question",
        options: [{ label: "A", text: "Private choice" }],
      }));
    });
    let questionBlocked = false;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === "/api/questions/next" && !questionBlocked) {
        questionBlocked = true;
        return blockedQuestion;
      }
      return healthy.fetcher(input, init);
    });
    const result = await runDeploymentCapacityProbe({
      ...validConfiguration,
      journeys: "2",
      concurrency: "1",
      fetcher,
      probeIdFactory: () => "probe-saturated",
      wait: async () => {
        setTimeout(() => releaseQuestion?.(), 0);
      },
    });
    expect(result.results).toMatchObject({
      passed: false,
      failedThresholds: ["worker-saturation", "error-rate"],
      successful: 1,
      failed: 1,
      errorRate: 0.5,
      failureCounts: { worker_saturation: 1 },
    });
  });
});
