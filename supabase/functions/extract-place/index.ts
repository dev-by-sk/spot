import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

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

    if (!OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
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
        { status: 502 }
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";

    // Parse the JSON from the response
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
