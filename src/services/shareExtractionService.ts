import * as GooglePlacesService from './googlePlacesService';
import type { PlaceSearchResult } from '../types';

const PLATFORM_SUFFIXES = [
  ' | TikTok',
  ' - TikTok',
  ' - Instagram',
  ' | Instagram',
  ' on Instagram',
  ' - YouTube',
  ' | YouTube',
  ' - Yelp',
  ' | Yelp',
  ' - Google Maps',
];

/**
 * Extract a place from a shared URL.
 * Flow: URL → fetch HTML metadata → clean title → Google Places search → return top result
 */
export async function extractPlaceFromURL(url: string): Promise<PlaceSearchResult | null> {
  const title = await fetchAndExtractTitle(url);
  if (!title) return null;

  const cleaned = cleanTitle(title);
  if (!cleaned) return null;

  const results = await GooglePlacesService.searchPlace(cleaned);
  return results.length > 0 ? results[0] : null;
}

async function fetchAndExtractTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });
    const html = await response.text();

    // Try og:title first
    const ogTitle = extractMetaContent(html, 'og:title');
    if (ogTitle) return ogTitle;

    // Fall back to <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
  } catch (error) {
    console.warn('[Share] Failed to fetch URL:', error);
    return null;
  }
}

function extractMetaContent(html: string, property: string): string | null {
  // property="og:title" content="..."
  const pattern1 = new RegExp(
    `<meta[^>]+property\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
    'i',
  );
  const match1 = html.match(pattern1);
  if (match1) return match1[1];

  // content="..." property="og:title"
  const pattern2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+property\\s*=\\s*["']${property}["']`,
    'i',
  );
  const match2 = html.match(pattern2);
  return match2 ? match2[1] : null;
}

function cleanTitle(title: string): string {
  let cleaned = title;
  for (const suffix of PLATFORM_SUFFIXES) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.slice(0, -suffix.length);
    }
  }
  return cleaned.trim();
}
