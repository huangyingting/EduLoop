import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "./legal";
import {
  LAUNCH_EVIDENCE_GATE_IDS,
  LaunchEvidenceError,
  MAX_LAUNCH_EVIDENCE_BYTES,
  launchEvidenceConfiguration,
  readLaunchEvidenceFile,
  verifyLaunchEvidenceText,
  type LaunchEvidenceGateId,
} from "./launch-evidence";

const now = new Date("2026-08-01T12:00:00.000Z");
const origin = "https://learn.example";
const release = "release-123";

type TestGate = {
  gate: string;
  provider?: string;
  status: string;
  verifiedAt: string;
  expiresAt: string;
  evidenceRef: string;
  operatorRef: string;
};

type TestManifest = {
  schemaVersion: number;
  release: string;
  origin: string;
  legal: { termsVersion: string; privacyVersion: string };
  oauthProviders: string[];
  gates: TestGate[];
};

function configuration(providers = "google,microsoft-entra-id") {
  return launchEvidenceConfiguration({
    confirmation: "1",
    expectedOrigin: origin,
    expectedProviders: providers,
    expectedRelease: release,
  });
}

function gate(
  gateId: LaunchEvidenceGateId,
  overrides: Partial<TestGate> = {},
): TestGate {
  return {
    gate: gateId,
    status: "PASS",
    verifiedAt: "2026-08-01T11:00:00.000Z",
    expiresAt: "2026-08-02T12:00:00.000Z",
    evidenceRef: `private-ticket:${gateId}`,
    operatorRef: "operator:launch-reviewer",
    ...overrides,
  };
}

function manifest(providers: string[] = ["microsoft-entra-id", "google"]): TestManifest {
  return {
    schemaVersion: 1,
    release,
    origin,
    legal: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    },
    oauthProviders: providers,
    gates: [
      ...LAUNCH_EVIDENCE_GATE_IDS
        .filter((gateId) => gateId !== "oauth-provider-journeys")
        .map((gateId) => gate(gateId)),
      ...providers.map((provider) => gate("oauth-provider-journeys", { provider })),
    ],
  };
}

function verify(value: unknown, providers?: string) {
  return verifyLaunchEvidenceText({
    configuration: configuration(providers),
    now,
    text: JSON.stringify(value),
  });
}

function expectCode(run: () => unknown, code: string, details: Record<string, unknown> = {}) {
  try {
    run();
    throw new Error("Expected launch-evidence verification to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(LaunchEvidenceError);
    expect(error).toMatchObject({ code, ...details });
  }
}

describe("launch evidence configuration", () => {
  it("requires explicit review before inspecting supplied settings", () => {
    expectCode(() => launchEvidenceConfiguration({
      expectedOrigin: "https://user:private@secret.example",
      expectedProviders: "google",
      expectedRelease: release,
    }), "ELAUNCH_CONFIRMATION", { phase: "configuration" });
  });

  it("pins a canonical HTTPS origin, exact release, and ordered provider set", () => {
    expect(launchEvidenceConfiguration({
      confirmation: " 1 ",
      expectedOrigin: `${origin}/`,
      expectedProviders: " microsoft-entra-id, google ",
      expectedRelease: ` ${release} `,
    })).toEqual({
      expectedOrigin: origin,
      expectedProviders: ["google", "microsoft-entra-id"],
      expectedRelease: release,
    });
    expect(configuration("none").expectedProviders).toEqual([]);
  });

  it("rejects unsafe targets, ambiguous releases, and provider drift", () => {
    for (const expectedOrigin of [
      "http://learn.example",
      "https://user:private@learn.example",
      "https://learn.example/practice",
      "https://learn.example?private=value",
    ]) {
      expectCode(() => launchEvidenceConfiguration({
        confirmation: "1",
        expectedOrigin,
        expectedProviders: "none",
        expectedRelease: release,
      }), "ELAUNCH_EXPECTED_ORIGIN");
    }
    for (const expectedRelease of ["", "private release", "release/123"]) {
      expectCode(() => launchEvidenceConfiguration({
        confirmation: "1",
        expectedOrigin: origin,
        expectedProviders: "none",
        expectedRelease,
      }), "ELAUNCH_EXPECTED_RELEASE");
    }
    for (const expectedProviders of ["", "google,google", "github", "none,google"]) {
      expectCode(() => launchEvidenceConfiguration({
        confirmation: "1",
        expectedOrigin: origin,
        expectedProviders,
        expectedRelease: release,
      }), "ELAUNCH_EXPECTED_PROVIDERS");
    }
  });
});

describe("launch evidence manifest", () => {
  it("accepts every release-bound gate and returns only safe freshness metadata", () => {
    const result = verify(manifest());
    expect(result).toMatchObject({
      schemaVersion: 1,
      release,
      gateCount: 15,
      oauthProviderCount: 2,
      freshness: {
        oldestAgeMinutes: 60,
        minimumRemainingMinutes: 60,
      },
    });
    expect(result.checks).toHaveLength(15);
    expect(result.checks.at(-1)).toMatchObject({
      gate: "desktop-mobile-review",
      status: "PASS",
    });
    const output = JSON.stringify(result);
    expect(output).not.toContain(origin);
    expect(output).not.toContain("private-ticket");
    expect(output).not.toContain("launch-reviewer");
  });

  it("supports a deployment with no enabled social provider without inventing a gate", () => {
    const value = manifest([]);
    expect(verify(value, "none")).toMatchObject({
      gateCount: 13,
      oauthProviderCount: 0,
    });
  });

  it("rejects malformed, oversized, and non-strict manifests", () => {
    expectCode(() => verifyLaunchEvidenceText({
      configuration: configuration(),
      now,
      text: "{private-invalid-json",
    }), "ELAUNCH_MANIFEST_JSON");
    expectCode(() => verifyLaunchEvidenceText({
      configuration: configuration(),
      now,
      text: "x".repeat(MAX_LAUNCH_EVIDENCE_BYTES + 1),
    }), "ELAUNCH_FILE_SIZE", { phase: "read" });

    const extra = { ...manifest(), privateUnexpectedField: "do not accept" };
    expectCode(() => verify(extra), "ELAUNCH_MANIFEST_SCHEMA");
    const privateControl = manifest();
    privateControl.gates[0] = {
      ...privateControl.gates[0],
      evidenceRef: "ticket\nsecret",
    };
    expectCode(() => verify(privateControl), "ELAUNCH_MANIFEST_SCHEMA");
    const placeholder = manifest();
    placeholder.gates[0] = {
      ...placeholder.gates[0],
      evidenceRef: "REPLACE_WITH_PRIVATE_EVIDENCE_REFERENCE",
    };
    expectCode(() => verify(placeholder), "ELAUNCH_MANIFEST_SCHEMA");
  });

  it("binds the manifest to the expected release, origin, legal text, and provider set", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...manifest(), release: "other-release" }, "ELAUNCH_MANIFEST_RELEASE"],
      [{ ...manifest(), origin: "https://other.example" }, "ELAUNCH_MANIFEST_ORIGIN"],
      [{
        ...manifest(),
        legal: { termsVersion: "old", privacyVersion: PRIVACY_VERSION },
      }, "ELAUNCH_MANIFEST_LEGAL"],
      [{ ...manifest(), oauthProviders: ["google"] }, "ELAUNCH_MANIFEST_PROVIDERS"],
      [{ ...manifest(), oauthProviders: ["google", "google"] }, "ELAUNCH_MANIFEST_PROVIDERS"],
    ];
    for (const [value, code] of cases) expectCode(() => verify(value), code);
  });

  it("rejects unknown, missing, duplicate, failed, and incorrectly scoped gates", () => {
    const unknown = manifest();
    unknown.gates[0] = { ...unknown.gates[0], gate: "private-unknown-gate" };
    expectCode(() => verify(unknown), "ELAUNCH_GATE_UNKNOWN");

    const missing = manifest();
    missing.gates = missing.gates.filter((item) => item.gate !== "ingress-controls");
    expectCode(() => verify(missing), "ELAUNCH_GATE_MISSING", { gate: "ingress-controls" });

    const missingProvider = manifest();
    missingProvider.gates = missingProvider.gates.filter(
      (item) => item.provider !== "microsoft-entra-id",
    );
    expectCode(() => verify(missingProvider), "ELAUNCH_GATE_MISSING", {
      gate: "oauth-provider-journeys",
      provider: "microsoft-entra-id",
    });

    const duplicate = manifest();
    duplicate.gates.push({ ...duplicate.gates[0] });
    expectCode(() => verify(duplicate), "ELAUNCH_GATE_DUPLICATE");

    const failed = manifest();
    failed.gates[0] = { ...failed.gates[0], status: "FAIL" };
    expectCode(() => verify(failed), "ELAUNCH_GATE_STATUS", { gate: "legal-review" });

    const singletonProvider = manifest();
    singletonProvider.gates[0] = { ...singletonProvider.gates[0], provider: "google" };
    expectCode(() => verify(singletonProvider), "ELAUNCH_GATE_SCOPE");

    const oauthWithoutProvider = manifest();
    const oauthIndex = oauthWithoutProvider.gates.findIndex(
      (item) => item.gate === "oauth-provider-journeys",
    );
    const unscoped = { ...oauthWithoutProvider.gates[oauthIndex] };
    delete unscoped.provider;
    oauthWithoutProvider.gates[oauthIndex] = unscoped;
    expectCode(() => verify(oauthWithoutProvider), "ELAUNCH_GATE_SCOPE", {
      gate: "oauth-provider-journeys",
    });

    const unexpectedProvider = manifest();
    unexpectedProvider.gates[oauthIndex] = {
      ...unexpectedProvider.gates[oauthIndex],
      provider: "facebook",
    };
    expectCode(() => verify(unexpectedProvider), "ELAUNCH_GATE_SCOPE", {
      gate: "oauth-provider-journeys",
    });
  });

  it("rejects invalid, future, expired, and stale evidence timestamps", () => {
    const invalid = manifest();
    invalid.gates[0] = { ...invalid.gates[0], verifiedAt: "2026-08-01T11:00:00Z" };
    expectCode(() => verify(invalid), "ELAUNCH_GATE_TIMESTAMP");

    const reversed = manifest();
    reversed.gates[0] = {
      ...reversed.gates[0],
      expiresAt: reversed.gates[0].verifiedAt,
    };
    expectCode(() => verify(reversed), "ELAUNCH_GATE_TIMESTAMP");

    const future = manifest();
    future.gates[0] = {
      ...future.gates[0],
      verifiedAt: "2026-08-01T13:00:00.000Z",
      expiresAt: "2026-08-01T14:00:00.000Z",
    };
    expectCode(() => verify(future), "ELAUNCH_GATE_FUTURE");

    const expired = manifest();
    expired.gates[0] = {
      ...expired.gates[0],
      expiresAt: now.toISOString(),
    };
    expectCode(() => verify(expired), "ELAUNCH_GATE_EXPIRED");

    const stale = manifest();
    const cleanupIndex = stale.gates.findIndex((item) => item.gate === "cleanup-scheduler");
    stale.gates[cleanupIndex] = {
      ...stale.gates[cleanupIndex],
      verifiedAt: "2026-08-01T09:59:59.999Z",
      expiresAt: "2026-08-02T12:00:00.000Z",
    };
    expectCode(() => verify(stale), "ELAUNCH_GATE_STALE", { gate: "cleanup-scheduler" });
  });

  it("keeps private supplied values out of fixed errors", () => {
    let error: unknown;
    try {
      launchEvidenceConfiguration({
        confirmation: "1",
        expectedOrigin: "https://operator:super-private@secret.example",
        expectedProviders: "none",
        expectedRelease: release,
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).not.toContain("super-private");
    expect(String(error)).not.toContain("secret.example");
  });
});

describe("launch evidence file boundary", () => {
  it("rejects a missing path or unreadable file with bounded errors", async () => {
    await expect(readLaunchEvidenceFile(undefined)).rejects.toMatchObject({
      code: "ELAUNCH_FILE_REQUIRED",
      phase: "configuration",
    });
    await expect(readLaunchEvidenceFile("/definitely/missing/private-launch-evidence.json"))
      .rejects.toMatchObject({ code: "ELAUNCH_FILE_READ", phase: "read" });
  });

  it("bounds the file before parsing it", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "eduloop-launch-evidence-"));
    const manifestPath = path.join(directory, "private.json");
    try {
      await writeFile(manifestPath, "x".repeat(MAX_LAUNCH_EVIDENCE_BYTES + 1));
      await expect(readLaunchEvidenceFile(manifestPath)).rejects.toMatchObject({
        code: "ELAUNCH_FILE_SIZE",
        phase: "read",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
