// ── Auth ──

export interface UserSession {
  userId: string;
  email: string | null;
  provider: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  auth_provider: string;
  profile_private: boolean;
  created_at: string;
  deleted_at: string | null;
}

// ── Place DTOs (snake_case — matches Supabase columns) ──

export interface SavedPlaceDTO {
  id: string;
  user_id: string;
  google_place_id: string;
  note_text: string;
  date_visited: string | null;
  saved_at: string;
  place_cache: PlaceCacheDTO | null;
}

export interface PlaceCacheDTO {
  google_place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  price_level: number;
  category: string;
  cuisine: string;
  last_refreshed: string;
}

// ── Search ──

export interface PlaceSearchResult {
  id: string;
  name: string;
  address: string;
  category: string;
}

// ── Local DB rows ──

export interface SavedPlaceLocal {
  id: string;
  user_id: string;
  google_place_id: string;
  note_text: string;
  date_visited: string | null;
  saved_at: string;
  // Joined from place_cache
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  price_level: number | null;
  category: string | null;
  cuisine: string | null;
  last_refreshed: string | null;
}

// ── Category ──

export enum PlaceCategory {
  Restaurant = 'Restaurant',
  Cafe = 'Cafe',
  Bar = 'Bar',
  Dessert = 'Dessert',
  Activity = 'Activity',
  Entertainment = 'Entertainment',
  Other = 'Other',
}

export const ALL_CATEGORIES: PlaceCategory[] = [
  PlaceCategory.Restaurant,
  PlaceCategory.Cafe,
  PlaceCategory.Bar,
  PlaceCategory.Dessert,
  PlaceCategory.Activity,
  PlaceCategory.Entertainment,
  PlaceCategory.Other,
];

export function categoryFromGoogleTypes(types: string[]): PlaceCategory {
  for (const type of types) {
    switch (type) {
      case 'restaurant':
      case 'meal_delivery':
      case 'meal_takeaway':
        return PlaceCategory.Restaurant;
      case 'cafe':
        return PlaceCategory.Cafe;
      case 'bar':
      case 'night_club':
        return PlaceCategory.Bar;
      case 'bakery':
      case 'ice_cream_shop':
        return PlaceCategory.Dessert;
      case 'movie_theater':
      case 'museum':
      case 'performing_arts_theater':
        return PlaceCategory.Entertainment;
      case 'amusement_park':
      case 'bowling_alley':
      case 'park':
      case 'spa':
      case 'stadium':
      case 'tourist_attraction':
      case 'zoo':
        return PlaceCategory.Activity;
    }
  }
  return PlaceCategory.Other;
}

// ── Errors ──

export class SpotError extends Error {
  constructor(
    public code: 'DUPLICATE_PLACE' | 'PLACE_NOT_FOUND' | 'NETWORK_ERROR' | 'RATE_LIMITED',
    message: string,
  ) {
    super(message);
    this.name = 'SpotError';
  }

  static duplicatePlace() {
    return new SpotError('DUPLICATE_PLACE', 'This spot is already saved');
  }

  static placeNotFound() {
    return new SpotError('PLACE_NOT_FOUND', 'Place not found');
  }

  static networkError(msg: string) {
    return new SpotError('NETWORK_ERROR', msg);
  }

  static rateLimited() {
    return new SpotError('RATE_LIMITED', 'Too many requests — please slow down and try again');
  }
}
