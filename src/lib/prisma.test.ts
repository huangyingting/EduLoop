import { describe, expect, it } from "vitest";
import {
  hyperdriveConnectionString,
  prismaDeploymentRuntime,
  prismaLogLevels,
} from "./prisma";

describe("Prisma logging", () => {
  it("keeps provider exception messages out of non-development logs", () => {
    expect(prismaLogLevels("production")).toEqual([]);
    expect(prismaLogLevels("test")).toEqual([]);
    expect(prismaLogLevels(undefined)).toEqual([]);
  });

  it("retains detailed provider diagnostics for explicit local development", () => {
    expect(prismaLogLevels("development")).toEqual(["warn", "error"]);
  });
});

describe("Prisma deployment provider", () => {
  it("uses the Node provider by default and accepts Cloudflare explicitly", () => {
    expect(prismaDeploymentRuntime({})).toBe("node");
    expect(prismaDeploymentRuntime({ EDULOOP_DEPLOYMENT_RUNTIME: "cloudflare" })).toBe("cloudflare");
  });

  it("rejects unknown deployment runtimes", () => {
    expect(() => prismaDeploymentRuntime({ EDULOOP_DEPLOYMENT_RUNTIME: "edge" }))
      .toThrow("EDULOOP_DEPLOYMENT_RUNTIME must be node or cloudflare.");
  });

  it("requires a non-empty Hyperdrive connection string", () => {
    expect(hyperdriveConnectionString({ HYPERDRIVE: { connectionString: "postgresql://hyperdrive" } } as CloudflareEnv))
      .toBe("postgresql://hyperdrive");
    expect(() => hyperdriveConnectionString({} as CloudflareEnv))
      .toThrow("Cloudflare deployment requires the HYPERDRIVE binding.");
  });
});
