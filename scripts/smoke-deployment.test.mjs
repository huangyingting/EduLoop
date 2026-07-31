import assert from "node:assert/strict";
import test from "node:test";
import { deploymentOrigin, runDeploymentSmoke } from "./smoke-deployment.mjs";

const securityHeaders = {
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

const apiHeaders = {
  "x-request-id": "deployment-smoke-1",
  "server-timing": "app;dur=4.2",
};

function json(value, init = {}) {
  return Response.json(value, {
    ...init,
    headers: { ...apiHeaders, ...init.headers },
  });
}

function healthyFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.pathname === "/practice") {
      return new Response("<!doctype html><title>EduLoop</title>", { headers: securityHeaders });
    }
    if (url.pathname === "/api/health") {
      return overrides.health ?? json({
        status: "ok",
        database: "ready",
        schema: { status: "ready" },
        catalog: { subjects: 5, questions: 16_537 },
        version: "release-2026.07.31",
      });
    }
    if (url.pathname === "/api/catalog") {
      return json({ subjects: [{ slug: "math" }], gradeBands: [{ slug: "middle" }] }, {
        headers: { "cache-control": "public, max-age=60" },
      });
    }
    if (url.pathname === "/api/questions/next") {
      return json(overrides.question ?? {
        id: "question-123",
        stem: "1 + 1 = ?",
        type: "SINGLE_CHOICE",
        isAutoGradable: true,
        options: [{ label: "A", content: "2" }],
      });
    }
    if (url.pathname === "/api/attempts") {
      const submitted = JSON.parse(init.body);
      assert.deepEqual(submitted, { questionId: "question-123", response: ["A"], secondsSpent: 0 });
      assert.equal(init.headers.Origin, "https://learn.example");
      return overrides.attempt ?? json({
        attemptId: null,
        persisted: false,
        session: null,
        earnedXp: 0,
        answer: "A",
      });
    }
    throw new Error(`Unexpected smoke request ${url.pathname}`);
  };
  return { calls, fetcher };
}

test("accepts only origin-only HTTPS URLs or loopback HTTP", () => {
  assert.equal(deploymentOrigin("https://learn.example/"), "https://learn.example");
  assert.equal(deploymentOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.throws(() => deploymentOrigin("http://learn.example"), /must use HTTPS/);
  assert.throws(() => deploymentOrigin("https://learn.example/app"), /must not contain a path/);
  assert.throws(() => deploymentOrigin("https://user:secret@learn.example"), /must not contain credentials/);
});

test("verifies security, readiness, answer isolation, and stateless guest grading", async () => {
  const { calls, fetcher } = healthyFetcher();
  const result = await runDeploymentSmoke("https://learn.example", { fetcher, timeoutMs: 500 });
  assert.deepEqual(calls.map(({ url }) => url.pathname), [
    "/practice",
    "/api/health",
    "/api/catalog",
    "/api/questions/next",
    "/api/attempts",
  ]);
  assert.deepEqual(result, {
    origin: "https://learn.example",
    version: "release-2026.07.31",
    catalog: { subjects: 5, questions: 16_537 },
    sampledQuestion: { type: "SINGLE_CHOICE", autoGradable: true },
    checks: ["public-page-security", "database-readiness", "catalog", "answer-isolation", "guest-grading"],
  });
});

test("fails when the public question response leaks a grading key", async () => {
  const { fetcher } = healthyFetcher({
    question: {
      id: "question-123",
      stem: "1 + 1 = ?",
      type: "SINGLE_CHOICE",
      isAutoGradable: true,
      options: [{ label: "A", content: "2" }],
      correctAnswer: "A",
    },
  });
  await assert.rejects(
    runDeploymentSmoke("https://learn.example", { fetcher }),
    /leaked private field correctAnswer/,
  );
});

test("fails closed on an unavailable deployment or persistent guest attempt", async () => {
  const unavailable = healthyFetcher({
    health: json({ status: "unavailable" }, { status: 503 }),
  });
  await assert.rejects(
    runDeploymentSmoke("https://learn.example", { fetcher: unavailable.fetcher }),
    /health endpoint returned HTTP 503/,
  );

  const persistent = healthyFetcher({
    attempt: json({
      attemptId: "unexpected-attempt",
      persisted: true,
      session: null,
      earnedXp: 3,
      answer: "A",
    }),
  });
  await assert.rejects(
    runDeploymentSmoke("https://learn.example", { fetcher: persistent.fetcher }),
    /guest grading unexpectedly persisted an attempt/,
  );
});
