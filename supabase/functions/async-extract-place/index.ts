import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Environment variables ---
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GOOGLE_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api/place";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// --- Rate limiting (sliding window, in-memory) ---
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;
const userRequests = new Map<string, number[]>();

setInterval(() => {
  const windowStart = Date.now() - WINDOW_MS;
  for (const [userId, timestamps] of userRequests) {
    if (timestamps.every((t) => t <= windowStart)) {
      userRequests.delete(userId);
    }
  }
}, WINDOW_MS);

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const timestamps = (userRequests.get(userId) ?? []).filter(
    (t) => t > windowStart,
  );

  if (timestamps.length >= MAX_REQUESTS) {
    userRequests.set(userId, timestamps);
    return true;
  }

  timestamps.push(now);
  userRequests.set(userId, timestamps);
  return false;
}

// --- LLM prompt ---
const SYSTEM_PROMPT = `You extract restaurant/cafe/bar names from social media post metadata.

Given the title and description from a TikTok, Instagram, or YouTube post, extract the name of the restaurant, cafe, bar, or food place mentioned.

Rules:
- Return ONLY a JSON object: {"placeName": "...", "location": "..."}
- "placeName" is the business name (e.g. "Joe's Pizza")
- "location" is the city/neighborhood if mentioned (e.g. "NYC", "Brooklyn"), or null if unknown
- If no specific place can be identified, return {"placeName": null, "location": null}
- Do NOT guess or hallucinate. If the text is vague (e.g. "best food ever"), return null.
- Strip hashtags, emojis, and filler words to find the actual place name.`;

// --- Supabase clients ---
function getAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// --- Metadata extraction helpers ---
const FETCH_TIMEOUT_MS = 5_000;
const MAX_HTML_BYTES = 1_048_576; // 1 MB
const MAX_LLM_INPUT_CHARS = 500;

interface PageMetadata {
  title: string | null;
  description: string | null;
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

async function fetchOEmbed(oEmbedUrl: string): Promise<PageMetadata | null> {
  try {
    const response = await fetch(oEmbedUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const title = data.title || null;
    const description = data.author_name ? `by ${data.author_name}` : null;
    if (!title && !description) return null;
    return { title, description };
  } catch (error) {
    console.warn("[async-extract] oEmbed fetch failed:", error);
    return null;
  }
}

function extractMetaContent(html: string, property: string): string | null {
  const pattern1 = new RegExp(
    `<meta[^>]+property\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const match1 = html.match(pattern1);
  if (match1) return match1[1];

  const pattern2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+property\\s*=\\s*["']${property}["']`,
    "i",
  );
  const match2 = html.match(pattern2);
  return match2 ? match2[1] : null;
}

async function fetchPageMetadata(url: string): Promise<PageMetadata | null> {
  // Try oEmbed first for supported platforms
  const oEmbedUrl = getOEmbedUrl(url);
  if (oEmbedUrl) {
    const oEmbedResult = await fetchOEmbed(oEmbedUrl);
    if (oEmbedResult) return oEmbedResult;
  }

  // Fallback: scrape HTML metadata
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      },
    });

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_HTML_BYTES) {
      return null;
    }

    const raw = await response.text();
    const html =
      raw.length > MAX_HTML_BYTES ? raw.slice(0, MAX_HTML_BYTES) : raw;

    const ogTitle = extractMetaContent(html, "og:title");
    const ogDesc = extractMetaContent(html, "og:description");
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const title = ogTitle ?? (titleTag ? titleTag[1].trim() : null);
    const description = ogDesc ?? null;

    if (!title && !description) return null;
    return { title, description };
  } catch (error) {
    console.warn("[async-extract] Failed to fetch URL:", error);
    return null;
  }
}

function sanitizeForLLM(text: string | null): string | null {
  if (!text) return null;
  return (
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .trim()
      .slice(0, MAX_LLM_INPUT_CHARS) || null
  );
}

// --- OpenAI call ---
interface LLMExtraction {
  placeName: string | null;
  location: string | null;
}

async function callOpenAI(
  title: string | null,
  description: string | null,
): Promise<LLMExtraction> {
  const safeTitle = sanitizeForLLM(title);
  const safeDescription = sanitizeForLLM(description);

  if (!safeTitle && !safeDescription) {
    return { placeName: null, location: null };
  }

  const userMessage = [
    safeTitle ? `Title: ${safeTitle}` : "",
    safeDescription ? `Description: ${safeDescription}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 150,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { placeName: null, location: null };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      placeName: parsed.placeName ?? null,
      location: parsed.location ?? null,
    };
  } catch {
    console.warn(
      "[async-extract] Failed to parse LLM JSON output:",
      jsonMatch[0],
    );
    return { placeName: null, location: null };
  }
}

// --- Google Places helpers ---
async function searchGooglePlaces(query: string): Promise<string | null> {
  const googleUrl = `${GOOGLE_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=establishment&key=${GOOGLE_API_KEY}`;
  const res = await fetch(googleUrl);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(
      `Google Places search error: ${data.status} — ${data.error_message ?? ""}`,
    );
  }
  const results = data.results || [];
  return results.length > 0 ? results[0].place_id : null;
}

interface PlaceDetails {
  google_place_id: string;
  place_name: string;
  place_address: string;
  place_lat: number;
  place_lng: number;
  place_rating: number;
  place_price_level: number;
  place_category: string;
  place_cuisine: string;
  place_website: string | null;
  place_phone_number: string | null;
  place_opening_hours: string[] | null;
  place_opening_hours_periods: Record<string, unknown>[] | null;
}

async function getGooglePlaceDetails(placeId: string): Promise<PlaceDetails> {
  const fields =
    "place_id,name,formatted_address,geometry,rating,price_level,types,website,formatted_phone_number,opening_hours";
  const googleUrl = `${GOOGLE_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
  const res = await fetch(googleUrl);
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(
      `Google Places details error: ${data.status} — ${data.error_message ?? ""}`,
    );
  }

  const r = data.result;
  if (!r) {
    throw new Error("Place not found in Google Places");
  }

  return {
    google_place_id: r.place_id,
    place_name: r.name || "",
    place_address: r.formatted_address || "",
    place_lat: r.geometry?.location?.lat ?? 0,
    place_lng: r.geometry?.location?.lng ?? 0,
    place_rating: r.rating || 0,
    place_price_level: r.price_level || 0,
    place_category: mapCategory(r.types || []),
    place_cuisine: mapCuisine(r.types || []),
    place_website: r.website || null,
    place_phone_number: r.formatted_phone_number || null,
    place_opening_hours: r.opening_hours?.weekday_text || null,
    place_opening_hours_periods: r.opening_hours?.periods ?? null,
  };
}

function mapCategory(types: string[]): string {
  for (const type of types) {
    if (["restaurant", "meal_delivery", "meal_takeaway"].includes(type))
      return "Restaurant";
    if (type === "cafe") return "Cafe";
    if (["bar", "night_club"].includes(type)) return "Bar";
    if (["bakery", "ice_cream_shop"].includes(type)) return "Dessert";
    if (type === "gym") return "Gym";
    if (["movie_theater", "museum", "performing_arts_theater"].includes(type))
      return "Entertainment";
    if (
      [
        "amusement_park",
        "bowling_alley",
        "park",
        "spa",
        "stadium",
        "tourist_attraction",
        "zoo",
      ].includes(type)
    )
      return "Activity";
  }
  return "Other";
}

function mapCuisine(types: string[]): string {
  const cuisineTypes: Record<string, string> = {
    japanese_restaurant: "Japanese",
    chinese_restaurant: "Chinese",
    italian_restaurant: "Italian",
    mexican_restaurant: "Mexican",
    indian_restaurant: "Indian",
    thai_restaurant: "Thai",
    korean_restaurant: "Korean",
    vietnamese_restaurant: "Vietnamese",
    french_restaurant: "French",
    mediterranean_restaurant: "Mediterranean",
    american_restaurant: "American",
    pizza_restaurant: "Pizza",
    seafood_restaurant: "Seafood",
    steak_house: "Steakhouse",
    sushi_restaurant: "Sushi",
    ramen_restaurant: "Ramen",
    hamburger_restaurant: "Burgers",
  };

  for (const type of types) {
    if (cuisineTypes[type]) return cuisineTypes[type];
  }
  return "";
}

// --- Database helpers ---
function detectSourceNote(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("tiktok.com")) return "From TikTok";
    if (hostname.includes("instagram.com")) return "From Instagram";
    return "From web";
  } catch {
    return "From web";
  }
}

async function checkDuplicateSavedPlace(
  client: ReturnType<typeof createClient>,
  userId: string,
  googlePlaceId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("saved_places")
    .select("id")
    .eq("user_id", userId)
    .eq("google_place_id", googlePlaceId)
    .maybeSingle();

  if (error) {
    console.error("[async-extract] Duplicate check error:", error);
    return false;
  }

  return data !== null;
}

async function upsertPlaceCache(
  client: ReturnType<typeof createClient>,
  placeData: PlaceDetails,
): Promise<void> {
  const { error } = await client.from("place_cache").upsert(
    {
      google_place_id: placeData.google_place_id,
      name: placeData.place_name,
      address: placeData.place_address,
      lat: placeData.place_lat,
      lng: placeData.place_lng,
      rating: placeData.place_rating,
      price_level: placeData.place_price_level,
      category: placeData.place_category,
      cuisine: placeData.place_cuisine,
      website: placeData.place_website,
      phone_number: placeData.place_phone_number,
      opening_hours: placeData.place_opening_hours
        ? JSON.stringify(placeData.place_opening_hours)
        : null,
      opening_hours_periods: placeData.place_opening_hours_periods
        ? JSON.stringify(placeData.place_opening_hours_periods)
        : null,
      last_refreshed: new Date().toISOString(),
    },
    { onConflict: "google_place_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert place_cache: ${error.message}`);
  }
}

async function insertSavedPlace(
  client: ReturnType<typeof createClient>,
  userId: string,
  googlePlaceId: string,
  noteText: string,
): Promise<void> {
  const { error } = await client.from("saved_places").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    google_place_id: googlePlaceId,
    note_text: noteText,
    date_visited: null,
    saved_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to insert saved_place: ${error.message}`);
  }
}

// --- URL validation ---
function isPrivateHostname(hostname: string): boolean {
  // Block localhost
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return true;
  }
  // Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x)
  const parts = hostname.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // cloud metadata
    if (parts[0] === 0) return true;
  }
  return false;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (isPrivateHostname(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// --- Main handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Parse request body (needed for both auth refresh and URL extraction)
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid request body" },
        { status: 400, headers: corsHeaders },
      );
    }

    // 2. JWT validation (with refresh token fallback)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Missing authorization header" },
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = getAnonClient();

    let user: { id: string } | null = null;
    let newTokens: { accessToken: string; refreshToken: string } | null = null;

    const {
      data: { user: tokenUser },
      error: authError,
    } = await anonClient.auth.getUser(token);

    if (!authError && tokenUser) {
      user = tokenUser;
    } else {
      // Access token expired — attempt refresh
      const refreshToken =
        typeof body.refreshToken === "string" ? body.refreshToken : null;

      if (!refreshToken) {
        return Response.json(
          { error: "Token expired — open spot. to refresh your session" },
          { status: 401, headers: corsHeaders },
        );
      }

      const refreshClient = getAnonClient();
      const { data: refreshData, error: refreshError } =
        await refreshClient.auth.refreshSession({
          refresh_token: refreshToken,
        });

      if (refreshError || !refreshData?.user || !refreshData?.session) {
        return Response.json(
          { error: "Session expired — open spot. to sign in again" },
          { status: 401, headers: corsHeaders },
        );
      }

      user = refreshData.user;
      newTokens = {
        accessToken: refreshData.session!.access_token,
        refreshToken: refreshData.session!.refresh_token,
      };
      console.log(
        `[async-extract] Refreshed expired token for user ${user.id}`,
      );
    }

    // 3. Rate limit check
    if (isRateLimited(user.id)) {
      return Response.json(
        { error: "Too many requests — please slow down and try again" },
        { status: 429, headers: corsHeaders },
      );
    }

    // 4. Validate URL
    const sourceUrl = body.url;

    if (!sourceUrl || typeof sourceUrl !== "string" || !isValidUrl(sourceUrl)) {
      return Response.json(
        { error: "Invalid or missing URL" },
        { status: 400, headers: corsHeaders },
      );
    }

    // 5. Validate env vars
    if (!OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    if (!GOOGLE_API_KEY) {
      return Response.json(
        { error: "GOOGLE_PLACES_API_KEY not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    const serviceClient = getServiceClient();

    // 6. Run full pipeline in the background — return immediately so the
    //    share extension can dismiss and the user keeps scrolling.
    const pipelinePromise = (async () => {
      try {
        // a. Fetch page metadata
        const metadata = await fetchPageMetadata(sourceUrl);
        if (!metadata) {
          throw new Error("Could not fetch metadata from URL");
        }

        // b. LLM extraction
        const extracted = await callOpenAI(
          metadata.title,
          metadata.description,
        );
        if (!extracted.placeName) {
          throw new Error("LLM could not identify a place from the metadata");
        }

        // c. Build search query
        const query = extracted.location
          ? `${extracted.placeName} ${extracted.location}`
          : extracted.placeName;

        // d. Search Google Places
        const placeId = await searchGooglePlaces(query);
        if (!placeId) {
          throw new Error(`No Google Places results for: ${query}`);
        }

        // e. Get full place details
        const placeData = await getGooglePlaceDetails(placeId);

        // f. Check for duplicate in saved_places
        const isDuplicate = await checkDuplicateSavedPlace(
          serviceClient,
          user.id,
          placeData.google_place_id,
        );
        if (isDuplicate) {
          console.log(
            `[async-extract] Skipping duplicate: ${placeData.place_name} (${placeData.google_place_id})`,
          );
          return;
        }

        // g. Upsert place_cache and insert saved_place
        const noteText = detectSourceNote(sourceUrl);
        await upsertPlaceCache(serviceClient, placeData);
        await insertSavedPlace(
          serviceClient,
          user.id,
          placeData.google_place_id,
          noteText,
        );

        console.log(
          `[async-extract] Saved: ${placeData.place_name} for user ${user.id}`,
        );
      } catch (pipelineError) {
        const errorMsg =
          pipelineError instanceof Error
            ? pipelineError.message
            : "Unknown pipeline error";
        console.error("[async-extract] Pipeline error:", errorMsg);
      }
    })();

    // Keep the edge function alive until the pipeline finishes, but return
    // the HTTP response now so the client isn't blocked.
    // @ts-ignore — EdgeRuntime is a Supabase global, not in Deno typings
    EdgeRuntime.waitUntil(pipelinePromise);

    // 7. Return immediately (include new tokens if a refresh occurred)
    const responseBody: Record<string, unknown> = { queued: true };
    if (newTokens) {
      responseBody.newTokens = newTokens;
    }
    return Response.json(responseBody, { headers: corsHeaders });
  } catch (error) {
    console.error("[async-extract] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
