import * as GooglePlacesService from './googlePlacesService';
import { supabase } from '../config/supabase';
import { retryWithBackoff } from '../utils/retry';
import type { PlaceSearchResult } from '../types';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 1_048_576; // 1 MB

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(oEmbedUrl, { signal: controller.signal });
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
  } finally {
    clearTimeout(timer);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_HTML_BYTES) {
      return null;
    }

    const raw = await response.text();
    const html = raw.length > MAX_HTML_BYTES ? raw.slice(0, MAX_HTML_BYTES) : raw;

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
  } finally {
    clearTimeout(timer);
  }
}

interface LLMExtraction {
  placeName: string | null;
  location: string | null;
}

const MAX_LLM_INPUT_CHARS = 500;

function sanitizeForLLM(text: string | null): string | null {
  if (!text) return null;
  return text
    .replace(/<[^>]*>/g, ' ')      // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim()
    .slice(0, MAX_LLM_INPUT_CHARS) || null;
}

async function extractPlaceNameWithLLM(
  title: string | null,
  description: string | null,
): Promise<LLMExtraction | null> {
  try {
    const safeTitle = sanitizeForLLM(title);
    const safeDescription = sanitizeForLLM(description);

    if (!safeTitle && !safeDescription) return null;

    const data = await retryWithBackoff(async () => {
      const { data: result, error: fnError } = await supabase.functions.invoke('extract-tiktok', {
        body: { title: safeTitle, description: safeDescription },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      return result;
    });

    return data;
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
