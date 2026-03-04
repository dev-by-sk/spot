/**
 * Tests for shareExtractionService.ts
 *
 * Targets medium-severity bug from docs/test-scenarios.md:
 * - 5.1.2 [BUG] LLM edge function invocation uses name 'extract-tiktok'
 *   instead of 'extract-place' — function call always 404s
 *   (shareExtractionService.ts:144)
 */

const mockInvoke = jest.fn();

jest.mock('../../config/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

jest.mock('../googlePlacesService', () => ({
  searchPlace: jest.fn().mockResolvedValue([
    { id: 'ChIJ123', name: 'Test Cafe', address: '123 Main St', category: 'Cafe' },
  ]),
}));

jest.mock('../../utils/retry', () => ({
  retryWithBackoff: (fn: () => Promise<any>) => fn(),
}));

import { extractPlaceFromURL } from '../shareExtractionService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('shareExtractionService', () => {
  /**
   * Scenario 5.1.2 — [BUG] Wrong edge function name
   *
   * extractPlaceNameWithLLM (line 144) calls:
   *   supabase.functions.invoke('extract-tiktok', { body: ... })
   *
   * The deployed edge function is named 'extract-place', not 'extract-tiktok'.
   * This means every LLM extraction call 404s, and the entire share-to-save
   * pipeline is broken for ALL URL types (not just TikTok).
   */
  it('5.1.2: LLM extraction invokes wrong edge function name "extract-tiktok"', async () => {
    // Mock fetch for the HTML metadata scraping step
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () =>
        '<html><head><meta property="og:title" content="Amazing Cafe Review"><meta property="og:description" content="Best coffee in NYC"></head></html>',
    }) as any;

    // Mock the edge function to return a valid extraction
    mockInvoke.mockResolvedValue({
      data: { placeName: 'Amazing Cafe', location: 'NYC' },
      error: null,
    });

    await extractPlaceFromURL('https://www.example.com/blog/cafe-review');

    // BUG: The function is invoked with 'extract-tiktok' instead of 'extract-place'
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][0]).toBe('extract-tiktok');

    // The correct name should be 'extract-place' (the deployed edge function)
    expect(mockInvoke.mock.calls[0][0]).not.toBe('extract-place');

    global.fetch = originalFetch;
  });

  /**
   * Scenario 5.1.2 — Prove the failure: in production, 'extract-tiktok' 404s
   * and extractPlaceFromURL returns null (broken pipeline)
   */
  it('5.1.2: wrong function name causes 404, making extractPlaceFromURL return null', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () =>
        '<html><head><meta property="og:title" content="Great Restaurant"></head></html>',
    }) as any;

    // Simulate the 404 that the Supabase edge function proxy returns
    // when calling a non-existent function
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function not found' },
    });

    const result = await extractPlaceFromURL('https://www.example.com/restaurant');

    // The extraction fails silently and returns null — the entire
    // share-to-save pipeline is broken
    expect(result).toBeNull();

    global.fetch = originalFetch;
  });
});
