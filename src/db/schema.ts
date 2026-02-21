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

export const CREATE_SAVED_PLACES_USER_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_saved_places_user_id ON saved_places(user_id);
`;

export const CREATE_SAVED_PLACES_GOOGLE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_saved_places_google_place_id ON saved_places(google_place_id);
`;
