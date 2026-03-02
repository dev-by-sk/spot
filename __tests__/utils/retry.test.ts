import { retryWithBackoff } from '@/utils/retry';

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/**
 * Helper: create a fn that fails `n` times then succeeds with `value`.
 * Tracks call count for assertions.
 */
function flakyFn<T>(failures: number, value: T, error: unknown = new Error('transient')) {
  let calls = 0;
  const fn = jest.fn(async () => {
    calls++;
    if (calls <= failures) throw error;
    return value;
  });
  return { fn, getCalls: () => calls };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('success cases', () => {
  it('returns immediately when fn succeeds on first attempt', async () => {
    const { fn } = flakyFn(0, 'ok');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds after one transient failure', async () => {
    const { fn } = flakyFn(1, 42);
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe(42);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('succeeds after two transient failures (max default retries)', async () => {
    const { fn } = flakyFn(2, 'recovered');
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000); // retry 1
    await jest.advanceTimersByTimeAsync(2_000); // retry 2
    expect(await promise).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Exhausted retries
// ---------------------------------------------------------------------------

describe('exhausted retries', () => {
  it('throws after all retries are exhausted', async () => {
    const error = new Error('persistent failure');
    const { fn } = flakyFn(10, 'never', error);
    const promise = retryWithBackoff(fn);
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(promise).rejects.toThrow('persistent failure');
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('throws the error from the final attempt, not an earlier one', async () => {
    let call = 0;
    const fn = jest.fn(async () => {
      call++;
      throw new Error(`failure #${call}`);
    });
    const promise = retryWithBackoff(fn);
    const assertion = expect(promise).rejects.toThrow('failure #3');
    await jest.advanceTimersByTimeAsync(1_000);
    await jest.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});

// ---------------------------------------------------------------------------
// Non-retryable errors — should throw immediately without sleeping
// ---------------------------------------------------------------------------

describe('non-retryable errors', () => {
  it('does not retry RATE_LIMITED errors', async () => {
    const error = Object.assign(new Error('rate limited'), { code: 'RATE_LIMITED' });
    const { fn } = flakyFn(1, 'ok', error);
    await expect(retryWithBackoff(fn)).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry DUPLICATE_PLACE errors', async () => {
    const error = Object.assign(new Error('duplicate'), { code: 'DUPLICATE_PLACE' });
    const { fn } = flakyFn(1, 'ok', error);
    await expect(retryWithBackoff(fn)).rejects.toThrow('duplicate');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry "Not authenticated" errors', async () => {
    const { fn } = flakyFn(1, 'ok', new Error('Not authenticated'));
    await expect(retryWithBackoff(fn)).rejects.toThrow('Not authenticated');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // FLAG: isRetryable uses exact string match on message "Not authenticated".
  // If googlePlacesService ever changes the message (e.g. "User not authenticated"),
  // the filter silently breaks and auth failures get retried with backoff delays.
  // A code-based check (like RATE_LIMITED) would be more robust.
  it('DOES retry auth errors with a slightly different message', async () => {
    const { fn } = flakyFn(1, 'ok', new Error('User not authenticated'));
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2); // retried — message didn't match filter
  });

  it('does not retry errors with NETWORK_ERROR code that also say "Not authenticated"', async () => {
    const error = Object.assign(new Error('Not authenticated'), { code: 'NETWORK_ERROR' });
    const { fn } = flakyFn(1, 'ok', error);
    // code check passes (NETWORK_ERROR is retryable), but message check catches it
    await expect(retryWithBackoff(fn)).rejects.toThrow('Not authenticated');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries NETWORK_ERROR code with a normal message', async () => {
    const error = Object.assign(new Error('Request failed'), { code: 'NETWORK_ERROR' });
    const { fn } = flakyFn(1, 'ok', error);
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Backoff timing
// ---------------------------------------------------------------------------

describe('exponential backoff timing', () => {
  it('waits 1s before first retry and 2s before second retry', async () => {
    const { fn } = flakyFn(2, 'done');
    const promise = retryWithBackoff(fn);

    // Not enough time for first retry
    await jest.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);

    // First retry fires at 1000ms
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // Not enough time for second retry (needs 2000ms more)
    await jest.advanceTimersByTimeAsync(1_999);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second retry fires at 2000ms after first retry
    await jest.advanceTimersByTimeAsync(1);
    expect(await promise).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom baseDelayMs', async () => {
    const { fn } = flakyFn(1, 'ok');
    const promise = retryWithBackoff(fn, 2, 500);

    await jest.advanceTimersByTimeAsync(499);
    expect(fn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not sleep before throwing a non-retryable error', async () => {
    const error = Object.assign(new Error('rate limited'), { code: 'RATE_LIMITED' });
    const { fn } = flakyFn(1, 'ok', error);

    const start = Date.now();
    await expect(retryWithBackoff(fn)).rejects.toThrow();
    const elapsed = Date.now() - start;

    expect(elapsed).toBe(0); // no setTimeout delay
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Custom maxRetries
// ---------------------------------------------------------------------------

describe('custom maxRetries', () => {
  it('maxRetries=0 means a single attempt with no retries', async () => {
    const { fn } = flakyFn(1, 'ok');
    await expect(retryWithBackoff(fn, 0)).rejects.toThrow('transient');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('maxRetries=1 allows exactly one retry', async () => {
    const { fn } = flakyFn(1, 'ok');
    const promise = retryWithBackoff(fn, 1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('maxRetries=1 fails if both attempts fail', async () => {
    const { fn } = flakyFn(5, 'ok');
    const promise = retryWithBackoff(fn, 1);
    const assertion = expect(promise).rejects.toThrow('transient');
    await jest.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Non-Error throwables
// ---------------------------------------------------------------------------

describe('non-Error throwables', () => {
  it('retries when fn throws a string', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls <= 1) throw 'network down';
      return 'ok';
    });
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe('ok');
  });

  it('retries when fn throws null', async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls <= 1) throw null;
      return 'ok';
    });
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Return value integrity
// ---------------------------------------------------------------------------

describe('return value', () => {
  it('preserves undefined return value', async () => {
    const fn = jest.fn(async () => undefined);
    const result = await retryWithBackoff(fn);
    expect(result).toBeUndefined();
  });

  it('preserves null return value', async () => {
    const fn = jest.fn(async () => null);
    const result = await retryWithBackoff(fn);
    expect(result).toBeNull();
  });

  it('preserves complex object return value after retries', async () => {
    const obj = { id: 1, nested: { data: [1, 2, 3] } };
    const { fn } = flakyFn(1, obj);
    const promise = retryWithBackoff(fn);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(await promise).toBe(obj); // same reference
  });
});
