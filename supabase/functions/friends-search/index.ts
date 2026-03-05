import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    // Verify the user's JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Missing authorization header" },
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { error: "Invalid or expired token" },
        { status: 401, headers: corsHeaders },
      );
    }

    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return Response.json([], {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanQuery = query.trim();
    if (cleanQuery.length === 0) {
      return Response.json([], {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Search users by username prefix OR display_name match
    const usernameQuery = cleanQuery.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const { data: users, error: searchError } = await serviceClient
      .from("users")
      .select("id, username, display_name, profile_private")
      .is("deleted_at", null)
      .neq("id", user.id)
      .not("username", "is", null)
      .or(`username.ilike.${usernameQuery}%,display_name.ilike.%${cleanQuery}%`)
      .limit(20);

    if (searchError) {
      console.error("[friends-search] Search error:", searchError);
      return Response.json(
        { error: "Search failed" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Get follow status for each result
    const userIds = (users ?? []).map((u: any) => u.id);
    let followMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: follows } = await serviceClient
        .from("follows")
        .select("following_id, status")
        .eq("follower_id", user.id)
        .in("following_id", userIds);

      for (const f of follows ?? []) {
        followMap[f.following_id] = f.status;
      }
    }

    // Sort: username prefix matches first, then name matches
    const sorted = (users ?? []).sort((a: any, b: any) => {
      const aUsername = a.username?.startsWith(usernameQuery) ? 0 : 1;
      const bUsername = b.username?.startsWith(usernameQuery) ? 0 : 1;
      return aUsername - bUsername;
    });

    const results = sorted.map((u: any) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      profile_private: u.profile_private,
      follow_status: followMap[u.id] ?? "none",
    }));

    return Response.json(results, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[friends-search] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
