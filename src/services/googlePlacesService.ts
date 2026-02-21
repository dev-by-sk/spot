import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import { SpotError } from '../types';
import type { PlaceSearchResult, PlaceCacheDTO } from '../types';

function getBaseURL(): string {
  return `${SUPABASE_URL}/functions/v1/google-places-proxy`;
}

async function authenticatedRequest(url: string): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw SpotError.networkError('Not authenticated');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.log('[GooglePlaces] Request failed:', response.status, errorBody);
    throw SpotError.networkError('Request failed');
  }

  const data = await response.json();
  console.log('[GooglePlaces] Response:', JSON.stringify(data).slice(0, 200));
  return data;
}

export async function autocomplete(query: string): Promise<PlaceSearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `${getBaseURL()}/autocomplete?query=${encoded}`;
  return authenticatedRequest(url);
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
  };
}

export async function searchPlace(query: string): Promise<PlaceSearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `${getBaseURL()}/search?query=${encoded}`;
  return authenticatedRequest(url);
}
