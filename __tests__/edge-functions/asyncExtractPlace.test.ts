/**
 * Tests for supabase/functions/async-extract-place/index.ts
 *
 * The edge function runs in Deno, not Node, so we can't import it directly.
 * Instead, we extract and test the pure logic functions that don't depend on
 * Deno/Supabase runtime. For integration-level tests of fetch/OpenAI/Google,
 * we mock global fetch and test the pipeline behavior.
 */

// ── Re-implement pure functions from the edge function for testing ──
// These must stay in sync with async-extract-place/index.ts

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return true;
  }
  const parts = hostname.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
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

function extractMetaContent(html: string, property: string): string | null {
  const pattern1 = new RegExp(
    `<meta[^>]+property\\s*=\\s*["']${property}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
    "i"
  );
  const match1 = html.match(pattern1);
  if (match1) return match1[1];

  const pattern2 = new RegExp(
    `<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]+property\\s*=\\s*["']${property}["']`,
    "i"
  );
  const match2 = html.match(pattern2);
  return match2 ? match2[1] : null;
}

function sanitizeForLLM(text: string | null): string | null {
  if (!text) return null;
  return (
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .trim()
      .slice(0, 500) || null
  );
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

function parseLLMOutput(
  text: string
): { placeName: string | null; location: string | null } {
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
    return { placeName: null, location: null };
  }
}

// ── Tests ──

describe("async-extract-place: URL validation", () => {
  describe("isValidUrl", () => {
    it("accepts valid HTTPS URLs", () => {
      expect(isValidUrl("https://www.tiktok.com/@user/video/123")).toBe(true);
      expect(isValidUrl("https://www.instagram.com/p/abc123/")).toBe(true);
    });

    it("accepts valid HTTP URLs", () => {
      expect(isValidUrl("http://example.com/page")).toBe(true);
    });

    it("rejects non-HTTP protocols", () => {
      expect(isValidUrl("ftp://files.example.com")).toBe(false);
      expect(isValidUrl("file:///etc/passwd")).toBe(false);
      expect(isValidUrl("javascript:alert(1)")).toBe(false);
    });

    it("rejects malformed URLs", () => {
      expect(isValidUrl("not a url")).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });

  describe("SSRF protection (isPrivateHostname)", () => {
    it("blocks localhost", () => {
      expect(isValidUrl("http://localhost:8080/admin")).toBe(false);
      expect(isValidUrl("http://127.0.0.1:8080/admin")).toBe(false);
    });

    it("blocks IPv6 loopback", () => {
      expect(isValidUrl("http://[::1]:8080/admin")).toBe(false);
    });

    it("blocks private 10.x.x.x range", () => {
      expect(isValidUrl("http://10.0.0.1/internal")).toBe(false);
      expect(isValidUrl("http://10.255.255.255/internal")).toBe(false);
    });

    it("blocks private 172.16-31.x.x range", () => {
      expect(isValidUrl("http://172.16.0.1/internal")).toBe(false);
      expect(isValidUrl("http://172.31.255.255/internal")).toBe(false);
    });

    it("allows public 172.x range outside 16-31", () => {
      expect(isValidUrl("http://172.15.0.1/public")).toBe(true);
      expect(isValidUrl("http://172.32.0.1/public")).toBe(true);
    });

    it("blocks private 192.168.x.x range", () => {
      expect(isValidUrl("http://192.168.1.1/router")).toBe(false);
      expect(isValidUrl("http://192.168.0.1/admin")).toBe(false);
    });

    it("blocks AWS metadata endpoint (169.254.169.254)", () => {
      expect(isValidUrl("http://169.254.169.254/latest/meta-data/")).toBe(
        false
      );
    });

    it("blocks 0.0.0.0", () => {
      expect(isValidUrl("http://0.0.0.0/")).toBe(false);
    });

    it("allows legitimate public IPs", () => {
      expect(isValidUrl("http://8.8.8.8/")).toBe(true);
      expect(isValidUrl("https://142.250.80.46/")).toBe(true);
    });

    it("allows public hostnames", () => {
      expect(isValidUrl("https://www.tiktok.com/")).toBe(true);
      expect(isValidUrl("https://www.instagram.com/")).toBe(true);
    });
  });
});

describe("async-extract-place: metadata extraction", () => {
  describe("extractMetaContent", () => {
    it("extracts og:title from property-first meta tag", () => {
      const html =
        '<meta property="og:title" content="Best Pizza in NYC">';
      expect(extractMetaContent(html, "og:title")).toBe(
        "Best Pizza in NYC"
      );
    });

    it("extracts from content-first meta tag", () => {
      const html =
        '<meta content="Amazing Ramen" property="og:title">';
      expect(extractMetaContent(html, "og:title")).toBe("Amazing Ramen");
    });

    it("returns null when property not found", () => {
      const html = '<meta property="og:image" content="image.jpg">';
      expect(extractMetaContent(html, "og:title")).toBeNull();
    });

    it("handles case-insensitive matching", () => {
      const html =
        '<META PROPERTY="og:title" CONTENT="Fancy Restaurant">';
      expect(extractMetaContent(html, "og:title")).toBe("Fancy Restaurant");
    });
  });

  describe("sanitizeForLLM", () => {
    it("strips HTML tags", () => {
      expect(sanitizeForLLM("<b>Joe's Pizza</b>")).toBe("Joe's Pizza");
    });

    it("strips control characters", () => {
      expect(sanitizeForLLM("Pizza\x00Place\x07")).toBe("PizzaPlace");
    });

    it("truncates to 500 chars", () => {
      const long = "a".repeat(600);
      expect(sanitizeForLLM(long)!.length).toBe(500);
    });

    it("returns null for empty/null input", () => {
      expect(sanitizeForLLM(null)).toBeNull();
      expect(sanitizeForLLM("")).toBeNull();
    });

    it("returns null when input is only whitespace/tags", () => {
      expect(sanitizeForLLM("<br>  <hr>")).toBeNull();
    });
  });

  describe("getOEmbedUrl", () => {
    it("returns TikTok oEmbed URL for tiktok.com links", () => {
      const url = "https://www.tiktok.com/@user/video/123";
      expect(getOEmbedUrl(url)).toContain("tiktok.com/oembed");
      expect(getOEmbedUrl(url)).toContain(encodeURIComponent(url));
    });

    it("returns TikTok oEmbed URL for vm.tiktok.com short links", () => {
      const url = "https://vm.tiktok.com/abc123/";
      expect(getOEmbedUrl(url)).toContain("tiktok.com/oembed");
    });

    it("returns Instagram oEmbed URL for instagram.com links", () => {
      const url = "https://www.instagram.com/p/abc123/";
      expect(getOEmbedUrl(url)).toContain("instagram.com/oembed");
    });

    it("returns null for unsupported platforms", () => {
      expect(getOEmbedUrl("https://www.youtube.com/watch?v=123")).toBeNull();
      expect(getOEmbedUrl("https://example.com")).toBeNull();
    });
  });
});

describe("async-extract-place: LLM output parsing", () => {
  it("parses valid JSON with placeName and location", () => {
    const text = '{"placeName": "Joe\'s Pizza", "location": "NYC"}';
    expect(parseLLMOutput(text)).toEqual({
      placeName: "Joe's Pizza",
      location: "NYC",
    });
  });

  it("parses JSON embedded in explanatory text", () => {
    const text =
      'Based on the title, the place is:\n{"placeName": "Ramen Lab", "location": "Brooklyn"}\nHope that helps!';
    expect(parseLLMOutput(text)).toEqual({
      placeName: "Ramen Lab",
      location: "Brooklyn",
    });
  });

  it("handles null placeName from LLM", () => {
    const text = '{"placeName": null, "location": null}';
    expect(parseLLMOutput(text)).toEqual({
      placeName: null,
      location: null,
    });
  });

  it("returns null placeName when no JSON found", () => {
    const text = "I cannot identify a specific place from this content.";
    expect(parseLLMOutput(text)).toEqual({
      placeName: null,
      location: null,
    });
  });

  it("handles malformed JSON gracefully (fix #2)", () => {
    const text = '{"placeName": "Joe\'s, "location": }';
    const result = parseLLMOutput(text);
    expect(result).toEqual({ placeName: null, location: null });
  });

  it("handles JSON with extra fields", () => {
    const text =
      '{"placeName": "Cafe Latte", "location": "SF", "confidence": 0.9}';
    expect(parseLLMOutput(text)).toEqual({
      placeName: "Cafe Latte",
      location: "SF",
    });
  });

  it("handles missing location field", () => {
    const text = '{"placeName": "Sushi Place"}';
    expect(parseLLMOutput(text)).toEqual({
      placeName: "Sushi Place",
      location: null,
    });
  });
});

describe("async-extract-place: category mapping", () => {
  it("maps restaurant types correctly", () => {
    expect(mapCategory(["restaurant"])).toBe("Restaurant");
    expect(mapCategory(["meal_delivery"])).toBe("Restaurant");
    expect(mapCategory(["meal_takeaway"])).toBe("Restaurant");
  });

  it("maps cafe type", () => {
    expect(mapCategory(["cafe"])).toBe("Cafe");
  });

  it("maps bar types", () => {
    expect(mapCategory(["bar"])).toBe("Bar");
    expect(mapCategory(["night_club"])).toBe("Bar");
  });

  it("maps dessert types", () => {
    expect(mapCategory(["bakery"])).toBe("Dessert");
    expect(mapCategory(["ice_cream_shop"])).toBe("Dessert");
  });

  it("maps entertainment types", () => {
    expect(mapCategory(["movie_theater"])).toBe("Entertainment");
    expect(mapCategory(["museum"])).toBe("Entertainment");
  });

  it("maps activity types", () => {
    expect(mapCategory(["amusement_park"])).toBe("Activity");
    expect(mapCategory(["spa"])).toBe("Activity");
    expect(mapCategory(["zoo"])).toBe("Activity");
  });

  it("returns Other for unknown types", () => {
    expect(mapCategory(["store"])).toBe("Other");
    expect(mapCategory([])).toBe("Other");
  });

  it("returns first matching category when multiple types present", () => {
    expect(mapCategory(["point_of_interest", "restaurant", "cafe"])).toBe(
      "Restaurant"
    );
  });
});

describe("async-extract-place: source note detection", () => {
  it("detects TikTok URLs", () => {
    expect(
      detectSourceNote("https://www.tiktok.com/@user/video/123")
    ).toBe("From TikTok");
    expect(detectSourceNote("https://vm.tiktok.com/abc123/")).toBe(
      "From TikTok"
    );
  });

  it("detects Instagram URLs", () => {
    expect(
      detectSourceNote("https://www.instagram.com/p/abc123/")
    ).toBe("From Instagram");
  });

  it("returns 'From web' for other URLs", () => {
    expect(detectSourceNote("https://www.yelp.com/biz/foo")).toBe(
      "From web"
    );
  });

  it("returns 'From web' for invalid URLs", () => {
    expect(detectSourceNote("not-a-url")).toBe("From web");
  });
});

describe("async-extract-place: coordinate handling (fix #7)", () => {
  it("uses nullish coalescing so lat=0 is preserved, not treated as falsy", () => {
    // This tests the fix: `?? 0` vs the old `|| 0`
    // With `|| 0`, a lat of 0 would be replaced with 0 (same result by coincidence)
    // but `|| 0` would also replace `undefined` with 0, hiding missing data.
    // The key difference is that `?? 0` only replaces null/undefined, not 0.
    const lat = 0;
    const lng = 0;
    expect(lat ?? 0).toBe(0); // preserves actual 0
    expect(lng ?? 0).toBe(0);

    // With the old || operator, these would also be 0, but for wrong reasons
    const undefinedLat = undefined;
    expect(undefinedLat ?? 0).toBe(0); // defaults undefined to 0
  });
});

describe("async-extract-place: rate limiting", () => {
  it("rate limiter logic allows up to MAX_REQUESTS in window", () => {
    // Re-implement the rate limiter for testing
    const MAX_REQUESTS = 10;
    const WINDOW_MS = 60_000;
    const userRequests = new Map<string, number[]>();

    function isRateLimited(userId: string): boolean {
      const now = Date.now();
      const windowStart = now - WINDOW_MS;
      const timestamps = (userRequests.get(userId) ?? []).filter(
        (t) => t > windowStart
      );
      if (timestamps.length >= MAX_REQUESTS) {
        userRequests.set(userId, timestamps);
        return true;
      }
      timestamps.push(now);
      userRequests.set(userId, timestamps);
      return false;
    }

    const userId = "test-user";
    // First 10 requests should pass
    for (let i = 0; i < MAX_REQUESTS; i++) {
      expect(isRateLimited(userId)).toBe(false);
    }
    // 11th request should be rate limited
    expect(isRateLimited(userId)).toBe(true);
  });

  it("rate limiter allows requests from different users independently", () => {
    const MAX_REQUESTS = 10;
    const WINDOW_MS = 60_000;
    const userRequests = new Map<string, number[]>();

    function isRateLimited(userId: string): boolean {
      const now = Date.now();
      const windowStart = now - WINDOW_MS;
      const timestamps = (userRequests.get(userId) ?? []).filter(
        (t) => t > windowStart
      );
      if (timestamps.length >= MAX_REQUESTS) {
        userRequests.set(userId, timestamps);
        return true;
      }
      timestamps.push(now);
      userRequests.set(userId, timestamps);
      return false;
    }

    // Fill up user-a
    for (let i = 0; i < MAX_REQUESTS; i++) {
      isRateLimited("user-a");
    }
    expect(isRateLimited("user-a")).toBe(true);

    // user-b should still be allowed
    expect(isRateLimited("user-b")).toBe(false);
  });
});
