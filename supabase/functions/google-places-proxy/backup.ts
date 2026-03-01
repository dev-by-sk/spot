import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY")!;
const GOOGLE_BASE = "https://maps.googleapis.com/maps/api/place";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// In-memory per-user rate limiting (sliding window)
const MAX_REQUESTS = 30;
const WINDOW_MS = 60_000;
const userRequests = new Map<string, number[]>();

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Missing authorization header" },
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { error: "Invalid or expired token" },
        { status: 401, headers: corsHeaders },
      );
    }

    // Per-user rate limiting
    if (isRateLimited(user.id)) {
      return Response.json(
        { error: "Too many requests — please slow down and try again" },
        { status: 429, headers: corsHeaders },
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    switch (path) {
      case "autocomplete": {
        const query = url.searchParams.get("query");
        if (!query) {
          return Response.json(
            { error: "query parameter required" },
            { status: 400, headers: corsHeaders },
          );
        }

        let googleUrl = `${GOOGLE_BASE}/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment&key=${GOOGLE_API_KEY}`;
        const lat = url.searchParams.get("lat");
        const lng = url.searchParams.get("lng");
        if (lat && lng) {
          googleUrl += `&location=${lat},${lng}&radius=50000`;
        }
        const res = await fetch(googleUrl);
        const data = await res.json();

        const results = (data.predictions || []).map((p: any) => ({
          id: p.place_id,
          name: p.structured_formatting?.main_text || p.description,
          address: p.structured_formatting?.secondary_text || "",
          category: "",
        }));

        return Response.json(results, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "details": {
        const placeId = url.searchParams.get("place_id");
        if (!placeId) {
          return Response.json(
            { error: "place_id parameter required" },
            { status: 400, headers: corsHeaders },
          );
        }

        const fields =
          "place_id,name,formatted_address,geometry,rating,price_level,types";
        const googleUrl = `${GOOGLE_BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`;
        const res = await fetch(googleUrl);
        const data = await res.json();
        const r = data.result;

        if (!r) {
          return Response.json(
            { error: "Place not found" },
            { status: 404, headers: corsHeaders },
          );
        }

        const result = {
          googlePlaceId: r.place_id,
          name: r.name || "",
          address: r.formatted_address || "",
          lat: r.geometry?.location?.lat || 0,
          lng: r.geometry?.location?.lng || 0,
          rating: r.rating || 0,
          priceLevel: r.price_level || 0,
          types: r.types || [],
          category: mapCategory(r.types || []),
          cuisine: mapCuisine(r.types || []),
        };

        return Response.json(result, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "search": {
        const query = url.searchParams.get("query");
        if (!query) {
          return Response.json(
            { error: "query parameter required" },
            { status: 400, headers: corsHeaders },
          );
        }

        let googleUrl = `${GOOGLE_BASE}/textsearch/json?query=${encodeURIComponent(query)}&type=establishment&key=${GOOGLE_API_KEY}`;
        const lat = url.searchParams.get("lat");
        const lng = url.searchParams.get("lng");
        if (lat && lng) {
          googleUrl += `&location=${lat},${lng}&radius=50000`;
        }

        const res = await fetch(googleUrl);
        const data = await res.json();

        const results = (data.results || []).slice(0, 5).map((r: any) => ({
          id: r.place_id,
          name: r.name,
          address: r.formatted_address || "",
          category: mapCategory(r.types || []),
        }));

        return Response.json(results, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return Response.json(
          { error: "Unknown endpoint" },
          { status: 404, headers: corsHeaders },
        );
    }
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders },
    );
  }
});

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
