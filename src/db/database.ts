import React, { createContext, useContext, useEffect, useState } from "react";
import * as SQLite from "expo-sqlite";
import {
  CREATE_PLACE_CACHE_TABLE,
  CREATE_SAVED_PLACES_TABLE,
  CREATE_SAVED_PLACES_USER_INDEX,
  CREATE_SAVED_PLACES_GOOGLE_INDEX,
  CREATE_PENDING_DELETIONS_TABLE,
  MIGRATE_PLACE_CACHE_ADD_WEBSITE,
  MIGRATE_PLACE_CACHE_ADD_PHONE,
  MIGRATE_PLACE_CACHE_ADD_OPENING_HOURS,
} from "./schema";
import type { PlaceCacheDTO, SavedPlaceDTO, SavedPlaceLocal } from "../types";

const DB_NAME = "spot.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await dbInstance.execAsync(CREATE_PLACE_CACHE_TABLE);
  await dbInstance.execAsync(CREATE_SAVED_PLACES_TABLE);
  await dbInstance.execAsync(CREATE_SAVED_PLACES_USER_INDEX);
  await dbInstance.execAsync(CREATE_SAVED_PLACES_GOOGLE_INDEX);
  await dbInstance.execAsync(CREATE_PENDING_DELETIONS_TABLE);
  // Migrations — ignore errors if column already exists
  try {
    await dbInstance.execAsync(MIGRATE_PLACE_CACHE_ADD_WEBSITE);
  } catch {}
  try {
    await dbInstance.execAsync(MIGRATE_PLACE_CACHE_ADD_PHONE);
  } catch {}
  try {
    await dbInstance.execAsync(MIGRATE_PLACE_CACHE_ADD_OPENING_HOURS);
  } catch {}
  return dbInstance;
}

// ── CRUD Functions ──

export async function upsertLocalPlaceCache(
  cache: PlaceCacheDTO,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO place_cache (google_place_id, name, address, lat, lng, rating, price_level, category, cuisine, last_refreshed, website, phone_number, opening_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(google_place_id) DO UPDATE SET
       name = excluded.name,
       address = excluded.address,
       lat = excluded.lat,
       lng = excluded.lng,
       rating = excluded.rating,
       price_level = excluded.price_level,
       category = excluded.category,
       cuisine = excluded.cuisine,
       last_refreshed = excluded.last_refreshed,
       website = excluded.website,
       phone_number = excluded.phone_number,
       opening_hours = excluded.opening_hours`,
    [
      cache.google_place_id,
      cache.name,
      cache.address,
      cache.lat,
      cache.lng,
      cache.rating,
      cache.price_level,
      cache.category,
      cache.cuisine,
      cache.last_refreshed,
      cache.website ?? null,
      cache.phone_number ?? null,
      cache.opening_hours ?? null,
    ],
  );
}

export async function insertLocalSavedPlace(
  place: Omit<SavedPlaceDTO, "place_cache">,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO saved_places (id, user_id, google_place_id, note_text, date_visited, saved_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      place.id,
      place.user_id,
      place.google_place_id,
      place.note_text,
      place.date_visited,
      place.saved_at,
    ],
  );
}

export async function deleteLocalSavedPlace(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM saved_places WHERE id = ?", [id]);
}

export async function markPendingDeletion(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("INSERT OR IGNORE INTO pending_deletions (id) VALUES (?)", [
    id,
  ]);
}

export async function clearPendingDeletion(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM pending_deletions WHERE id = ?", [id]);
}

export async function fetchPendingDeletionIds(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM pending_deletions",
  );
  return rows.map((r) => r.id);
}

export async function updateLocalSavedPlaceNote(
  id: string,
  note: string,
  dateVisited?: string | null,
): Promise<void> {
  const db = await getDatabase();
  if (dateVisited !== undefined) {
    await db.runAsync(
      "UPDATE saved_places SET note_text = ?, date_visited = ? WHERE id = ?",
      [note, dateVisited, id],
    );
  } else {
    await db.runAsync("UPDATE saved_places SET note_text = ? WHERE id = ?", [
      note,
      id,
    ]);
  }
}

export async function fetchLocalSavedPlaces(
  userId: string,
): Promise<SavedPlaceLocal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SavedPlaceLocal>(
    `SELECT
       sp.id, sp.user_id, sp.google_place_id, sp.note_text, sp.date_visited, sp.saved_at,
       pc.name, pc.address, pc.lat, pc.lng, pc.rating, pc.price_level, pc.category, pc.cuisine, pc.last_refreshed, pc.website, pc.phone_number, pc.opening_hours
     FROM saved_places sp
     LEFT JOIN place_cache pc ON sp.google_place_id = pc.google_place_id
     WHERE sp.user_id = ?
     ORDER BY sp.saved_at DESC`,
    [userId],
  );
  return rows;
}

export async function isDuplicatePlace(
  userId: string,
  googlePlaceId: string,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM saved_places WHERE user_id = ? AND google_place_id = ?",
    [userId, googlePlaceId],
  );
  return (row?.cnt ?? 0) > 0;
}

export async function fetchLocalPlaceIds(userId: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM saved_places WHERE user_id = ?",
    [userId],
  );
  return rows.map((r) => r.id);
}

export async function getLocalSavedPlaceForSync(
  userId: string,
  placeId: string,
): Promise<
  | (Omit<SavedPlaceDTO, "place_cache"> & { cache_google_place_id?: string })
  | null
> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    user_id: string;
    google_place_id: string;
    note_text: string;
    date_visited: string | null;
    saved_at: string;
  }>("SELECT * FROM saved_places WHERE id = ? AND user_id = ?", [
    placeId,
    userId,
  ]);
  return row ?? null;
}

export async function getLocalPlaceCacheForSync(
  googlePlaceId: string,
): Promise<PlaceCacheDTO | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PlaceCacheDTO>(
    "SELECT * FROM place_cache WHERE google_place_id = ?",
    [googlePlaceId],
  );
  return row ?? null;
}

// ── Update local saved place (for server-wins merge) ──

export async function upsertLocalSavedPlace(
  place: Omit<SavedPlaceDTO, "place_cache">,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO saved_places (id, user_id, google_place_id, note_text, date_visited, saved_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       note_text = excluded.note_text,
       date_visited = excluded.date_visited`,
    [
      place.id,
      place.user_id,
      place.google_place_id,
      place.note_text,
      place.date_visited,
      place.saved_at,
    ],
  );
}

// ── Database Provider (React Context) ──

interface DatabaseContextValue {
  isReady: boolean;
}

const DatabaseContext = createContext<DatabaseContextValue>({ isReady: false });

export function useDatabaseReady(): boolean {
  return useContext(DatabaseContext).isReady;
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    getDatabase()
      .then(() => setIsReady(true))
      .catch((error) => {
        console.error("[Database] Initialization failed:", error);
        setIsReady(true); // Allow app to render even if DB fails
      });
  }, []);

  return React.createElement(
    DatabaseContext.Provider,
    { value: { isReady } },
    children,
  );
}
