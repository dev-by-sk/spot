import * as GooglePlacesService from './googlePlacesService';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import type { PlaceSearchResult } from '../types';

/**
 * Extract a place from a shared URL.
 *
 * Fast path (no LLM): Google Maps links and Google Search links — place name
 * is parsed directly from the URL structure.
 *
 * Fallback: fetch HTML metadata → LLM extracts place name → Google Places search
 */
export async function extractPlaceFromURL(url: string): Promise<PlaceSearchResult | null> {
  // ── Fast path: Google Maps / Search URLs ─────────────────────────────────────
  const mapResult = await tryMapExtraction(url);
  if (mapResult !== undefined) {
    return mapResult;
  }

  // ── Fallback: metadata scrape + LLM ─────────────────────────────────────────
  const metadata = await fetchPageMetadata(url);
  if (!metadata) return null;

  console.log('[Share] Extracted metadata:', metadata);

  const extracted = await extractPlaceNameWithLLM(metadata.title, metadata.description);
  if (!extracted?.placeName) {
    console.warn('[Share] LLM could not identify a place from metadata');
    return null;
  }

  console.log('[Share] LLM extracted:', extracted);

  const query = extracted.location
    ? `${extracted.placeName} ${extracted.location}`
    : extracted.placeName;

  const results = await GooglePlacesService.searchPlace(query);
  return results.length > 0 ? results[0] : null;
}

// ── Map / search URL extraction ──────────────────────────────────────────────

/**
 * Returns:
 *  - PlaceSearchResult  — successfully extracted and searched
 *  - null               — recognised map URL but couldn't extract a place
 *  - undefined          — not a recognised map URL; caller should use LLM fallback
 */
async function tryMapExtraction(url: string): Promise<PlaceSearchResult | null | undefined> {
  // Long Google Maps URL
  if (/google\.com\/maps|maps\.google\.com/i.test(url)) {
    return searchFromName(parseGoogleMapsURL(url), 'Google Maps');
  }

  // Google Search link
  if (/google\.com\/search/i.test(url)) {
    return searchFromName(parseGoogleSearchURL(url), 'Google Search');
  }

  // Short Google Maps link — resolve redirect first, then re-run
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
    const resolved = await resolveRedirect(url);
    if (resolved && /google\.com\/maps/i.test(resolved)) {
      return searchFromName(parseGoogleMapsURL(resolved), 'Google Maps (short link)');
    }
    return undefined;
  }

  return undefined;
}

async function searchFromName(
  parsed: { placeName: string | null; location: string | null },
  source: string,
): Promise<PlaceSearchResult | null> {
  if (!parsed.placeName) {
    console.warn(`[Share] Could not parse place name from ${source} URL`);
    return null;
  }
  const query = parsed.location
    ? `${parsed.placeName} ${parsed.location}`
    : parsed.placeName;
  console.log(`[Share] ${source} fast-path query:`, query);
  const results = await GooglePlacesService.searchPlace(query);
  return results.length > 0 ? results[0] : null;
}

// ── URL parsers ──────────────────────────────────────────────────────────────

function parseGoogleMapsURL(url: string): { placeName: string | null; location: string | null } {
  try {
    const urlObj = new URL(url);
    const placeMatch = urlObj.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
      if (name) return { placeName: name, location: null };
    }
    const q = urlObj.searchParams.get('q') ?? urlObj.searchParams.get('query');
    if (q) return { placeName: q.trim(), location: null };
    return { placeName: null, location: null };
  } catch {
    return { placeName: null, location: null };
  }
}

function parseGoogleSearchURL(url: string): { placeName: string | null; location: string | null } {
  try {
    const urlObj = new URL(url);
    const q = urlObj.searchParams.get('q');
    return { placeName: q?.trim() ?? null, location: null };
  } catch {
    return { placeName: null, location: null };
  }
}

async function resolveRedirect(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });
    const finalUrl = response.url;
    return finalUrl && finalUrl !== url ? finalUrl : null;
  } catch (error) {
    console.warn('[Share] Could not resolve short URL:', error);
    return null;
  }
}

// ── Existing metadata + LLM path ─────────────────────────────────────────────

interface PageMetadata {
  title: string | null;
  description: string | null;
}

async function fetchOEmbed(oEmbedUrl: string): Promise<PageMetadata | null> {
  try {
    const response = await fetch(oEmbedUrl);
    if (!response.ok) return null;
    const data = await response.json();
    const title = data.title || null;
    const description = data.author_name ? `by ${data.author_name}` : null;
    if (!title && !description) return null;
    return { title, description };
  } catch (error) {
    console.warn('[Share] oEmbed fetch failed:', error);
    return null;
  }
}

function getOEmbedUrl(url: string): string | null {
  if (/tiktok\.com/i.test(url) || /vm\.tiktok\.com/i.test(url)) {
    return `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  }
  if (/instagram\.com/i.test(url)) {
    return `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
  }
  return null;
}

async function fetchPageMetadata(url: string): Promise<PageMetadata | null> {
  const oEmbedUrl = getOEmbedUrl(url);
  if (oEmbedUrl) {
    const oEmbedResult = await fetchOEmbed(oEmbedUrl);
    if (oEmbedResult) return oEmbedResult;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });
    const html = await response.text();
    const ogTitle = extractMetaContent(html, 'og:title');
    const ogDesc = extractMetaContent(html, 'og:description');
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = ogTitle ?? (titleTag ? titleTag[1].trim() : null);
    const description = ogDesc ?? null;
    if (!title && !description) return null;
    return { title, description };
  } catch (error) {
    console.warn('[Share] Failed to fetch URL:', error);
    return null;
  }
}

interface LLMExtraction {
  placeName: string | null;
  location: string | null;
}

async function extractPlaceNameWithLLM(
  title: string | null,
  description: string | null,
): Promise<LLMExtraction | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-tiktok`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ title, description }),
    });
    if (!response.ok) {
      console.warn('[Share] extract-place function failed:', response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('[Share] LLM extraction failed:', error);
    return null;
  }
}

function extractMetaContent(html: string, property: string): string | null {
  const pattern1 = new RegExp(
    `<meta[^>]+property\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
    'i',
  );
  const match1 = html.match(pattern1);
  if (match1) return match1[1];

  const pattern2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+property\\s*=\\s*["']${property}["']`,
    'i',
  );
  const match2 = html.match(pattern2);
  return match2 ? match2[1] : null;
}
