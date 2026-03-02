import { pullFromRemote, pushToRemote } from '@/services/syncService';
import * as SupabaseService from '@/services/supabaseService';
import * as database from '@/db/database';
import type { SavedPlaceDTO, PlaceCacheDTO, SavedPlaceLocal } from '@/types';

// ── Mocks ──────────────────────────────────────────────────────────

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
// pullFromRemote — dedup
// ═══════════════════════════════════════════════════════════════════

describe('pullFromRemote dedup', () => {
  it('deduplicates remote places with same google_place_id — only one upserted, earlier saved_at wins', async () => {
    const earlier = makeRemotePlace({
      id: 'sp-earlier',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-01T00:00:00Z',
      place_cache: null,
    });
    const later = makeRemotePlace({
      id: 'sp-later',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-10T00:00:00Z',
      place_cache: null,
    });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([earlier, later]);

    await pullFromRemote(USER_ID, true);

    // Only the earlier one should be upserted locally
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(1);
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-earlier' }),
    );
  });

  it('deletes the server-side duplicate', async () => {
    const earlier = makeRemotePlace({
      id: 'sp-earlier',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-01T00:00:00Z',
      place_cache: null,
    });
    const later = makeRemotePlace({
      id: 'sp-later',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-10T00:00:00Z',
      place_cache: null,
    });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([earlier, later]);

    await pullFromRemote(USER_ID, true);

    // The later duplicate should be deleted from the server
    expect(mockSupabase.deleteSavedPlace).toHaveBeenCalledWith('sp-later');
    expect(mockSupabase.deleteSavedPlace).toHaveBeenCalledTimes(1);
  });

  it('keeps later saved_at when it appears first in the array', async () => {
    const later = makeRemotePlace({
      id: 'sp-later',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-10T00:00:00Z',
      place_cache: null,
    });
    const earlier = makeRemotePlace({
      id: 'sp-earlier',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-01T00:00:00Z',
      place_cache: null,
    });
    // later appears first in the array, but earlier saved_at should still win
    mockSupabase.fetchSavedPlaces.mockResolvedValue([later, earlier]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(1);
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-earlier' }),
    );
    expect(mockSupabase.deleteSavedPlace).toHaveBeenCalledWith('sp-later');
  });

  it('does not fail if server duplicate deletion fails', async () => {
    const earlier = makeRemotePlace({
      id: 'sp-earlier',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-01T00:00:00Z',
      place_cache: null,
    });
    const later = makeRemotePlace({
      id: 'sp-later',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-10T00:00:00Z',
      place_cache: null,
    });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([earlier, later]);
    mockSupabase.deleteSavedPlace.mockRejectedValue(new Error('server error'));

    // Should not throw
    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(1);
  });

  it('still upserts non-duplicate places alongside deduped ones', async () => {
    const unique = makeRemotePlace({
      id: 'sp-unique',
      google_place_id: 'gp-unique',
      place_cache: null,
    });
    const dup1 = makeRemotePlace({
      id: 'sp-dup1',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-01T00:00:00Z',
      place_cache: null,
    });
    const dup2 = makeRemotePlace({
      id: 'sp-dup2',
      google_place_id: 'gp-dup',
      saved_at: '2025-05-10T00:00:00Z',
      place_cache: null,
    });
    mockSupabase.fetchSavedPlaces.mockResolvedValue([unique, dup1, dup2]);

    await pullFromRemote(USER_ID, true);

    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledTimes(2);
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-unique' }),
    );
    expect(mockDb.upsertLocalSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-dup1' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// pushToRemote — dedup
// ═══════════════════════════════════════════════════════════════════

describe('pushToRemote dedup', () => {
  it('skips push if remote already has same google_place_id under a different id', async () => {
    const local = makeLocalPlace({ id: 'sp-local', google_place_id: 'gp-shared' });
    const remote = makeRemotePlace({ id: 'sp-remote', google_place_id: 'gp-shared' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.uploadSavedPlace).not.toHaveBeenCalled();
  });

  it('deletes the redundant local record when remote already has the place', async () => {
    const local = makeLocalPlace({ id: 'sp-local', google_place_id: 'gp-shared' });
    const remote = makeRemotePlace({ id: 'sp-remote', google_place_id: 'gp-shared' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    expect(mockDb.deleteLocalSavedPlace).toHaveBeenCalledWith('sp-local');
  });

  it('pushes normally when no remote duplicate exists', async () => {
    const local = makeLocalPlace({ id: 'sp-new', google_place_id: 'gp-new' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([]);

    await pushToRemote(USER_ID, true);

    expect(mockSupabase.uploadSavedPlace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-new' }),
    );
    expect(mockDb.deleteLocalSavedPlace).not.toHaveBeenCalled();
  });

  it('does not skip push when remote has same id (normal update path)', async () => {
    const local = makeLocalPlace({ id: 'sp-1', google_place_id: 'gp-1', note_text: 'updated' });
    const remote = makeRemotePlace({ id: 'sp-1', google_place_id: 'gp-1', note_text: 'old' });
    mockDb.fetchLocalSavedPlaces.mockResolvedValue([local]);
    mockSupabase.fetchSavedPlaces.mockResolvedValue([remote]);

    await pushToRemote(USER_ID, true);

    // Should go through the update path, not the dedup skip
    expect(mockDb.deleteLocalSavedPlace).not.toHaveBeenCalled();
    expect(mockSupabase.updateSavedPlaceNote).toHaveBeenCalledWith(
      'sp-1', 'updated', '2025-05-20',
    );
  });
});
