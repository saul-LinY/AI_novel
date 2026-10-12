export function memoryFailure(error, fallbackStage = 'retrieval') {
  const number = (value) => Number.isFinite(value) ? value : null;
  return {
    code: String(error?.code ?? 'MEMORY_SEARCH_FAILED').slice(0, 80),
    stage: String(error?.stage ?? fallbackStage).slice(0, 40),
    message: String(error?.message ?? 'Memory operation failed').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 400),
    httpStatus: number(error?.httpStatus), timeoutMs: number(error?.timeoutMs), elapsedMs: number(error?.elapsedMs),
    attempts: Array.isArray(error?.attempts) ? error.attempts.map((attempt) => ({ attempt: number(attempt.attempt), httpStatus: number(attempt.httpStatus), headersMs: number(attempt.headersMs), elapsedMs: number(attempt.elapsedMs), outcome: String(attempt.outcome ?? '').slice(0, 60), requestId: typeof attempt.requestId === 'string' ? attempt.requestId.slice(0, 160) : null })) : [],
  };
}
