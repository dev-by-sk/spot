import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// In-memory per-user rate limiting (sliding window)
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;
const userRequests = new Map<string, number[]>();

// Periodic cleanup — remove entries with no recent requests to prevent unbounded growth
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

const SYSTEM_PROMPT = `You extract restaurant/cafe/bar names from social media post metadata.

Given the title and description from a TikTok, Instagram, or YouTube post, extract the name of the restaurant, cafe, bar, or food place mentioned.

Rules:
- Return ONLY a JSON object: {"placeName": "...", "location": "..."}
- "placeName" is the business name (e.g. "Joe's Pizza")
- "location" is the city/neighborhood if mentioned (e.g. "NYC", "Brooklyn"), or null if unknown
- If no specific place can be identified, return {"placeName": null, "location": null}
- Do NOT guess or hallucinate. If the text is vague (e.g. "best food ever"), return null.
- Strip hashtags, emojis, and filler words to find the actual place name.`;

serve(async (req) => {
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

    const { title, description } = await req.json();

    if (!title && !description) {
      return Response.json(
        { placeName: null, location: null },
        { headers: corsHeaders },
      );
    }

    if (!OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    const userMessage = [
      title ? `Title: ${title}` : "",
      description ? `Description: ${description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
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
      console.error("[extract-place] OpenAI API error:", err);
      return Response.json(
        { error: "LLM request failed" },
        { status: 502, headers: corsHeaders },
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";

    // Parse the JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json(
        { placeName: null, location: null },
        { headers: corsHeaders },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json(
      {
        placeName: parsed.placeName ?? null,
        location: parsed.location ?? null,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[extract-place] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
