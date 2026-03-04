/**
 * Tests for supabaseService.ts
 *
 * Targets medium-severity bug from docs/test-scenarios.md:
 * - 3.1.6 [BUG] uploadSavedPlace uses `insert` not `upsert` — retried syncs
 *   fail permanently on existing IDs (supabaseService.ts:78-81)
 */

const mockInsert = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
      }),
      signOut: jest.fn(),
      signInWithIdToken: jest.fn(),
    },
    from: (table: string) => mockFrom(table),
    rpc: jest.fn(),
  },
}));

import { uploadSavedPlace } from '../supabaseService';

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockReturnValue({ error: null });
  mockUpsert.mockReturnValue({ error: null });
  mockFrom.mockReturnValue({
    insert: mockInsert,
    upsert: mockUpsert,
  });
});

describe('supabaseService', () => {
  const testPlace = {
    id: 'place-1',
    user_id: 'user-1',
    google_place_id: 'ChIJ123',
    note_text: 'Great food',
    date_visited: null,
    saved_at: '2024-06-15T12:00:00Z',
  };

  /**
   * Scenario 3.1.6 — [BUG] uploadSavedPlace uses insert, not upsert
   *
   * supabaseService.ts:78-81 uses `.insert(place)`. When a place with the
   * same ID already exists on the server (e.g., from a previous partial sync),
   * insert throws a unique constraint violation. The sync service catches
   * this with console.warn, but the place is retried every sync cycle forever.
   *
   * The fix would be to use `.upsert(place)` for idempotent retries.
   */
  it('3.1.6: uploadSavedPlace uses insert (not upsert), failing on existing IDs', async () => {
    await uploadSavedPlace(testPlace);

    // BUG: Uses .insert() instead of .upsert()
    expect(mockFrom).toHaveBeenCalledWith('saved_places');
    expect(mockInsert).toHaveBeenCalledWith(testPlace);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  /**
   * Scenario 3.1.6 — Prove the failure mode: insert with existing ID throws
   */
  it('3.1.6: uploadSavedPlace throws on duplicate ID because insert rejects', async () => {
    const duplicateError = {
      message: 'duplicate key value violates unique constraint "saved_places_pkey"',
      code: '23505',
    };
    mockInsert.mockReturnValueOnce({ error: duplicateError });

    // uploadSavedPlace throws the raw Supabase error object (not an Error instance)
    await expect(uploadSavedPlace(testPlace)).rejects.toEqual(duplicateError);
  });
});
