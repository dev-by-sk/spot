import { RateLimiter } from '@/utils/rateLimiter';

/**
 * Scenarios for a correct sliding-window rate limiter:
 *
 * === Basic behavior ===
 * 1. First request within an empty window is allowed
 * 2. Requests up to maxRequests are all allowed
 * 3. Request at maxRequests + 1 is rejected
 * 4. Multiple requests beyond the limit are all rejected
 *
 * === Sliding window ===
 * 5. After the window elapses, previously-rejected requests are allowed again
 * 6. Partial window expiry: oldest requests expire while newer ones remain,
 *    freeing exactly the number of expired slots
 * 7. Window is truly sliding (relative to "now"), not fixed/tumbling
 *
 * === Edge cases ===
 * 8. maxRequests = 1 (single-slot limiter)
 * 9. maxRequests = 0 (all requests rejected)
 * 10. Very large window (requests stay in window for a long time)
 * 11. Very small window (requests expire almost instantly)
 * 12. Burst at exact window boundary — requests made exactly windowMs ago
 *     should be expired (uses strict > not >=)
 * 13. Rejected requests do NOT consume a slot (no phantom entries)
 *
 * === Multiple independent instances ===
 * 14. Two RateLimiter instances don't share state
 *
 * === Boundary timestamp precision ===
 * 15. Requests at the exact same timestamp all count as separate slots
 */

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Basic behavior
// ---------------------------------------------------------------------------

describe('basic behavior', () => {
  it('allows the first request', () => {
    const limiter = new RateLimiter(5, 10_000);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('allows up to maxRequests', () => {
    const limiter = new RateLimiter(3, 10_000);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('rejects the request after maxRequests is reached', () => {
    const limiter = new RateLimiter(3, 10_000);
    for (let i = 0; i < 3; i++) limiter.tryAcquire();

    expect(limiter.tryAcquire()).toBe(false);
  });

  it('rejects all subsequent requests once the limit is hit', () => {
    const limiter = new RateLimiter(2, 10_000);
    limiter.tryAcquire();
    limiter.tryAcquire();

    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.tryAcquire()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sliding window
// ---------------------------------------------------------------------------

describe('sliding window', () => {
  it('allows requests again after the full window elapses', () => {
    const limiter = new RateLimiter(2, 10_000);
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    jest.advanceTimersByTime(10_001);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('frees only the expired slots on partial window expiry', () => {
    const limiter = new RateLimiter(3, 10_000);

    // t=0: slot 1
    limiter.tryAcquire();

    // t=4000: slot 2
    jest.advanceTimersByTime(4_000);
    limiter.tryAcquire();

    // t=6000: slot 3
    jest.advanceTimersByTime(2_000);
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    // t=10_001: only slot 1 (t=0) has expired, 2 slots still active
    jest.advanceTimersByTime(4_001);
    expect(limiter.tryAcquire()).toBe(true); // fills freed slot
    expect(limiter.tryAcquire()).toBe(false); // back at limit
  });

  it('is a true sliding window, not a fixed/tumbling window', () => {
    const limiter = new RateLimiter(2, 10_000);

    // t=0: slot 1
    limiter.tryAcquire();

    // t=5000: slot 2
    jest.advanceTimersByTime(5_000);
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    // t=10_001: slot 1 expired, but slot 2 (t=5000) is still active
    jest.advanceTimersByTime(5_001);
    expect(limiter.tryAcquire()).toBe(true);  // one free slot
    expect(limiter.tryAcquire()).toBe(false); // slot 2 still in window
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('works with maxRequests = 1', () => {
    const limiter = new RateLimiter(1, 5_000);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    jest.advanceTimersByTime(5_001);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  // The implementation has no guard for maxRequests = 0; this tests the
  // correct behavior (all requests rejected).
  it('rejects all requests when maxRequests = 0', () => {
    const limiter = new RateLimiter(0, 10_000);
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('holds requests in window for a very large windowMs', () => {
    const ONE_HOUR = 3_600_000;
    const limiter = new RateLimiter(2, ONE_HOUR);

    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);

    // 59 minutes later — still within window
    jest.advanceTimersByTime(ONE_HOUR - 60_000);
    expect(limiter.tryAcquire()).toBe(false);

    // past the hour
    jest.advanceTimersByTime(60_001);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('expires requests almost instantly with a very small windowMs', () => {
    const limiter = new RateLimiter(1, 1);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    jest.advanceTimersByTime(2);
    expect(limiter.tryAcquire()).toBe(true);
  });

  // The filter uses strict > (t > windowStart), so a timestamp recorded
  // exactly windowMs ago equals windowStart and is pruned.
  it('expires requests that are exactly windowMs old', () => {
    const limiter = new RateLimiter(1, 1_000);

    limiter.tryAcquire(); // recorded at t=0
    jest.advanceTimersByTime(1_000); // now t=1000, windowStart = 0, filter: t > 0

    // t=0 is NOT > 0, so it is pruned — slot should be free
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('does not consume a slot when a request is rejected', () => {
    const limiter = new RateLimiter(2, 10_000);
    limiter.tryAcquire();
    limiter.tryAcquire();

    // These rejections must not grow internal state
    for (let i = 0; i < 100; i++) {
      expect(limiter.tryAcquire()).toBe(false);
    }

    // After window expires, exactly maxRequests slots should be available
    jest.advanceTimersByTime(10_001);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Instance isolation
// ---------------------------------------------------------------------------

describe('instance isolation', () => {
  it('separate instances do not share state', () => {
    const a = new RateLimiter(1, 10_000);
    const b = new RateLimiter(1, 10_000);

    a.tryAcquire();
    expect(a.tryAcquire()).toBe(false);
    expect(b.tryAcquire()).toBe(true); // b is unaffected
  });
});

// ---------------------------------------------------------------------------
// Timestamp precision
// ---------------------------------------------------------------------------

describe('timestamp precision', () => {
  it('counts multiple requests at the same timestamp as separate slots', () => {
    // With fake timers Date.now() returns the same value until we advance,
    // so all three calls happen at "the same instant".
    const limiter = new RateLimiter(3, 10_000);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });
});
