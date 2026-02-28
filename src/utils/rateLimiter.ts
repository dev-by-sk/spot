/**
 * Sliding-window rate limiter.
 * Tracks request timestamps and rejects requests that exceed the limit.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  /**
   * Attempt to acquire a slot. Returns true if the request is allowed,
   * false if the rate limit has been exceeded.
   */
  tryAcquire(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Prune expired timestamps
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }
}
