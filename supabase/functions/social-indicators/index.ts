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

    const { google_place_ids } = await req.json();
    if (
      !Array.isArray(google_place_ids) ||
      google_place_ids.length === 0
    ) {
      return Response.json(
        {},
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Limit to 200 place IDs per request, ensure all are strings
    const ids = google_place_ids
      .slice(0, 200)
      .filter((id: unknown) => typeof id === "string" && id.length > 0);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get the user's accepted following list
    const { data: following } = await serviceClient
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id)
      .eq("status", "accepted");

    const followingIds = (following ?? []).map((f: any) => f.following_id);

    if (followingIds.length === 0) {
      return Response.json(
        {},
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find which friends saved which places
    const { data: friendSaves, error: savesError } = await serviceClient
      .from("saved_places")
      .select("google_place_id, user_id")
      .in("google_place_id", ids)
      .in("user_id", followingIds);

    if (savesError) {
      console.error("[social-indicators] Query error:", savesError);
      return Response.json(
        { error: "Query failed" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Get usernames for the friends who saved places
    const uniqueUserIds = [
      ...new Set((friendSaves ?? []).map((s: any) => s.user_id)),
    ];

    let userMap: Record<string, { user_id: string; username: string; display_name: string | null }> = {};

    if (uniqueUserIds.length > 0) {
      const { data: users } = await serviceClient
        .from("users")
        .select("id, username, display_name")
        .in("id", uniqueUserIds);

      for (const u of users ?? []) {
        userMap[u.id] = {
          user_id: u.id,
          username: u.username,
          display_name: u.display_name,
        };
      }
    }

    // Build result: Record<google_place_id, Array<{user_id, username, display_name}>>
    const result: Record<string, any[]> = {};
    for (const save of friendSaves ?? []) {
      const userInfo = userMap[save.user_id];
      if (!userInfo) continue;

      if (!result[save.google_place_id]) {
        result[save.google_place_id] = [];
      }
      result[save.google_place_id].push(userInfo);
    }

    return Response.json(result, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[social-indicators] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
