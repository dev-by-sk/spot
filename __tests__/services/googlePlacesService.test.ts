/**
 * Tests for googlePlacesService.ts
 *
 * Covers high-severity bugs from docs/test-scenarios.md:
 * - 4.1.4 [FIXED] Stale auth token in retry loop (googlePlacesService.ts:32-41)
 *   → getSession() now called inside the retry lambda so each attempt gets a fresh token
 * - 4.1.6 [FIXED] HTTP 401 generates retryable networkError
 *   → 401 now throws 'Not authenticated' which is non-retryable
 */
import { SpotError } from '../../src/types';

// ── Mocks ──

const mockGetSession = jest.fn();
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: any[]) => mockGetSession(...args) },
  },
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

jest.mock('../../src/utils/rateLimiter', () => ({
  RateLimiter: class {
    tryAcquire() { return true; }
  },
}));

// Use real retryWithBackoff but with 0 delay so tests are fast
jest.mock('../../src/utils/retry', () => {
  const original = jest.requireActual('../../src/utils/retry');
  return {
    retryWithBackoff: (fn: () => Promise<any>, maxRetries = 2) =>
      original.retryWithBackoff(fn, maxRetries, 0),
  };
});

// ── Helpers ──

const validPlaceResponse = {
  googlePlaceId: 'ChIJ123',
  name: 'Test Café',
  address: '123 Main St',
  lat: 40.7,
  lng: -74.0,
  rating: 4.5,
  priceLevel: 2,
  category: 'Restaurant',
  cuisine: 'Italian',
};

beforeEach(() => {
  jest.restoreAllMocks();
  mockGetSession.mockReset();
});

describe('googlePlacesService', () => {
  /**
   * Scenario 4.1.4 — [FIXED] Token re-fetched on each retry attempt
   *
   * authenticatedRequest now calls getSession() inside the retry lambda,
   * so each attempt gets a fresh token. On the first (failed) attempt it
   * uses the initial token; on retry it re-fetches and gets a new one.
   */
  it('4.1.4: re-fetches session token on each retry attempt', async () => {
    // Pre-flight check returns a session, then each retry also calls getSession
    mockGetSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'token-v1' } } })  // pre-flight
      .mockResolvedValueOnce({ data: { session: { access_token: 'token-v1' } } })  // attempt 1
      .mockResolvedValueOnce({ data: { session: { access_token: 'token-v2' } } }); // attempt 2 (refreshed)

    let fetchCallCount = 0;
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // First attempt fails with 500 (retryable)
        return new Response('Server Error', { status: 500 });
      }
      // Second attempt succeeds
      return new Response(JSON.stringify(validPlaceResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    const { getPlaceDetails } = require('../../src/services/googlePlacesService');
    await getPlaceDetails('ChIJ123');

    // getSession called 3 times: 1 pre-flight + 1 per attempt
    expect(mockGetSession).toHaveBeenCalledTimes(3);

    // First fetch used token-v1, second fetch used refreshed token-v2
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].headers.Authorization).toBe('Bearer token-v1');
    expect(calls[1][1].headers.Authorization).toBe('Bearer token-v2');

    global.fetch = originalFetch;
  });

  /**
   * Scenario 4.1.6 — [FIXED] HTTP 401 now throws non-retryable auth error
   *
   * When the proxy returns 401, authenticatedRequest now throws
   * SpotError.networkError('Not authenticated') which is non-retryable.
   */
  it('4.1.6: HTTP 401 throws non-retryable auth error (no unnecessary retries)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'bad-token' } },
    });

    let fetchCallCount = 0;
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      fetchCallCount++;
      return new Response('Unauthorized', { status: 401 });
    }) as any;

    const { getPlaceDetails } = require('../../src/services/googlePlacesService');

    await expect(getPlaceDetails('ChIJ123')).rejects.toThrow('Not authenticated');

    // Only 1 fetch call — 401 is not retried
    expect(fetchCallCount).toBe(1);

    global.fetch = originalFetch;
  });

  /**
   * Scenario 4.1.5 — HTTP 429 correctly throws non-retryable rateLimited error
   */
  it('4.1.5: HTTP 429 throws non-retryable rateLimited error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'valid-token' } },
    });

    let fetchCallCount = 0;
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      fetchCallCount++;
      return new Response('Too Many Requests', { status: 429 });
    }) as any;

    const { getPlaceDetails } = require('../../src/services/googlePlacesService');

    await expect(getPlaceDetails('ChIJ123')).rejects.toThrow(
      'Too many requests',
    );

    // Correctly NOT retried — only 1 fetch call
    expect(fetchCallCount).toBe(1);

    global.fetch = originalFetch;
  });
});
