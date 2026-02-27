import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import {
  AUTOCOMPLETE_RATE_LIMIT,
  AUTOCOMPLETE_RATE_WINDOW_MS,
  API_RATE_LIMIT,
  API_RATE_WINDOW_MS,
} from '../config/constants';
import { RateLimiter } from '../utils/rateLimiter';
import { SpotError } from '../types';
import type { PlaceSearchResult, PlaceCacheDTO } from '../types';

const autocompleteLimiter = new RateLimiter(AUTOCOMPLETE_RATE_LIMIT, AUTOCOMPLETE_RATE_WINDOW_MS);
const apiLimiter = new RateLimiter(API_RATE_LIMIT, API_RATE_WINDOW_MS);

function getBaseURL(): string {
  return `${SUPABASE_URL}/functions/v1/google-places-proxy`;
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lng) && lng >= -180 && lng <= 180
  );
}

async function authenticatedRequest(url: string, skipGeneralLimit = false): Promise<any> {
  if (!skipGeneralLimit && !apiLimiter.tryAcquire()) {
    throw SpotError.rateLimited();
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw SpotError.networkError('Not authenticated');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw SpotError.rateLimited();
    }
    const errorBody = await response.text();
    console.log('[GooglePlaces] Request failed:', response.status, errorBody);
    throw SpotError.networkError('Request failed');
  }

  const data = await response.json();
  console.log('[GooglePlaces] Response:', JSON.stringify(data).slice(0, 200));
  return data;
}

export async function autocomplete(
  query: string,
  lat?: number,
  lng?: number,
): Promise<PlaceSearchResult[]> {
  if (!autocompleteLimiter.tryAcquire()) {
    throw SpotError.rateLimited();
  }

  const encoded = encodeURIComponent(query);
  let url = `${getBaseURL()}/autocomplete?query=${encoded}`;
  if (lat != null && lng != null && isValidCoord(lat, lng)) {
    url += `&lat=${lat}&lng=${lng}`;
  }
  return authenticatedRequest(url, true);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceCacheDTO> {
  const url = `${getBaseURL()}/details?place_id=${encodeURIComponent(placeId)}`;
  const data = await authenticatedRequest(url);

  // Edge function returns camelCase; map to snake_case DTO
  return {
    google_place_id: data.googlePlaceId ?? data.google_place_id,
    name: data.name,
    address: data.address,
    lat: data.lat,
    lng: data.lng,
    rating: data.rating ?? 0,
    price_level: data.priceLevel ?? data.price_level ?? 0,
    category: data.category ?? '',
    cuisine: data.cuisine ?? '',
    last_refreshed: data.lastRefreshed ?? data.last_refreshed ?? new Date().toISOString(),
    website: data.website ?? data.websiteUri ?? null,
    phone_number: data.phoneNumber ?? data.formattedPhoneNumber ?? data.nationalPhoneNumber ?? data.internationalPhoneNumber ?? null,
  };
}

export async function searchPlace(
  query: string,
  lat?: number,
  lng?: number,
): Promise<PlaceSearchResult[]> {
  const encoded = encodeURIComponent(query);
  let url = `${getBaseURL()}/search?query=${encoded}`;
  if (lat != null && lng != null && isValidCoord(lat, lng)) {
    url += `&lat=${lat}&lng=${lng}`;
  }
  return authenticatedRequest(url);
}
