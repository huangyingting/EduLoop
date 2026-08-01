import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function prismaLogLevels(nodeEnvironment = process.env.NODE_ENV): ("warn" | "error")[] {
  return nodeEnvironment === "development" ? ["warn", "error"] : [];
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  // Prisma's built-in query-error logger prints the full exception message
  // before application handlers can redact it. Keep it only for local
  // development; production paths emit their own bounded structured events.
  log: prismaLogLevels(),
  errorFormat: process.env.NODE_ENV === "development" ? "pretty" : "minimal",
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
