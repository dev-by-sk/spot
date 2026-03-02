import * as SupabaseService from './supabaseService';
import {
  upsertLocalPlaceCache,
  upsertLocalSavedPlace,
  fetchLocalSavedPlaces,
  getLocalPlaceCacheForSync,
  fetchPendingDeletionIds,
  clearPendingDeletion,
  deleteLocalSavedPlace,
} from '../db/database';
import type { SavedPlaceDTO } from '../types';

/**
 * Pull saved places from Supabase and merge into local SQLite.
 * Server wins on conflicts, except for locally-pending deletions.
 */
export async function pullFromRemote(userId: string, isOnline: boolean): Promise<void> {
  if (!isOnline) return;

  const [remotePlaces, pendingDeletionIds] = await Promise.all([
    SupabaseService.fetchSavedPlaces(),
    fetchPendingDeletionIds(),
  ]);

  const pendingSet = new Set(pendingDeletionIds);

  // Deduplicate remote places — keep the earliest saved_at per google_place_id
  const seenGoogleIds = new Map<string, SavedPlaceDTO>();
  const duplicateRemoteIds: string[] = [];

  for (const dto of remotePlaces) {
    const key = `${dto.user_id}:${dto.google_place_id}`;
    const existing = seenGoogleIds.get(key);
    if (existing) {
      const keepEarlier = existing.saved_at <= dto.saved_at;
      duplicateRemoteIds.push(keepEarlier ? dto.id : existing.id);
      if (!keepEarlier) seenGoogleIds.set(key, dto);
    } else {
      seenGoogleIds.set(key, dto);
    }
  }

  // Clean up server-side duplicates
  for (const dupId of duplicateRemoteIds) {
    try {
      await SupabaseService.deleteSavedPlace(dupId);
    } catch (error) {
      console.warn('[Sync] Failed to delete server duplicate:', dupId, error);
    }
  }

  // Filter out duplicates before upserting locally
  const deduped = remotePlaces.filter((dto) => !duplicateRemoteIds.includes(dto.id));

  const errors: Error[] = [];

  for (const dto of deduped) {
    // Skip places the user deleted locally but that haven't synced yet
    if (pendingSet.has(dto.id)) continue;

    try {
      // Upsert PlaceCache
      if (dto.place_cache) {
        await upsertLocalPlaceCache(dto.place_cache);
      }

      // Upsert SavedPlace (server wins)
      await upsertLocalSavedPlace({
        id: dto.id,
        user_id: dto.user_id,
        google_place_id: dto.google_place_id,
        note_text: dto.note_text,
        date_visited: dto.date_visited,
        saved_at: dto.saved_at,
      });
    } catch (error) {
      console.warn('[Sync] Failed to upsert place:', dto.id, error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (errors.length > 0) {
    throw new Error(`[Sync] Pull completed with ${errors.length} error(s): ${errors[0].message}`);
  }
}

/**
 * Push any locally-created places that may not have synced yet,
 * push note/date_visited updates for existing records,
 * and push any pending deletions.
 */
export async function pushToRemote(userId: string, isOnline: boolean): Promise<void> {
  if (!isOnline) return;

  // Flush pending deletions first so they don't get re-pulled
  const pendingDeletionIds = await fetchPendingDeletionIds();
  for (const id of pendingDeletionIds) {
    try {
      await SupabaseService.deleteSavedPlace(id);
      await clearPendingDeletion(id);
    } catch (error) {
      console.warn('[Sync] Pending deletion push failed:', error);
    }
  }

  const localPlaces = await fetchLocalSavedPlaces(userId);
  const remotePlaces = await SupabaseService.fetchSavedPlaces();
  const remoteMap = new Map(remotePlaces.map((p) => [p.id, p]));
  const remoteByGoogleId = new Map<string, SavedPlaceDTO>();
  for (const rp of remotePlaces) {
    remoteByGoogleId.set(`${rp.user_id}:${rp.google_place_id}`, rp);
  }

  for (const local of localPlaces) {
    const remote = remoteMap.get(local.id);

    if (!remote) {
      // Check if another device already saved this place under a different id
      const remoteByPlace = remoteByGoogleId.get(`${local.user_id}:${local.google_place_id}`);
      if (remoteByPlace) {
        // Another device already saved this place — merge locally instead of pushing a duplicate
        await deleteLocalSavedPlace(local.id);
        continue;
      }

      // This place exists locally but not remotely — push it
      if (local.google_place_id) {
        const cache = await getLocalPlaceCacheForSync(local.google_place_id);
        if (cache) {
          try {
            await SupabaseService.upsertPlaceCache(cache);
          } catch (error) {
            console.warn('[Sync] Background cache push failed:', error);
          }
        }
      }

      const dto: Omit<SavedPlaceDTO, 'place_cache'> = {
        id: local.id,
        user_id: local.user_id,
        google_place_id: local.google_place_id,
        note_text: local.note_text,
        date_visited: local.date_visited,
        saved_at: local.saved_at,
      };

      try {
        await SupabaseService.uploadSavedPlace(dto);
      } catch (error) {
        console.warn('[Sync] Background place push failed:', error);
      }
    } else {
      // Place exists on both sides — push local note/date if they differ
      const noteChanged = local.note_text !== remote.note_text;
      const dateChanged = (local.date_visited ?? null) !== (remote.date_visited ?? null);
      if (noteChanged || dateChanged) {
        try {
          await SupabaseService.updateSavedPlaceNote(local.id, local.note_text ?? '', local.date_visited);
        } catch (error) {
          console.warn('[Sync] Background note push failed:', error);
        }
      }
    }
  }
}

// NOTE: A matching Supabase unique index should be created via migration:
//   CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_places_user_google
//   ON saved_places(user_id, google_place_id);
// Run this via the Supabase dashboard or CLI. Client-side dedup handles it gracefully regardless.
