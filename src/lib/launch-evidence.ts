import { open } from "node:fs/promises";
import { z } from "zod";
import { PRIVACY_VERSION, TERMS_VERSION } from "./legal";
import {
  isSocialProviderId,
  SOCIAL_PROVIDER_IDS,
  type SocialProviderId,
} from "./social-providers";

const SAFE_RELEASE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PRIVATE_REFERENCE = /^[^\u0000-\u001f\u007f]+$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const MAX_LAUNCH_EVIDENCE_BYTES = 64 * 1024;

export const LAUNCH_EVIDENCE_GATE_IDS = [
  "legal-review",
  "production-deployment",
  "postgresql-migration",
  "live-deployment-smoke",
  "email-delivery",
  "email-account-journeys",
  "oauth-provider-journeys",
  "monitoring-alerts",
  "cleanup-scheduler",
  "backup-restore",
  "ingress-controls",
  "distributed-capacity",
  "rollback-readiness",
  "desktop-mobile-review",
] as const;

export type LaunchEvidenceGateId = typeof LAUNCH_EVIDENCE_GATE_IDS[number];

export const LAUNCH_EVIDENCE_MAX_AGE_HOURS: Record<LaunchEvidenceGateId, number> = {
  "legal-review": 24 * 365,
  "production-deployment": 24,
  "postgresql-migration": 24,
  "live-deployment-smoke": 24,
  "email-delivery": 24,
  "email-account-journeys": 24,
  "oauth-provider-journeys": 24,
  "monitoring-alerts": 24 * 7,
  "cleanup-scheduler": 2,
  "backup-restore": 24 * 90,
  "ingress-controls": 24 * 7,
  "distributed-capacity": 24 * 7,
  "rollback-readiness": 24 * 7,
  "desktop-mobile-review": 24 * 7,
};

const GATE_IDS = new Set<string>(LAUNCH_EVIDENCE_GATE_IDS);
const SINGLETON_GATE_IDS = LAUNCH_EVIDENCE_GATE_IDS.filter(
  (gate) => gate !== "oauth-provider-journeys",
);

export type LaunchEvidencePhase =
  | "configuration"
  | "read"
  | "manifest"
  | "gate";

export type LaunchEvidenceErrorCode =
  | "ELAUNCH_CONFIRMATION"
  | "ELAUNCH_EXPECTED_ORIGIN"
  | "ELAUNCH_EXPECTED_PROVIDERS"
  | "ELAUNCH_EXPECTED_RELEASE"
  | "ELAUNCH_FILE_READ"
  | "ELAUNCH_FILE_REQUIRED"
  | "ELAUNCH_FILE_SIZE"
  | "ELAUNCH_GATE_DUPLICATE"
  | "ELAUNCH_GATE_EXPIRED"
  | "ELAUNCH_GATE_FUTURE"
  | "ELAUNCH_GATE_MISSING"
  | "ELAUNCH_GATE_SCOPE"
  | "ELAUNCH_GATE_STALE"
  | "ELAUNCH_GATE_STATUS"
  | "ELAUNCH_GATE_TIMESTAMP"
  | "ELAUNCH_GATE_UNKNOWN"
  | "ELAUNCH_MANIFEST_JSON"
  | "ELAUNCH_MANIFEST_LEGAL"
  | "ELAUNCH_MANIFEST_ORIGIN"
  | "ELAUNCH_MANIFEST_PROVIDERS"
  | "ELAUNCH_MANIFEST_RELEASE"
  | "ELAUNCH_MANIFEST_SCHEMA";

const ERROR_MESSAGES: Record<LaunchEvidenceErrorCode, string> = {
  ELAUNCH_CONFIRMATION: "LAUNCH_EVIDENCE_CONFIRM_REVIEW=1 is required after reviewing the private evidence manifest.",
  ELAUNCH_EXPECTED_ORIGIN: "LAUNCH_EXPECT_ORIGIN must be the exact production HTTPS origin without credentials, path, query, or fragment.",
  ELAUNCH_EXPECTED_PROVIDERS: "LAUNCH_EXPECT_OAUTH_PROVIDERS must be 'none' or a unique comma-separated list of supported provider IDs.",
  ELAUNCH_EXPECTED_RELEASE: "LAUNCH_EXPECT_VERSION must identify the exact release being approved.",
  ELAUNCH_FILE_READ: "The private launch-evidence manifest could not be read.",
  ELAUNCH_FILE_REQUIRED: "Pass the private launch-evidence manifest path to npm run launch:verify.",
  ELAUNCH_FILE_SIZE: "The launch-evidence manifest exceeds the 64 KiB limit.",
  ELAUNCH_GATE_DUPLICATE: "The launch-evidence manifest contains duplicate gate evidence.",
  ELAUNCH_GATE_EXPIRED: "A launch gate's declared evidence expiry has passed.",
  ELAUNCH_GATE_FUTURE: "A launch gate has a verification time in the future.",
  ELAUNCH_GATE_MISSING: "Required launch-gate evidence is missing.",
  ELAUNCH_GATE_SCOPE: "A launch gate is not scoped to exactly one expected target.",
  ELAUNCH_GATE_STALE: "Launch-gate evidence is older than its maximum permitted age.",
  ELAUNCH_GATE_STATUS: "Every required launch gate must have status PASS.",
  ELAUNCH_GATE_TIMESTAMP: "A launch gate must have canonical, ordered UTC verification and expiry timestamps.",
  ELAUNCH_GATE_UNKNOWN: "The launch-evidence manifest contains an unknown gate.",
  ELAUNCH_MANIFEST_JSON: "The launch-evidence manifest is not valid JSON.",
  ELAUNCH_MANIFEST_LEGAL: "The launch-evidence manifest does not cover the active legal versions.",
  ELAUNCH_MANIFEST_ORIGIN: "The launch-evidence manifest targets a different or invalid production origin.",
  ELAUNCH_MANIFEST_PROVIDERS: "The launch-evidence manifest does not cover exactly the enabled OAuth providers.",
  ELAUNCH_MANIFEST_RELEASE: "The launch-evidence manifest targets a different or invalid release.",
  ELAUNCH_MANIFEST_SCHEMA: "The launch-evidence manifest does not match the strict versioned schema.",
};

export class LaunchEvidenceError extends Error {
  readonly code: LaunchEvidenceErrorCode;
  readonly phase: LaunchEvidencePhase;
  readonly gate?: LaunchEvidenceGateId;
  readonly provider?: SocialProviderId;

  constructor(
    code: LaunchEvidenceErrorCode,
    phase: LaunchEvidencePhase,
    gate?: LaunchEvidenceGateId,
    provider?: SocialProviderId,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "LaunchEvidenceError";
    this.code = code;
    this.phase = phase;
    this.gate = gate;
    this.provider = provider;
  }
}

export function isLaunchEvidenceError(error: unknown): error is LaunchEvidenceError {
  try {
    return error instanceof LaunchEvidenceError;
  } catch {
    return false;
  }
}

const privateReference = z.string()
  .trim()
  .min(1)
  .max(512)
  .regex(PRIVATE_REFERENCE)
  .refine((value) => !value.startsWith("REPLACE_"));

const evidenceGateSchema = z.object({
  gate: z.string().min(1).max(64),
  provider: z.string().min(1).max(64).optional(),
  status: z.string().min(1).max(16),
  verifiedAt: z.string().min(1).max(64),
  expiresAt: z.string().min(1).max(64),
  evidenceRef: privateReference,
  operatorRef: privateReference,
}).strict();

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  release: z.string().min(1).max(128),
  origin: z.string().min(1).max(2048),
  legal: z.object({
    termsVersion: z.string().min(1).max(128),
    privacyVersion: z.string().min(1).max(128),
  }).strict(),
  oauthProviders: z.array(z.string().min(1).max(64)).max(SOCIAL_PROVIDER_IDS.length),
  gates: z.array(evidenceGateSchema).min(1).max(32),
}).strict();

type LaunchEvidenceConfiguration = {
  expectedRelease: string;
  expectedOrigin: string;
  expectedProviders: SocialProviderId[];
};

function productionOrigin(value: string | undefined, code: LaunchEvidenceErrorCode) {
  let parsed: URL;
  try {
    parsed = new URL(value?.trim() ?? "");
  } catch {
    throw new LaunchEvidenceError(code, code === "ELAUNCH_EXPECTED_ORIGIN" ? "configuration" : "manifest");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new LaunchEvidenceError(code, code === "ELAUNCH_EXPECTED_ORIGIN" ? "configuration" : "manifest");
  }
  return parsed.origin;
}

function orderedProviders(values: readonly string[]) {
  const providers = new Set<SocialProviderId>();
  for (const value of values) {
    if (!isSocialProviderId(value) || providers.has(value)) return null;
    providers.add(value);
  }
  return SOCIAL_PROVIDER_IDS.filter((provider) => providers.has(provider));
}

function expectedOAuthProviders(value: string | undefined) {
  const setting = value?.trim() ?? "";
  if (setting === "none") return [];
  const values = setting.split(",").map((provider) => provider.trim());
  const providers = orderedProviders(values);
  if (!setting || values.some((provider) => !provider) || !providers) {
    throw new LaunchEvidenceError("ELAUNCH_EXPECTED_PROVIDERS", "configuration");
  }
  return providers;
}

export function launchEvidenceConfiguration({
  confirmation,
  expectedOrigin,
  expectedProviders,
  expectedRelease,
}: {
  confirmation?: string;
  expectedOrigin?: string;
  expectedProviders?: string;
  expectedRelease?: string;
}): LaunchEvidenceConfiguration {
  if (confirmation?.trim() !== "1") {
    throw new LaunchEvidenceError("ELAUNCH_CONFIRMATION", "configuration");
  }
  const release = expectedRelease?.trim() ?? "";
  if (!SAFE_RELEASE.test(release)) {
    throw new LaunchEvidenceError("ELAUNCH_EXPECTED_RELEASE", "configuration");
  }
  return {
    expectedRelease: release,
    expectedOrigin: productionOrigin(expectedOrigin, "ELAUNCH_EXPECTED_ORIGIN"),
    expectedProviders: expectedOAuthProviders(expectedProviders),
  };
}

function canonicalTimestamp(value: string) {
  if (!ISO_TIMESTAMP.test(value)) return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value
    ? timestamp
    : null;
}

function minutes(value: number) {
  return Math.max(0, Math.floor(value / 60_000));
}

function sameProviders(left: readonly SocialProviderId[], right: readonly SocialProviderId[]) {
  return left.length === right.length
    && left.every((provider, index) => provider === right[index]);
}

export function verifyLaunchEvidenceText({
  configuration,
  now = new Date(),
  text,
}: {
  configuration: LaunchEvidenceConfiguration;
  now?: Date;
  text: string;
}) {
  if (new TextEncoder().encode(text).byteLength > MAX_LAUNCH_EVIDENCE_BYTES) {
    throw new LaunchEvidenceError("ELAUNCH_FILE_SIZE", "read");
  }
  let untrusted: unknown;
  try {
    untrusted = JSON.parse(text) as unknown;
  } catch {
    throw new LaunchEvidenceError("ELAUNCH_MANIFEST_JSON", "manifest");
  }
  const parsed = manifestSchema.safeParse(untrusted);
  if (!parsed.success) {
    throw new LaunchEvidenceError("ELAUNCH_MANIFEST_SCHEMA", "manifest");
  }
  const manifest = parsed.data;
  if (!SAFE_RELEASE.test(manifest.release) || manifest.release !== configuration.expectedRelease) {
    throw new LaunchEvidenceError("ELAUNCH_MANIFEST_RELEASE", "manifest");
  }
  if (
    productionOrigin(manifest.origin, "ELAUNCH_MANIFEST_ORIGIN")
    !== configuration.expectedOrigin
  ) {
    throw new LaunchEvidenceError("ELAUNCH_MANIFEST_ORIGIN", "manifest");
  }
  if (
    manifest.legal.termsVersion !== TERMS_VERSION
    || manifest.legal.privacyVersion !== PRIVACY_VERSION
  ) {
    throw new LaunchEvidenceError("ELAUNCH_MANIFEST_LEGAL", "manifest");
  }
  const manifestProviders = orderedProviders(manifest.oauthProviders);
  if (!manifestProviders || !sameProviders(manifestProviders, configuration.expectedProviders)) {
    throw new LaunchEvidenceError("ELAUNCH_MANIFEST_PROVIDERS", "manifest");
  }

  const nowMs = now.getTime();
  const seen = new Set<string>();
  const checks: Array<{
    gate: LaunchEvidenceGateId;
    provider?: SocialProviderId;
    status: "PASS";
    ageMinutes: number;
    maximumAgeHours: number;
    remainingMinutes: number;
  }> = [];

  for (const evidence of manifest.gates) {
    if (!GATE_IDS.has(evidence.gate)) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_UNKNOWN", "gate");
    }
    const gate = evidence.gate as LaunchEvidenceGateId;
    let provider: SocialProviderId | undefined;
    if (gate === "oauth-provider-journeys") {
      if (
        !evidence.provider
        || !isSocialProviderId(evidence.provider)
        || !configuration.expectedProviders.includes(evidence.provider)
      ) {
        throw new LaunchEvidenceError("ELAUNCH_GATE_SCOPE", "gate", gate);
      }
      provider = evidence.provider;
    } else if (evidence.provider !== undefined) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_SCOPE", "gate", gate);
    }
    const key = `${gate}:${provider ?? "singleton"}`;
    if (seen.has(key)) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_DUPLICATE", "gate", gate, provider);
    }
    seen.add(key);
    if (evidence.status !== "PASS") {
      throw new LaunchEvidenceError("ELAUNCH_GATE_STATUS", "gate", gate, provider);
    }
    const verifiedAt = canonicalTimestamp(evidence.verifiedAt);
    const expiresAt = canonicalTimestamp(evidence.expiresAt);
    if (!verifiedAt || !expiresAt || expiresAt.getTime() <= verifiedAt.getTime()) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_TIMESTAMP", "gate", gate, provider);
    }
    if (verifiedAt.getTime() > nowMs) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_FUTURE", "gate", gate, provider);
    }
    if (expiresAt.getTime() <= nowMs) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_EXPIRED", "gate", gate, provider);
    }
    const maximumAgeHours = LAUNCH_EVIDENCE_MAX_AGE_HOURS[gate];
    const staleAtMs = verifiedAt.getTime() + maximumAgeHours * 60 * 60 * 1000;
    if (staleAtMs <= nowMs) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_STALE", "gate", gate, provider);
    }
    checks.push({
      gate,
      ...(provider ? { provider } : {}),
      status: "PASS",
      ageMinutes: minutes(nowMs - verifiedAt.getTime()),
      maximumAgeHours,
      remainingMinutes: minutes(Math.min(staleAtMs, expiresAt.getTime()) - nowMs),
    });
  }

  for (const gate of SINGLETON_GATE_IDS) {
    if (!seen.has(`${gate}:singleton`)) {
      throw new LaunchEvidenceError("ELAUNCH_GATE_MISSING", "gate", gate);
    }
  }
  for (const provider of configuration.expectedProviders) {
    if (!seen.has(`oauth-provider-journeys:${provider}`)) {
      throw new LaunchEvidenceError(
        "ELAUNCH_GATE_MISSING",
        "gate",
        "oauth-provider-journeys",
        provider,
      );
    }
  }

  const order = new Map(LAUNCH_EVIDENCE_GATE_IDS.map((gate, index) => [gate, index]));
  checks.sort((left, right) => {
    const gateDifference = Number(order.get(left.gate)) - Number(order.get(right.gate));
    if (gateDifference) return gateDifference;
    return SOCIAL_PROVIDER_IDS.indexOf(left.provider as SocialProviderId)
      - SOCIAL_PROVIDER_IDS.indexOf(right.provider as SocialProviderId);
  });
  return {
    schemaVersion: 1,
    release: configuration.expectedRelease,
    gateCount: checks.length,
    oauthProviderCount: configuration.expectedProviders.length,
    freshness: {
      oldestAgeMinutes: Math.max(...checks.map((check) => check.ageMinutes)),
      minimumRemainingMinutes: Math.min(...checks.map((check) => check.remainingMinutes)),
    },
    checks,
  };
}

export async function readLaunchEvidenceFile(filePath: string | undefined) {
  const path = filePath?.trim() ?? "";
  if (!path || path.length > 4096 || path.includes("\u0000")) {
    throw new LaunchEvidenceError("ELAUNCH_FILE_REQUIRED", "configuration");
  }
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, "r");
    const details = await file.stat();
    if (!details.isFile()) throw new LaunchEvidenceError("ELAUNCH_FILE_READ", "read");
    if (details.size > MAX_LAUNCH_EVIDENCE_BYTES) {
      throw new LaunchEvidenceError("ELAUNCH_FILE_SIZE", "read");
    }
    const buffer = Buffer.alloc(MAX_LAUNCH_EVIDENCE_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > MAX_LAUNCH_EVIDENCE_BYTES) {
      throw new LaunchEvidenceError("ELAUNCH_FILE_SIZE", "read");
    }
    return buffer.subarray(0, total).toString("utf8");
  } catch (error) {
    if (isLaunchEvidenceError(error)) throw error;
    throw new LaunchEvidenceError("ELAUNCH_FILE_READ", "read");
  } finally {
    await file?.close().catch(() => undefined);
  }
}

export async function runLaunchEvidenceVerification({
  confirmation,
  expectedOrigin,
  expectedProviders,
  expectedRelease,
  filePath,
  now,
}: {
  confirmation?: string;
  expectedOrigin?: string;
  expectedProviders?: string;
  expectedRelease?: string;
  filePath?: string;
  now?: Date;
}) {
  const configuration = launchEvidenceConfiguration({
    confirmation,
    expectedOrigin,
    expectedProviders,
    expectedRelease,
  });
  const text = await readLaunchEvidenceFile(filePath);
  return verifyLaunchEvidenceText({ configuration, text, now });
}
