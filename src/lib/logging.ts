const SAFE_LOG_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_ERROR_TYPE = /^(?:Error|[A-Z][A-Za-z0-9]{0,63}Error)$/;
const SAFE_ERROR_CODE = /^(?:P\d{4}|E[A-Z][A-Z0-9_]{1,62}|ERR_[A-Z0-9_]{1,59})$/;

function property(value: unknown, key: string) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function isError(value: unknown) {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

export function safeLogToken(value: unknown) {
  return typeof value === "string" && SAFE_LOG_TOKEN.test(value) ? value : undefined;
}

export function errorLogMetadata(error: unknown) {
  const errorValue = isError(error);
  const candidateType = errorValue ? property(error, "name") : undefined;
  const errorType = typeof candidateType === "string" && SAFE_ERROR_TYPE.test(candidateType)
    ? candidateType
    : errorValue ? "Error" : "UnknownError";
  const candidateCode = property(error, "code");
  const errorCode = typeof candidateCode === "string" && SAFE_ERROR_CODE.test(candidateCode)
    ? candidateCode
    : undefined;
  const candidateStatus = property(error, "status");
  const errorStatus = Number.isInteger(candidateStatus)
    && Number(candidateStatus) >= 400
    && Number(candidateStatus) <= 599
    ? Number(candidateStatus)
    : undefined;

  return {
    errorType,
    ...(errorCode ? { errorCode } : {}),
    ...(errorStatus ? { errorStatus } : {}),
  };
}
