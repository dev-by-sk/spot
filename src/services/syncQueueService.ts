import { getDatabase } from '../db/database';
import * as SupabaseService from './supabaseService';

type SyncOperation = 'save' | 'delete' | 'update';

interface SyncQueueRow {
  id: number;
  operation: SyncOperation;
  payload: string;
  created_at: string;
  attempts: number;
}

export async function enqueueSync(operation: SyncOperation, payload: Record<string, unknown>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO sync_queue (operation, payload) VALUES (?, ?)',
    [operation, JSON.stringify(payload)],
  );
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM sync_queue');
  return row?.cnt ?? 0;
}

export async function processQueue(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SyncQueueRow>('SELECT * FROM sync_queue ORDER BY id ASC');

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);

      switch (row.operation) {
        case 'save':
          try {
            await SupabaseService.upsertPlaceCache(payload.cache);
          } catch (cacheError: any) {
            // Duplicate cache is fine — may already exist from a prior sync
            if (cacheError?.code !== '23505') throw cacheError;
          }
          try {
            await SupabaseService.uploadSavedPlace(payload.place);
          } catch (placeError: any) {
            // Duplicate place is fine — may already exist from pushToRemote
            if (placeError?.code !== '23505') throw placeError;
          }
          break;

        case 'delete':
          await SupabaseService.deleteSavedPlace(payload.id);
          break;

        case 'update':
          await SupabaseService.updateSavedPlaceNote(payload.id, payload.note, payload.dateVisited);
          break;
      }

      // Success — remove from queue
      await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [row.id]);
    } catch (error) {
      console.warn(`[SyncQueue] Failed to process item ${row.id} (attempt ${row.attempts + 1}):`, error);
      await db.runAsync('UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    }
  }
}
