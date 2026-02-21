import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

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
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { title, description } = await req.json();

    if (!title && !description) {
      return Response.json({ placeName: null, location: null });
    }

    if (!ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const userMessage = [
      title ? `Title: ${title}` : "",
      description ? `Description: ${description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[extract-place] Anthropic API error:", err);
      return Response.json(
        { error: "LLM request failed" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    // Parse the JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ placeName: null, location: null });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json({
      placeName: parsed.placeName ?? null,
      location: parsed.location ?? null,
    });
  } catch (error) {
    console.error("[extract-place] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
});
