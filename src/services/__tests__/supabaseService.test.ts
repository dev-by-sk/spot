/**
 * Tests for supabaseService.ts
 *
 * Targets medium-severity bug from docs/test-scenarios.md:
 * - 3.1.6 [FIXED] uploadSavedPlace now uses `upsert` for idempotent retries
 *   (supabaseService.ts:78-81)
 */

const mockInsert = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

jest.mock("../../config/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: "user-1" } } },
      }),
      signOut: jest.fn(),
      signInWithIdToken: jest.fn(),
    },
    from: (table: string) => mockFrom(table),
    rpc: jest.fn(),
  },
}));

import { uploadSavedPlace } from "../supabaseService";

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockReturnValue({ error: null });
  mockUpsert.mockReturnValue({ error: null });
  mockFrom.mockReturnValue({
    insert: mockInsert,
    upsert: mockUpsert,
  });
});

describe("supabaseService", () => {
  const testPlace = {
    id: "place-1",
    user_id: "user-1",
    google_place_id: "ChIJ123",
    note_text: "Great food",
    date_visited: null,
    saved_at: "2024-06-15T12:00:00Z",
  };

  /**
   * Scenario 3.1.6 — [FIXED] uploadSavedPlace uses upsert for idempotent retries
   *
   * Previously used `.insert(place)` which threw unique constraint violations
   * when a place with the same ID already existed (e.g., from a previous partial sync).
   * Now uses `.upsert(place)` so retried syncs succeed idempotently.
   */
  it("3.1.6: uploadSavedPlace uses upsert (not insert) for idempotent retries", async () => {
    await uploadSavedPlace(testPlace);

    // FIXED: Uses .upsert() instead of .insert()
    expect(mockFrom).toHaveBeenCalledWith("saved_places");
    expect(mockUpsert).toHaveBeenCalledWith(testPlace);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  /**
   * Scenario 3.1.6 — Upsert with existing ID succeeds (no duplicate error)
   */
  it("3.1.6: uploadSavedPlace with existing ID succeeds via upsert", async () => {
    // upsert returns no error even when the ID already exists
    mockUpsert.mockReturnValueOnce({ error: null });

    await expect(uploadSavedPlace(testPlace)).resolves.toBeUndefined();
  });
});
