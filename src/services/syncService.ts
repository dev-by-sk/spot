import * as SupabaseService from './supabaseService';
import {
  upsertLocalPlaceCache,
  upsertLocalSavedPlace,
  fetchLocalSavedPlaces,
  getLocalPlaceCacheForSync,
} from '../db/database';
import type { SavedPlaceDTO } from '../types';

/**
 * Pull saved places from Supabase and merge into local SQLite.
 * Server wins on conflicts.
 */
export async function pullFromRemote(userId: string, isOnline: boolean): Promise<void> {
  if (!isOnline) return;

  try {
    const remotePlaces = await SupabaseService.fetchSavedPlaces();

    for (const dto of remotePlaces) {
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
    }
  } catch (error) {
    console.warn('[Sync] Pull from remote failed:', error);
  }
}

/**
 * Push any locally-created places that may not have synced yet.
 */
export async function pushToRemote(userId: string, isOnline: boolean): Promise<void> {
  if (!isOnline) return;

  try {
    const localPlaces = await fetchLocalSavedPlaces(userId);
    const remotePlaces = await SupabaseService.fetchSavedPlaces();
    const remoteIds = new Set(remotePlaces.map((p) => p.id));

    for (const local of localPlaces) {
      if (!remoteIds.has(local.id)) {
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
      }
    }
  } catch (error) {
    console.warn('[Sync] Push to remote failed:', error);
  }
}
