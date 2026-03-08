import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify JWT
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query } = await req.json();
    if (!query || !query.trim()) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const q = query.trim();
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Username prefix match (higher priority)
    const { data: usernameMatches } = await serviceClient
      .from("users")
      .select("id, username, display_name, profile_private")
      .ilike("username", `${q}%`)
      .neq("id", user.id)
      .is("deleted_at", null)
      .limit(10);

    // Display name contains match
    const { data: nameMatches } = await serviceClient
      .from("users")
      .select("id, username, display_name, profile_private")
      .ilike("display_name", `%${q}%`)
      .neq("id", user.id)
      .is("deleted_at", null)
      .limit(10);

    // Deduplicate — username matches first
    const seen = new Set<string>();
    const combined: any[] = [];
    for (const u of [...(usernameMatches ?? []), ...(nameMatches ?? [])]) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        combined.push(u);
      }
    }
    const results = combined.slice(0, 20);

    if (results.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch follow statuses
    const resultIds = results.map((u: any) => u.id);
    const { data: follows } = await serviceClient
      .from("follows")
      .select("following_id, status")
      .eq("follower_id", user.id)
      .in("following_id", resultIds);

    const followMap = new Map<string, string>();
    for (const f of follows ?? []) {
      followMap.set(f.following_id, f.status);
    }

    const withFollowState = results.map((u: any) => ({
      ...u,
      follow_status: followMap.get(u.id) ?? "none",
    }));

    return new Response(JSON.stringify(withFollowState), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
