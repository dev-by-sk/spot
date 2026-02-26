import * as GooglePlacesService from './googlePlacesService';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../config/supabase';
import type { PlaceSearchResult } from '../types';

/**
 * Extract a place from a shared URL.
 * Flow: URL → fetch HTML metadata → LLM extracts place name → Google Places search → return top result
 */
export async function extractPlaceFromURL(url: string): Promise<PlaceSearchResult | null> {
  const metadata = await fetchPageMetadata(url);
  if (!metadata) return null;

  console.log('[Share] Extracted metadata:', metadata);

  const extracted = await extractPlaceNameWithLLM(metadata.title, metadata.description);
  if (!extracted?.placeName) {
    console.warn('[Share] LLM could not identify a place from metadata');
    return null;
  }

  console.log('[Share] LLM extracted:', extracted);

  // Build search query: "Place Name City" for better matching
  const query = extracted.location
    ? `${extracted.placeName} ${extracted.location}`
    : extracted.placeName;

  const results = await GooglePlacesService.searchPlace(query);
  return results.length > 0 ? results[0] : null;
}

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
    // oEmbed doesn't have a description field, but author_name can provide context
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
  // Try oEmbed first for supported platforms (TikTok, Instagram)
  const oEmbedUrl = getOEmbedUrl(url);
  if (oEmbedUrl) {
    const oEmbedResult = await fetchOEmbed(oEmbedUrl);
    if (oEmbedResult) return oEmbedResult;
  }

  // Fallback: scrape HTML metadata
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
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    if (!accessToken) {
      console.warn('[Share] No auth session — cannot call extract-place');
      return null;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-tiktok`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
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
