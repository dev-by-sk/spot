import { pullFromRemote, pushToRemote } from '@/services/syncService';
import * as SupabaseService from '@/services/supabaseService';
import * as database from '@/db/database';
import type { SavedPlaceDTO, PlaceCacheDTO, SavedPlaceLocal } from '@/types';

/**
 * Scenarios for syncService (intended behavior from PRD):
 *
 * PRD contract (CLAUDE.md + ISSUES.md):
 *   - Offline-first: SQLite is source of truth locally
 *   - Server-wins on pull (except locally-pending deletions)
 *   - Push locally-created places that aren't on server
 *   - Pending deletions tracked in pending_deletions table
 *   - Sync failures should propagate (Issue #4: silent failures = data-loss risk)
 *
 * ═══════════════════════════════════════════════════════════════════
 * pullFromRemote
 * ═══════════════════════════════════════════════════════════════════
 *
 * === Offline guard ===
 * 1.  No-op when offline — no remote calls made
 *
 * === Happy path ===
 * 2.  Upserts each remote place into local SQLite (server-wins)
 * 3.  Upserts place_cache when present on the DTO
 * 4.  Skips place_cache upsert when DTO has null place_cache
 * 5.  Empty remote list — no local writes
 *
 * === Pending deletion exclusion ===
 * 6.  Skips remote places whose id is in pending_deletions
 * 7.  Still upserts non-pending places alongside pending ones
 *
 * === Server-wins conflict resolution ===
 * 8.  Remote note_text/date_visited overwrites local values
 *
 * === Error handling (PRD: failures must propagate, Issue #4) ===
 * 9.  Throws when remote fetch fails
 * 10. Throws when fetchPendingDeletionIds fails
 * 11. One place upsert failure does not block remaining places
 * 12. After partial failure, still throws so caller knows sync was incomplete
 *
 * ═══════════════════════════════════════════════════════════════════
 * pushToRemote
 * ═══════════════════════════════════════════════════════════════════
 *
 * === Offline guard ===
 * 13. No-op when offline — no remote calls made
 *
 * === Pending deletions ===
 * 14. Deletes each pending id from remote, then clears local pending record
 * 15. One deletion failure does not block others
 * 16. Failed deletion is NOT cleared from pending_deletions (stays queued)
 *
 * === Push new places ===
 * 17. Local-only places (not on remote) push cache then saved place
 * 18. Skips cache push when google_place_id is falsy
 * 19. Skips cache push when no local cache row exists
 * 20. Cache push failure does not block saved place push
 * 21. Saved place push failure does not block other places
 *
 * === Push note/date updates ===
 * 22. Pushes when note_text differs
 * 23. Pushes when date_visited differs
 * 24. Pushes when both differ
 * 25. Skips update when note and date are identical
 * 26. Treats null and undefined date_visited as equivalent (no false diff)
 * 27. Note update failure does not block other places
 *
 * === Error handling (PRD) ===
 * 28. Throws when fetchLocalSavedPlaces fails
 * 29. Throws when remote fetchSavedPlaces fails
 */

// ── Mocks ──────────────────────────────────────────────────────────

// Must mock transitive deps that throw at import time without env vars / native modules.
jest.mock('@/config/supabase', () => ({ supabase: {} }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/theme/colors', () => ({ useSpotColors: () => ({}) }));

jest.mock('@/services/supabaseService');
jest.mock('@/db/database');

const mockSupabase = SupabaseService as jest.Mocked<typeof SupabaseService>;
const mockDb = database as jest.Mocked<typeof database>;

// ── Fixtures ───────────────────────────────────────────────────────

const USER_ID = 'user-1';

function makeCache(overrides: Partial<PlaceCacheDTO> = {}): PlaceCacheDTO {
  return {
    google_place_id: 'gp-1',
    name: 'Test Place',
    address: '123 Main St',
    lat: 40.7128,
    lng: -74.006,
    rating: 4.5,
    price_level: 2,
    category: 'Restaurant',
    cuisine: 'Italian',
    last_refreshed: '2025-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeRemotePlace(overrides: Partial<SavedPlaceDTO> = {}): SavedPlaceDTO {
  return {
    id: 'sp-1',
    user_id: USER_ID,
    google_place_id: 'gp-1',
    note_text: 'Great food',
    date_visited: '2025-05-20',
    saved_at: '2025-05-20T12:00:00Z',
    place_cache: makeCache(),
    ...overrides,
  };
}

function makeLocalPlace(overrides: Partial<SavedPlaceLocal> = {}): SavedPlaceLocal {
  return {
    id: 'sp-1',
    user_id: USER_ID,
    google_place_id: 'gp-1',
    note_text: 'Great food',
    date_visited: '2025-05-20',
    saved_at: '2025-05-20T12:00:00Z',
    name: 'Test Place',
    address: '123 Main St',
    lat: 40.7128,
    lng: -74.006,
    rating: 4.5,
    price_level: 2,
    category: 'Restaurant',
    cuisine: 'Italian',
    last_refreshed: '2025-06-01T00:00:00Z',
    website: null,
    phone_number: null,
    opening_hours: null,
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Defaults: empty collections, no pending deletions
  mockSupabase.fetchSavedPlaces.mockResolvedValue([]);
  mockDb.fetchPendingDeletionIds.mockResolvedValue([]);
  mockDb.fetchLocalSavedPlaces.mockResolvedValue([]);
  mockDb.upsertLocalPlaceCache.mockResolvedValue(undefined);
  mockDb.upsertLocalSavedPlace.mockResolvedValue(undefined);
  mockDb.clearPendingDeletion.mockResolvedValue(undefined);
  mockDb.getLocalPlaceCacheForSync.mockResolvedValue(null);
  mockDb.deleteLocalSavedPlace.mockResolvedValue(undefined);
  mockSupabase.deleteSavedPlace.mockResolvedValue(undefined);
  mockSupabase.uploadSavedPlace.mockResolvedValue(undefined);
  mockSupabase.upsertPlaceCache.mockResolvedValue(undefined);
  mockSupabase.updateSavedPlaceNote.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════════
// pullFromRemote
// ═══════════════════════════════════════════════════════════════════

describe('pullFromRemote', () => {
  // ── Offline guard ──

  it('is a no-op when offline — no remote calls made', async () => {
    await pullFromRemote(USER_ID, false);
    expect(mockSupabase.fetchSavedPlaces).not.toHaveBeenCalled();
    expect(mockDb.fetchPendingDeletionIds).not.toHaveBeenCalled();
  });

  // ── Happy path ──

  it('upserts each remote place into local SQLite', async () => {
    const placeA = makeRemotePlace({ id: 'sp-1', google_place_id: 'gp-1' });
    const placeB = makeRemotePlace({ id: 'sp-2', google_place_id: 'gp-2', place_cache: null });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([placeA, placeB]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(2);
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-1' }),
    );
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-2' }),
    );
  });

  it('upserts place_cache when present on the DTO', async () => {
    const cache = makeCache({ google_place_id: 'gp-99' });
    const place = makeRemotePlace({ place_cache: cache });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([place]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalPlaceCache).toHaveBeenCalledWith(cache);
  });

  it('skips place_cache upsert when DTO has null place_cache', async () => {
    const place = makeRemotePlace({ place_cache: null });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([place]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalPlaceCache).not.toHaveBeenCalled();
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(1);
  });

  it('makes no local writes when remote list is empty', async () => {
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalPlaceCache).not.toHaveBeenCalled();
    expect(mockDb.upsertLocalSavedPlace).not.toHaveBeenCalled();
  });

  // ── Pending deletion exclusion ──

  it('skips remote places whose id is in pending_deletions', async () => {
    const place = makeRemotePlace({ id: 'sp-deleted' });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([place]);
    mockDb.fetchPendingDeletionIds.mockResolvedValue(['sp-deleted']);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).not.toHaveBeenCalled();
    expect(mockDb.upsertLocalPlaceCache).not.toHaveBeenCalled();
  });

  it('upserts non-pending places while skipping pending ones', async () => {
    const kept = makeRemotePlace({ id: 'sp-keep' });
    const deleted = makeRemotePlace({ id: 'sp-deleted' });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([kept, deleted]);
    mockDb.fetchPendingDeletionIds.mockResolvedValue(['sp-deleted']);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(1);
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-keep' }),
    );
  });

  // ── Server-wins conflict resolution ──

  it('overwrites local note_text and date_visited with remote values (server-wins)', async () => {
    const remote = makeRemotePlace({
      id: 'sp-1',
      note_text: 'Server note',
      date_visited: '2025-06-10',
    });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sp-1',
        note_text: 'Server note',
        date_visited: '2025-06-10',
      }),
    );
  });

  // ── Error handling (PRD: sync failures must propagate — Issue #4) ──

  // BUG: current implementation wraps everything in try-catch and swallows
  // with console.warn. PRD (Issue #4) says silent sync failures are a
  // data-loss risk and errors should propagate to the caller.
  it('throws when remote fetch fails', async () => {
    mockSupabase.fetchSavedPlaces.mockRejectedValue(new Error('network'));

    await expect(pullFromRemote(USER_ID, true)).rejects.toThrow('network');
  });

  // BUG: same silent swallow — fetchPendingDeletionIds failure is hidden.
  it('throws when fetchPendingDeletionIds fails', async () => {
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);
    mockDb.fetchPendingDeletionIds.mockRejectedValue(new Error('db corrupt'));

    await expect(pullFromRemote(USER_ID, true)).rejects.toThrow('db corrupt');
  });

  // BUG: current implementation has no per-place try-catch in the pull loop.
  // One upsert failure aborts all subsequent places. PRD intends each place
  // is synced independently so a single bad record doesn't block the rest.
  it('continues upserting remaining places when one fails', async () => {
    const placeA = makeRemotePlace({ id: 'sp-a', google_place_id: 'gp-a', place_cache: null });
    const placeB = makeRemotePlace({ id: 'sp-b', google_place_id: 'gp-b', place_cache: null });
    const placeC = makeRemotePlace({ id: 'sp-c', google_place_id: 'gp-c', place_cache: null });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([placeA, placeB, placeC]);
    mockDb.upsertLocalSavedPlace
      .mockResolvedValueOnce(undefined)   // sp-a OK
      .mockRejectedValueOnce(new Error('constraint'))  // sp-b fails
      .mockResolvedValueOnce(undefined);  // sp-c should still run

    await pullFromRemote(USER_ID, true).catch(() => {});

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(3);
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-c' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// pushToRemote
// ═══════════════════════════════════════════════════════════════════

describe('pushToRemote', () => {
  // ── Offline guard ──

  it('is a no-op when offline — no remote calls made', async () => {
    await pushToRemote(USER_ID, false);
    expect(mockDb.fetchPendingDeletionIds).not.toHaveBeenCalled();
    expect(mockDb.fetchLocalSavedPlaces).not.toHaveBeenCalled();
  });

  // ── Pending deletions ──

  it('deletes each pending id from remote then clears the local record', async () => {
    mockDb.fetchPendingDeletionIds.mockResolvedValue(['sp-del-1', 'sp-del-2']);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.deleteSavedPlace).toHaveBeenCalledWith('sp-del-1');
    expect(mockSupabase.deleteSavedPlace).toHaveBeenCalledWith('sp-del-2');
    expect(mockDb.clearPendingDeletion).toHaveBeenCalledWith('sp-del-1');
    expect(mockDb.clearPendingDeletion).toHaveBeenCalledWith('sp-del-2');
  });

  it('processes remaining deletions when one fails', async () => {
    mockDb.fetchPendingDeletionIds.mockResolvedValue(['sp-fail', 'sp-ok']);
    mockSupabase.deleteSavedPlace
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce(undefined);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.deleteSavedPlace).toHaveBeenCalledTimes(2);
    expect(mockDb.clearPendingDeletion).toHaveBeenCalledWith('sp-ok');
  });

  it('does NOT clear a pending deletion when the remote delete fails', async () => {
    mockDb.fetchPendingDeletionIds.mockResolvedValue(['sp-fail']);
    mockSupabase.deleteSavedPlace.mockRejectedValue(new Error('500'));

    await pushToRemote(USER_ID, true);

    expect(mockDb.clearPendingDeletion).not.toHaveBeenCalled();
  });

  // ── Push new places ──

  it('pushes local-only places (cache then saved place) to remote', async () => {
    const local = makeLocalPlace({ id: 'sp-new', google_place_id: 'gp-new' });
    const cache = makeCache({ google_place_id: 'gp-new' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]); // not on remote
    mockDb.getLocalPlaceCacheForSync.mockResolvedValue(cache);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.upsertPlaceCache).toHaveBeenCalledWith(cache);
    expect(mockSupabase.uploadSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-new' }),
    );
  });

  it('skips cache push when google_place_id is falsy', async () => {
    const local = makeLocalPlace({ id: 'sp-no-gp', google_place_id: '' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);

    await pushToRemote(USER_ID, true);

    expect(mockDb.getLocalPlaceCacheForSync).not.toHaveBeenCalled();
    expect(mockSupabase.upsertPlaceCache).not.toHaveBeenCalled();
    // Still pushes the saved place itself
    expect(mockSupabase.uploadSavedPlace).toHaveBeenCalled();
  });

  it('skips cache push when no local cache row exists', async () => {
    const local = makeLocalPlace({ id: 'sp-no-cache' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);
    mockDb.getLocalPlaceCacheForSync.mockResolvedValue(null);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.upsertPlaceCache).not.toHaveBeenCalled();
    expect(mockSupabase.uploadSavedPlace).toHaveBeenCalled();
  });

  it('still pushes saved place when cache push fails', async () => {
    const local = makeLocalPlace({ id: 'sp-cache-fail' });
    const cache = makeCache();
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);
    mockDb.getLocalPlaceCacheForSync.mockResolvedValue(cache);
    mockSupabase.upsertPlaceCache.mockRejectedValue(new Error('cache fail'));

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.uploadSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-cache-fail' }),
    );
  });

  it('continues pushing other places when one upload fails', async () => {
    const localA = makeLocalPlace({ id: 'sp-a', google_place_id: 'gp-a' });
    const localB = makeLocalPlace({ id: 'sp-b', google_place_id: 'gp-b' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([localA, localB]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);
    mockSupabase.uploadSavedPlace
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.uploadSavedPlace).toHaveBeenCalledTimes(2);
  });

  // ── Push note/date updates ──

  it('pushes update when note_text differs', async () => {
    const local = makeLocalPlace({ id: 'sp-1', note_text: 'local note', date_visited: '2025-05-20' });
    const remote = makeRemotePlace({ id: 'sp-1', note_text: 'old note', date_visited: '2025-05-20' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.updateSavedPlaceNote).toHaveBeenCalledWith(
      'sp-1', 'local note', '2025-05-20',
    );
  });

  it('pushes update when date_visited differs', async () => {
    const local = makeLocalPlace({ id: 'sp-1', note_text: 'same', date_visited: '2025-06-01' });
    const remote = makeRemotePlace({ id: 'sp-1', note_text: 'same', date_visited: '2025-05-20' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.updateSavedPlaceNote).toHaveBeenCalledWith(
      'sp-1', 'same', '2025-06-01',
    );
  });

  it('pushes update when both note and date differ', async () => {
    const local = makeLocalPlace({ id: 'sp-1', note_text: 'new note', date_visited: '2025-06-15' });
    const remote = makeRemotePlace({ id: 'sp-1', note_text: 'old note', date_visited: '2025-05-20' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.updateSavedPlaceNote).toHaveBeenCalledWith(
      'sp-1', 'new note', '2025-06-15',
    );
  });

  it('skips update when note and date are identical', async () => {
    const local = makeLocalPlace({ id: 'sp-1', note_text: 'same', date_visited: '2025-05-20' });
    const remote = makeRemotePlace({ id: 'sp-1', note_text: 'same', date_visited: '2025-05-20' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.updateSavedPlaceNote).not.toHaveBeenCalled();
  });

  it('treats null date_visited on both sides as equal (no false diff)', async () => {
    const local = makeLocalPlace({ id: 'sp-1', note_text: 'same', date_visited: null });
    const remote = makeRemotePlace({ id: 'sp-1', note_text: 'same', date_visited: null });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.updateSavedPlaceNote).not.toHaveBeenCalled();
  });

  it('continues pushing other updates when one note update fails', async () => {
    const localA = makeLocalPlace({ id: 'sp-a', note_text: 'changed-a' });
    const localB = makeLocalPlace({ id: 'sp-b', note_text: 'changed-b' });
    const remoteA = makeRemotePlace({ id: 'sp-a', note_text: 'old-a' });
    const remoteB = makeRemotePlace({ id: 'sp-b', note_text: 'old-b' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([localA, localB]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remoteA, remoteB]);
    mockSupabase.updateSavedPlaceNote
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.updateSavedPlaceNote).toHaveBeenCalledTimes(2);
  });

  // ── Error handling (PRD: sync failures must propagate — Issue #4) ──

  // BUG: current implementation wraps fetchLocalSavedPlaces +
  // fetchSavedPlaces in an outer try-catch that swallows with console.warn.
  // PRD says these critical failures must propagate.
  it('throws when fetchLocalSavedPlaces fails', async () => {
    mockDb.fetchLocalSavedPlaces.mockRejectedValue(new Error('db read fail'));

    await expect(pushToRemote(USER_ID, true)).rejects.toThrow('db read fail');
  });

  // BUG: same outer try-catch swallow.
  it('throws when remote fetchSavedPlaces fails', async () => {
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([]);
    mockSupabase.fetchSavedPlaces.mockRejectedValue(new Error('supabase down'));

    await expect(pushToRemote(USER_ID, true)).rejects.toThrow('supabase down');
  });
});
