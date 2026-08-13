import { PrismaClient } from "@prisma/client";
import { PrismaClient as PrismaWasmClient } from ".prisma/client/wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const cloudflareClients = new WeakMap<object, PrismaClient>();

type DeploymentRuntime = "node" | "cloudflare";
type HyperdriveEnvironment = CloudflareEnv & {
  HYPERDRIVE?: { connectionString?: string };
};

export function prismaLogLevels(nodeEnvironment = process.env.NODE_ENV): ("warn" | "error")[] {
  return nodeEnvironment === "development" ? ["warn", "error"] : [];
}

export function prismaDeploymentRuntime(
  environment: Record<string, string | undefined> = process.env,
): DeploymentRuntime {
  const runtime = environment.EDULOOP_DEPLOYMENT_RUNTIME?.trim().toLowerCase() || "node";
  if (runtime !== "node" && runtime !== "cloudflare") {
    throw new Error("EDULOOP_DEPLOYMENT_RUNTIME must be node or cloudflare.");
  }
  return runtime;
}

export function hyperdriveConnectionString(environment: HyperdriveEnvironment) {
  const connectionString = environment.HYPERDRIVE?.connectionString?.trim();
  if (!connectionString) {
    throw new Error("Cloudflare deployment requires the HYPERDRIVE binding.");
  }
  return connectionString;
}

function prismaOptions() {
  return {
    // Prisma's built-in query-error logger prints the full exception message
    // before application handlers can redact it. Keep it only for local
    // development; production paths emit their own bounded structured events.
    log: prismaLogLevels(),
    errorFormat: process.env.NODE_ENV === "development" ? "pretty" as const : "minimal" as const,
  };
}

function nodePrismaClient() {
  const client = globalForPrisma.prisma ?? new PrismaClient(prismaOptions());
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

function cloudflarePrismaClient() {
  const { env, ctx } = getCloudflareContext();
  const requestContext = ctx as object;
  const existing = cloudflareClients.get(requestContext);
  if (existing) return existing;

  const adapter = new PrismaPg({
    connectionString: hyperdriveConnectionString(env as HyperdriveEnvironment),
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  const client = new PrismaWasmClient({ ...prismaOptions(), adapter });
  cloudflareClients.set(requestContext, client);
  return client;
}

function cloudflarePrismaProxy() {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      const client = cloudflarePrismaClient();
      const value = Reflect.get(client, property, client) as unknown;
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export const prisma = prismaDeploymentRuntime() === "cloudflare"
  ? cloudflarePrismaProxy()
  : nodePrismaClient();
