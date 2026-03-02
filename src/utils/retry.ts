/**
 * Retry wrapper with exponential backoff for transient network failures.
 * Retries up to `maxRetries` times (default 2), starting at `baseDelayMs` (default 1000ms).
 * Does NOT retry on errors that won't succeed on retry (rate limits, auth failures).
 */
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1_000;

function isRetryable(error: unknown): boolean {
  // Don't retry rate limit or auth errors
  if (error && typeof error === "object") {
    const code = (error as { code?: string }).code;
    if (code === "RATE_LIMITED" || code === "DUPLICATE_PLACE") return false;

    const message = (error as { message?: string }).message;
    if (message === "Not authenticated") return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(
        `[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
      );
      await sleep(delay);
    }
  }

  // Unreachable, but satisfies TypeScript
  throw lastError;
}
