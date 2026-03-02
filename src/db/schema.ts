export const CREATE_PLACE_CACHE_TABLE = `
  CREATE TABLE IF NOT EXISTS place_cache (
    google_place_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL DEFAULT 0,
    lng REAL NOT NULL DEFAULT 0,
    rating REAL NOT NULL DEFAULT 0,
    price_level INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT '',
    cuisine TEXT NOT NULL DEFAULT '',
    last_refreshed TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export const CREATE_SAVED_PLACES_TABLE = `
  CREATE TABLE IF NOT EXISTS saved_places (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    google_place_id TEXT NOT NULL,
    note_text TEXT NOT NULL DEFAULT '',
    date_visited TEXT,
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (google_place_id) REFERENCES place_cache(google_place_id)
  );
`;

export const MIGRATE_PLACE_CACHE_ADD_WEBSITE = `
  ALTER TABLE place_cache ADD COLUMN website TEXT;
`;

export const MIGRATE_PLACE_CACHE_ADD_PHONE = `
  ALTER TABLE place_cache ADD COLUMN phone_number TEXT;
`;

export const MIGRATE_PLACE_CACHE_ADD_OPENING_HOURS = `
  ALTER TABLE place_cache ADD COLUMN opening_hours TEXT;
`;

export const CREATE_SAVED_PLACES_USER_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_saved_places_user_id ON saved_places(user_id);
`;

export const CREATE_SAVED_PLACES_GOOGLE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_saved_places_google_place_id ON saved_places(google_place_id);
`;

export const DEDUP_SAVED_PLACES = `
  DELETE FROM saved_places
  WHERE rowid NOT IN (
    SELECT MIN(rowid) FROM saved_places GROUP BY user_id, google_place_id
  );
`;

export const CREATE_SAVED_PLACES_UNIQUE_USER_GOOGLE_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_places_user_google
  ON saved_places(user_id, google_place_id);
`;

export const CREATE_PENDING_DELETIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS pending_deletions (
    id TEXT PRIMARY KEY NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;
