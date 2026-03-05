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

    const { user_id, cursor, limit: rawLimit = 50 } = await req.json();
    const limit = Math.min(Math.max(1, Number(rawLimit) || 50), 50);
    if (!user_id || typeof user_id !== "string") {
      return Response.json(
        { error: "user_id required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if target user is private
    const { data: targetUser, error: userError } = await serviceClient
      .from("users")
      .select("id, profile_private, deleted_at")
      .eq("id", user_id)
      .single();

    if (userError || !targetUser || targetUser.deleted_at) {
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    // If private, check that requester is an accepted follower
    if (targetUser.profile_private && user.id !== user_id) {
      const { data: follow } = await serviceClient
        .from("follows")
        .select("status")
        .eq("follower_id", user.id)
        .eq("following_id", user_id)
        .eq("status", "accepted")
        .maybeSingle();

      if (!follow) {
        return Response.json(
          { error: "This account is private" },
          { status: 403, headers: corsHeaders },
        );
      }
    }

    // Fetch saved places with place_cache, strip notes
    let query = serviceClient
      .from("saved_places")
      .select("id, user_id, google_place_id, date_visited, saved_at, place_cache(*)")
      .eq("user_id", user_id)
      .order("saved_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt("saved_at", cursor);
    }

    const { data: places, error: placesError } = await query;

    if (placesError) {
      console.error("[friend-places] Query error:", placesError);
      return Response.json(
        { error: "Failed to fetch places" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Return places with note_text stripped to empty string
    const results = (places ?? []).map((p: any) => ({
      ...p,
      note_text: "",
    }));

    return Response.json(results, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[friend-places] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders },
    );
  }
});
