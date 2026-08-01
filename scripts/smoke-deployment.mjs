import { pathToFileURL } from "node:url";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PRIVATE_QUESTION_KEYS = new Set([
  "answer",
  "correctAnswer",
  "correctLabels",
  "explanation",
  "quality",
  "sourceFile",
]);

function assertSmoke(condition, message) {
  if (!condition) throw new Error(`Deployment smoke failed: ${message}`);
}

export function deploymentOrigin(value) {
  assertSmoke(typeof value === "string" && value.trim().length > 0, "provide a deployment origin.");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Deployment smoke failed: deployment origin is not a valid URL.");
  }
  assertSmoke(!url.username && !url.password, "deployment origin must not contain credentials.");
  assertSmoke(url.pathname === "/" && !url.search && !url.hash, "deployment origin must not contain a path, query, or fragment.");
  const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  assertSmoke(url.protocol === "https:" || loopbackHttp, "deployment origin must use HTTPS (HTTP is allowed only for loopback testing).");
  return url.origin;
}

function assertApiTracing(response, label) {
  const requestId = response.headers.get("x-request-id")?.trim() ?? "";
  assertSmoke(REQUEST_ID_PATTERN.test(requestId), `${label} is missing a valid X-Request-Id header.`);
  assertSmoke(response.headers.get("server-timing")?.includes("app;dur=") === true, `${label} is missing application Server-Timing.`);
}

async function jsonResponse(response, label, expectedStatus = 200) {
  assertSmoke(response.status === expectedStatus, `${label} returned HTTP ${response.status}, expected ${expectedStatus}.`);
  assertApiTracing(response, label);
  assertSmoke(response.headers.get("content-type")?.includes("application/json") === true, `${label} did not return JSON.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`Deployment smoke failed: ${label} returned invalid JSON.`);
  }
}

function assertNoPrivateQuestionKeys(value, path = "question") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPrivateQuestionKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    assertSmoke(!PRIVATE_QUESTION_KEYS.has(key), `${path} leaked private field ${key}.`);
    assertNoPrivateQuestionKeys(entry, `${path}.${key}`);
  }
}

function requestOptions(timeoutMs, init = {}) {
  return {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    ...init,
  };
}

async function smokeFetch(fetcher, url, timeoutMs, label, init = {}) {
  try {
    return await fetcher(url, requestOptions(timeoutMs, init));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown network error";
    throw new Error(`Deployment smoke failed: ${label} request failed: ${message}.`, { cause: error });
  }
}

export async function runDeploymentSmoke(value, options = {}) {
  const origin = deploymentOrigin(value);
  const originUrl = new URL(origin);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  assertSmoke(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000, "timeout must be an integer from 1 through 60000 milliseconds.");

  const publicPage = await smokeFetch(fetcher, new URL("/practice", origin), timeoutMs, "public practice page");
  assertSmoke(publicPage.status === 200, `public practice page returned HTTP ${publicPage.status}, expected 200.`);
  const requiredHeaders = [
    ["content-security-policy", "default-src 'self'"],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["permissions-policy", "camera=()"],
    ["cross-origin-opener-policy", "same-origin"],
    ["cross-origin-resource-policy", "same-origin"],
  ];
  for (const [header, expected] of requiredHeaders) {
    assertSmoke(publicPage.headers.get(header)?.includes(expected) === true, `public practice page ${header} header is missing ${expected}.`);
  }
  if (originUrl.protocol === "https:") {
    assertSmoke(publicPage.headers.get("strict-transport-security")?.includes("max-age=") === true, "HTTPS public practice page is missing HSTS.");
  }
  await publicPage.body?.cancel();

  const liveResponse = await smokeFetch(fetcher, new URL("/api/live", origin), timeoutMs, "liveness endpoint");
  const live = await jsonResponse(liveResponse, "liveness endpoint");
  assertSmoke(live?.status === "alive", "liveness endpoint does not report a live process.");
  assertSmoke(typeof live.version === "string" && live.version.trim().length > 0, "liveness endpoint is missing a release version.");

  const healthResponse = await smokeFetch(fetcher, new URL("/api/health", origin), timeoutMs, "health endpoint");
  const health = await jsonResponse(healthResponse, "health endpoint");
  assertSmoke(health?.status === "ok" && health.database === "ready", "health endpoint is not database-ready.");
  assertSmoke(health.schema?.status === "ready", "health endpoint reports an outdated database schema.");
  assertSmoke(Number.isInteger(health.catalog?.subjects) && health.catalog.subjects > 0, "health endpoint reports an empty subject catalog.");
  assertSmoke(Number.isInteger(health.catalog?.questions) && health.catalog.questions > 0, "health endpoint reports an empty question catalog.");
  assertSmoke(typeof health.version === "string" && health.version.trim().length > 0, "health endpoint is missing a release version.");
  if (originUrl.protocol === "https:") {
    assertSmoke(health.version !== "development", "HTTPS deployment still identifies itself as development.");
  }
  assertSmoke(live.version === health.version, "liveness and readiness endpoints report different releases.");

  const catalogResponse = await smokeFetch(fetcher, new URL("/api/catalog", origin), timeoutMs, "catalog endpoint");
  const catalog = await jsonResponse(catalogResponse, "catalog endpoint");
  assertSmoke(catalogResponse.headers.get("cache-control")?.includes("public") === true, "catalog endpoint is not publicly cacheable.");
  assertSmoke(Array.isArray(catalog?.subjects) && catalog.subjects.length > 0, "catalog endpoint returned no subjects.");
  assertSmoke(Array.isArray(catalog?.gradeBands) && catalog.gradeBands.length > 0, "catalog endpoint returned no grade bands.");

  const questionResponse = await smokeFetch(fetcher, new URL("/api/questions/next", origin), timeoutMs, "question endpoint");
  const question = await jsonResponse(questionResponse, "question endpoint");
  assertSmoke(typeof question?.id === "string" && question.id.length >= 8, "question endpoint returned an invalid question ID.");
  assertSmoke(typeof question.stem === "string" && question.stem.trim().length > 0, "question endpoint returned an empty stem.");
  assertSmoke(Array.isArray(question.options), "question endpoint returned an invalid options list.");
  assertNoPrivateQuestionKeys(question);

  let response;
  if (question.options.length) {
    const label = question.options[0]?.label;
    assertSmoke(typeof label === "string" && label.length > 0 && label.length <= 10, "question endpoint returned an invalid option label.");
    response = [label];
  } else {
    response = "部署冒烟测试作答";
  }
  const attemptResponse = await smokeFetch(fetcher, new URL("/api/attempts", origin), timeoutMs, "guest grading endpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ questionId: question.id, response, secondsSpent: 0 }),
  });
  const attempt = await jsonResponse(attemptResponse, "guest grading endpoint");
  assertSmoke(attempt?.persisted === false, "guest grading unexpectedly persisted an attempt.");
  assertSmoke(attempt.attemptId === null && attempt.session === null, "guest grading returned a persistent identity or session.");
  assertSmoke(attempt.earnedXp === 0, "guest grading unexpectedly awarded persistent XP.");
  assertSmoke(typeof attempt.answer === "string" && attempt.answer.trim().length > 0, "guest grading did not return a reference answer.");

  return {
    origin,
    version: health.version,
    catalog: {
      subjects: health.catalog.subjects,
      questions: health.catalog.questions,
    },
    sampledQuestion: {
      type: typeof question.type === "string" ? question.type : "unknown",
      autoGradable: question.isAutoGradable === true,
    },
    checks: ["public-page-security", "process-liveness", "database-readiness", "catalog", "answer-isolation", "guest-grading"],
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const target = process.argv[2] ?? process.env.SMOKE_BASE_URL;
  try {
    const result = await runDeploymentSmoke(target);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment smoke failed with an unknown error.");
    process.exitCode = 1;
  }
}
