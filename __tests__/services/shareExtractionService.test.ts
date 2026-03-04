/**
 * Tests for shareExtractionService.ts
 *
 * Targets medium-severity bug from docs/test-scenarios.md:
 * - 5.1.2 [FIXED] LLM edge function now invokes 'extract-place' (the correct
 *   deployed function name) instead of the old 'extract-tiktok'
 *   (shareExtractionService.ts:144)
 */

const mockInvoke = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
}));

jest.mock("../../src/services/googlePlacesService", () => ({
  searchPlace: jest
    .fn()
    .mockResolvedValue([
      {
        id: "ChIJ123",
        name: "Test Cafe",
        address: "123 Main St",
        category: "Cafe",
      },
    ]),
}));

jest.mock("../../src/utils/retry", () => ({
  retryWithBackoff: (fn: () => Promise<any>) => fn(),
}));

import { extractPlaceFromURL } from "../../src/services/shareExtractionService";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("shareExtractionService", () => {
  /**
   * Scenario 5.1.2 — [FIXED] Correct edge function name 'extract-place'
   *
   * Previously called 'extract-tiktok' which always 404'd. Now calls
   * 'extract-place' — the actual deployed Supabase edge function.
   */
  it('5.1.2: LLM extraction invokes correct edge function name "extract-place"', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () =>
        '<html><head><meta property="og:title" content="Amazing Cafe Review"><meta property="og:description" content="Best coffee in NYC"></head></html>',
    }) as any;

    mockInvoke.mockResolvedValue({
      data: { placeName: "Amazing Cafe", location: "NYC" },
      error: null,
    });

    await extractPlaceFromURL("https://www.example.com/blog/cafe-review");

    // FIXED: The function is invoked with the correct name 'extract-place'
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][0]).toBe("extract-place");

    global.fetch = originalFetch;
  });

  /**
   * Scenario 5.1.2 — Successful end-to-end extraction with correct function name
   */
  it("5.1.2: extractPlaceFromURL succeeds when edge function responds correctly", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () =>
        '<html><head><meta property="og:title" content="Great Restaurant"></head></html>',
    }) as any;

    mockInvoke.mockResolvedValue({
      data: { placeName: "Great Restaurant", location: null },
      error: null,
    });

    const result = await extractPlaceFromURL(
      "https://www.example.com/restaurant",
    );

    // Pipeline completes successfully — returns Google Places search result
    expect(result).toEqual({
      id: "ChIJ123",
      name: "Test Cafe",
      address: "123 Main St",
      category: "Cafe",
    });

    global.fetch = originalFetch;
  });
});
