import { randomUUID } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SAFE_RELEASE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_JSON_BYTES = 64 * 1024;

export type DeploymentCapacityProbePhase =
  | "configuration"
  | "preflight";

export type DeploymentCapacityProbeErrorCode =
  | "ECAPACITY_PROBE_CONFIGURATION"
  | "ECAPACITY_PROBE_CONFIRMATION"
  | "ECAPACITY_PROBE_EXPECTED_VERSION"
  | "ECAPACITY_PROBE_ORIGIN"
  | "ECAPACITY_PROBE_PREFLIGHT"
  | "ECAPACITY_PROBE_RELEASE_MISMATCH";

const ERROR_MESSAGES: Record<DeploymentCapacityProbeErrorCode, string> = {
  ECAPACITY_PROBE_CONFIGURATION: "Capacity probe settings are outside the bounded operating range.",
  ECAPACITY_PROBE_CONFIRMATION: "CAPACITY_PROBE_CONFIRM_RUN=1 is required before generating deployment traffic.",
  ECAPACITY_PROBE_EXPECTED_VERSION: "CAPACITY_PROBE_EXPECT_VERSION must identify the exact release under test.",
  ECAPACITY_PROBE_ORIGIN: "The capacity probe target must be an HTTPS origin without credentials, path, query, or fragment; HTTP is allowed only for loopback testing.",
  ECAPACITY_PROBE_PREFLIGHT: "The deployment is not ready for a capacity probe.",
  ECAPACITY_PROBE_RELEASE_MISMATCH: "The deployment does not report the expected release version.",
};

export class DeploymentCapacityProbeError extends Error {
  readonly code: DeploymentCapacityProbeErrorCode;
  readonly phase: DeploymentCapacityProbePhase;
  readonly status?: number;

  constructor(
    code: DeploymentCapacityProbeErrorCode,
    phase: DeploymentCapacityProbePhase,
    status?: number,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "DeploymentCapacityProbeError";
    this.code = code;
    this.phase = phase;
    this.status = Number.isInteger(status) && Number(status) >= 400 && Number(status) <= 599
      ? Number(status)
      : undefined;
  }
}

export function isDeploymentCapacityProbeError(
  error: unknown,
): error is DeploymentCapacityProbeError {
  try {
    return error instanceof DeploymentCapacityProbeError;
  } catch {
    return false;
  }
}

function deploymentOrigin(value: string | undefined) {
  let parsed: URL;
  try {
    parsed = new URL(value?.trim() ?? "");
  } catch {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_ORIGIN", "configuration");
  }
  const loopbackHttp = parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !loopbackHttp)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_ORIGIN", "configuration");
  }
  return parsed.origin;
}

function boundedInteger(
  value: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
) {
  const parsed = value === undefined ? defaultValue : Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_CONFIGURATION", "configuration");
  }
  return parsed;
}

function boundedRate(value: string | undefined) {
  if (value === undefined || !value.trim()) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_CONFIGURATION", "configuration");
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0.2) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_CONFIGURATION", "configuration");
  }
  return parsed;
}

export function deploymentCapacityProbeConfiguration({
  confirmation,
  concurrency,
  expectedVersion,
  intervalMs,
  journeys,
  maxErrorRate,
  maxP95Ms,
  origin,
  timeoutMs,
}: {
  confirmation?: string;
  concurrency?: string;
  expectedVersion?: string;
  intervalMs?: string;
  journeys?: string;
  maxErrorRate?: string;
  maxP95Ms?: string;
  origin?: string;
  timeoutMs?: string;
}) {
  if (confirmation?.trim() !== "1") {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_CONFIRMATION", "configuration");
  }
  const release = expectedVersion?.trim() ?? "";
  if (!SAFE_RELEASE.test(release)) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_EXPECTED_VERSION", "configuration");
  }
  return {
    origin: deploymentOrigin(origin),
    expectedVersion: release,
    journeys: boundedInteger(journeys, 30, 1, 300),
    intervalMs: boundedInteger(intervalMs, 2_000, 2_000, 60_000),
    concurrency: boundedInteger(concurrency, 2, 1, 8),
    timeoutMs: boundedInteger(timeoutMs, 10_000, 100, 60_000),
    maxP95Ms: boundedInteger(maxP95Ms, Number.NaN, 1, 60_000),
    maxErrorRate: boundedRate(maxErrorRate),
  };
}

async function jsonObject(response: Response) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return null;
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_JSON_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function boundedFetch(
  fetcher: typeof fetch,
  url: URL,
  timeoutMs: number,
  init: RequestInit = {},
) {
  try {
    return await fetcher(url, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
    });
  } catch {
    return null;
  }
}

async function verifyPreflight({
  expectedVersion,
  fetcher,
  origin,
  timeoutMs,
}: {
  expectedVersion: string;
  fetcher: typeof fetch;
  origin: string;
  timeoutMs: number;
}) {
  const response = await boundedFetch(
    fetcher,
    new URL("/api/health", origin),
    timeoutMs,
    { headers: { Accept: "application/json" } },
  );
  if (!response?.ok) {
    throw new DeploymentCapacityProbeError(
      "ECAPACITY_PROBE_PREFLIGHT",
      "preflight",
      response?.status,
    );
  }
  const health = await jsonObject(response);
  if (
    health?.status !== "ok"
    || health.database !== "ready"
    || !health.schema
    || typeof health.schema !== "object"
    || Array.isArray(health.schema)
    || (health.schema as Record<string, unknown>).status !== "ready"
  ) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_PREFLIGHT", "preflight");
  }
  if (health.version !== expectedVersion) {
    throw new DeploymentCapacityProbeError("ECAPACITY_PROBE_RELEASE_MISMATCH", "preflight");
  }
}

type JourneyFailureKind =
  | "grading_contract"
  | "grading_request"
  | "question_contract"
  | "question_request"
  | "worker_internal"
  | "worker_saturation";

type JourneyOutcome = {
  ok: boolean;
  durationMs: number | null;
  failure?: {
    kind: JourneyFailureKind;
    status?: number;
  };
};

function duration(startedAt: number, finishedAt: number) {
  const elapsed = finishedAt - startedAt;
  return Number(Math.max(0, Number.isFinite(elapsed) ? elapsed : 0).toFixed(1));
}

function failedJourney(
  kind: JourneyFailureKind,
  startedAt: number,
  monotonicNow: () => number,
  status?: number,
): JourneyOutcome {
  return {
    ok: false,
    durationMs: duration(startedAt, monotonicNow()),
    failure: {
      kind,
      ...(Number.isInteger(status) ? { status } : {}),
    },
  };
}

export async function runGuestPracticeCapacityJourney({
  fetcher = fetch,
  monotonicNow = () => performance.now(),
  origin,
  timeoutMs,
}: {
  fetcher?: typeof fetch;
  monotonicNow?: () => number;
  origin: string;
  timeoutMs: number;
}): Promise<JourneyOutcome> {
  const startedAt = monotonicNow();
  const questionResponse = await boundedFetch(
    fetcher,
    new URL("/api/questions/next", origin),
    timeoutMs,
    { headers: { Accept: "application/json" } },
  );
  if (!questionResponse?.ok) {
    return failedJourney(
      "question_request",
      startedAt,
      monotonicNow,
      questionResponse?.status,
    );
  }
  const question = await jsonObject(questionResponse);
  const questionId = question?.id;
  const options = question?.options;
  if (
    typeof questionId !== "string"
    || questionId.length < 8
    || questionId.length > 256
    || !Array.isArray(options)
    || options.length > 20
  ) {
    return failedJourney("question_contract", startedAt, monotonicNow);
  }

  let response: string | string[] = "capacity probe self-assessment";
  if (options.length) {
    const first = options[0];
    if (!first || typeof first !== "object" || Array.isArray(first)) {
      return failedJourney("question_contract", startedAt, monotonicNow);
    }
    const label = (first as Record<string, unknown>).label;
    if (typeof label !== "string" || !label || label.length > 10) {
      return failedJourney("question_contract", startedAt, monotonicNow);
    }
    response = [label];
  }

  const gradingResponse = await boundedFetch(
    fetcher,
    new URL("/api/attempts", origin),
    timeoutMs,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ questionId, response, secondsSpent: 0 }),
    },
  );
  if (!gradingResponse?.ok) {
    return failedJourney(
      "grading_request",
      startedAt,
      monotonicNow,
      gradingResponse?.status,
    );
  }
  const grading = await jsonObject(gradingResponse);
  if (
    grading?.persisted !== false
    || grading.attemptId !== null
    || grading.session !== null
    || grading.earnedXp !== 0
    || typeof grading.answer !== "string"
    || !grading.answer.trim()
  ) {
    return failedJourney("grading_contract", startedAt, monotonicNow);
  }
  return {
    ok: true,
    durationMs: duration(startedAt, monotonicNow()),
  };
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}

function emptyFailureCounts(): Record<JourneyFailureKind, number> {
  return {
    grading_contract: 0,
    grading_request: 0,
    question_contract: 0,
    question_request: 0,
    worker_internal: 0,
    worker_saturation: 0,
  };
}

function summarizeOutcomes(
  outcomes: JourneyOutcome[],
  maxErrorRate: number,
  maxP95Ms: number,
) {
  const successfulLatency = outcomes.flatMap((outcome) => (
    outcome.ok && outcome.durationMs !== null ? [outcome.durationMs] : []
  ));
  const failureCounts = emptyFailureCounts();
  const httpStatusCounts: Record<string, number> = {};
  for (const outcome of outcomes) {
    if (!outcome.failure) continue;
    failureCounts[outcome.failure.kind] += 1;
    if (outcome.failure.status !== undefined) {
      const status = String(outcome.failure.status);
      httpStatusCounts[status] = (httpStatusCounts[status] ?? 0) + 1;
    }
  }
  const successful = successfulLatency.length;
  const failed = outcomes.length - successful;
  const errorRate = Number((failed / outcomes.length).toFixed(4));
  const p95 = percentile(successfulLatency, 0.95);
  const failedThresholds = [
    ...(failureCounts.worker_saturation ? ["worker-saturation"] : []),
    ...(successful ? [] : ["no-successful-journeys"]),
    ...(errorRate > maxErrorRate ? ["error-rate"] : []),
    ...(p95 !== null && p95 > maxP95Ms ? ["p95-latency"] : []),
  ];
  return {
    passed: failedThresholds.length === 0,
    failedThresholds,
    successful,
    failed,
    errorRate,
    latencyMs: {
      p50: percentile(successfulLatency, 0.5),
      p95,
      p99: percentile(successfulLatency, 0.99),
      max: successfulLatency.length ? Math.max(...successfulLatency) : null,
    },
    failureCounts,
    httpStatusCounts,
  };
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function runDeploymentCapacityProbe({
  confirmation,
  concurrency,
  expectedVersion,
  fetcher = fetch,
  intervalMs,
  journeys,
  maxErrorRate,
  maxP95Ms,
  monotonicNow = () => performance.now(),
  origin,
  probeIdFactory = randomUUID,
  timeoutMs,
  wait = defaultWait,
}: {
  confirmation?: string;
  concurrency?: string;
  expectedVersion?: string;
  fetcher?: typeof fetch;
  intervalMs?: string;
  journeys?: string;
  maxErrorRate?: string;
  maxP95Ms?: string;
  monotonicNow?: () => number;
  origin?: string;
  probeIdFactory?: () => string;
  timeoutMs?: string;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  const configuration = deploymentCapacityProbeConfiguration({
    confirmation,
    concurrency,
    expectedVersion,
    intervalMs,
    journeys,
    maxErrorRate,
    maxP95Ms,
    origin,
    timeoutMs,
  });
  await verifyPreflight({ ...configuration, fetcher });

  const probeId = probeIdFactory();
  const startedAt = monotonicNow();
  const active = new Set<Promise<void>>();
  const outcomes: JourneyOutcome[] = [];
  for (let index = 0; index < configuration.journeys; index += 1) {
    if (index) {
      const dueAt = startedAt + index * configuration.intervalMs;
      await wait(Math.max(0, dueAt - monotonicNow()));
    }
    if (active.size >= configuration.concurrency) {
      outcomes.push({
        ok: false,
        durationMs: null,
        failure: { kind: "worker_saturation" },
      });
      continue;
    }
    const task = runGuestPracticeCapacityJourney({
      fetcher,
      monotonicNow,
      origin: configuration.origin,
      timeoutMs: configuration.timeoutMs,
    })
      .then((outcome) => {
        outcomes.push(outcome);
      })
      .catch(() => {
        outcomes.push({
          ok: false,
          durationMs: null,
          failure: { kind: "worker_internal" },
        });
      })
      .finally(() => {
        active.delete(task);
      });
    active.add(task);
  }
  await Promise.all([...active]);
  const summary = summarizeOutcomes(
    outcomes,
    configuration.maxErrorRate,
    configuration.maxP95Ms,
  );
  return {
    probeId,
    release: configuration.expectedVersion,
    workload: "guest-practice",
    configuration: {
      journeys: configuration.journeys,
      intervalMs: configuration.intervalMs,
      journeysPerMinute: Number((60_000 / configuration.intervalMs).toFixed(2)),
      concurrency: configuration.concurrency,
      timeoutMs: configuration.timeoutMs,
      thresholds: {
        maxP95Ms: configuration.maxP95Ms,
        maxErrorRate: configuration.maxErrorRate,
        droppedJourneys: 0,
      },
    },
    results: {
      scheduled: outcomes.length,
      durationMs: duration(startedAt, monotonicNow()),
      ...summary,
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
  };
}
