import { PrismaClient, type Prisma } from "@prisma/client";
import { incrementCounter } from "./observability/metrics";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function prismaLogLevels(nodeEnvironment = process.env.NODE_ENV): ("warn" | "error")[] {
  return nodeEnvironment === "development" ? ["warn", "error"] : [];
}

export function slowQueryThresholdMs(value = process.env.SLOW_QUERY_MS) {
  const threshold = Number(value);
  return value && Number.isInteger(threshold) && threshold >= 10 ? threshold : null;
}

// Collapse a statement to its shape. Prisma statements use placeholders, and
// parameter values are never logged, so no learner data reaches the log.
export function statementFingerprint(query: string) {
  return query.replace(/\s+/g, " ").trim().slice(0, 200);
}

const slowQueryMs = slowQueryThresholdMs();
const queryEvents: Prisma.LogDefinition[] = slowQueryMs ? [{ emit: "event", level: "query" }] : [];

const client = globalForPrisma.prisma ?? new PrismaClient({
  // Prisma's built-in query-error logger prints the full exception message
  // before application handlers can redact it. Keep it only for local
  // development; production paths emit their own bounded structured events.
  log: [...prismaLogLevels(), ...queryEvents],
  errorFormat: process.env.NODE_ENV === "development" ? "pretty" : "minimal",
});
if (slowQueryMs && !globalForPrisma.prisma) {
  (client as PrismaClient<Prisma.PrismaClientOptions, "query">).$on("query", (event) => {
    if (event.duration < slowQueryMs) return;
    incrementCounter("eduloop_slow_queries_total");
    console.warn(JSON.stringify({
      level: "warn",
      event: "slow_database_query",
      durationMs: event.duration,
      statement: statementFingerprint(event.query),
    }));
  });
}
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;

export const prisma = client;
