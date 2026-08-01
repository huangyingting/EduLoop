import { errorLogMetadata } from "./logging";

const DATABASE_UNAVAILABLE_CODES = new Set([
  "P1000", // Authentication failed.
  "P1001", // Database server cannot be reached.
  "P1002", // Database server connection timed out.
  "P1003", // Configured database does not exist.
  "P1008", // Database operation timed out.
  "P1017", // Database server closed the connection.
  "P2024", // Timed out waiting for a pooled connection.
]);

export function isDatabaseUnavailableError(error: unknown) {
  const { errorCode } = errorLogMetadata(error);
  return errorCode !== undefined && DATABASE_UNAVAILABLE_CODES.has(errorCode);
}
