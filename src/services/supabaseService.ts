import { supabase } from "../config/supabase";
import type {
  UserSession,
  UserProfile,
  SavedPlaceDTO,
  PlaceCacheDTO,
} from "../types";

// ── Auth ──

export async function getCurrentSession(): Promise<UserSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  const user = data.session.user;
  return {
    userId: user.id,
    email: user.email ?? null,
    provider: (user.app_metadata?.provider as string) ?? "",
  };
}

export async function signInWithGoogle(
  idToken: string,
  accessToken: string,
): Promise<string> {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    access_token: accessToken,
  });
  if (error) throw error;
  return data.user.id;
}

export async function signOut(): Promise<void> {
  // signOut clears the local session regardless of network; server-side
  // token invalidation may fail offline but the caller handles that gracefully.
  await supabase.auth.signOut();
}

// ── Account Management ──

export async function softDeleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_account");
  if (error) throw error;
  await signOut();
}

export async function cancelDeleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("cancel_delete_account");
  if (error) throw error;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const userId = sessionData.session.user.id;
  const { data, error } = await supabase
    .from("users")
    .select()
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as UserProfile;
}

// ── Saved Places ──

export async function fetchSavedPlaces(): Promise<SavedPlaceDTO[]> {
  const { data, error } = await supabase
    .from("saved_places")
    .select("*, place_cache(*)")
    .order("saved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedPlaceDTO[];
}

export async function uploadSavedPlace(
  place: Omit<SavedPlaceDTO, "place_cache">,
): Promise<void> {
  const { error } = await supabase.from("saved_places").upsert(place);
  if (error) throw error;
}

export async function updateSavedPlaceNote(
  id: string,
  note: string,
  dateVisited?: string | null,
): Promise<void> {
  const updateData: Record<string, unknown> = { note_text: note };
  if (dateVisited !== undefined) {
    updateData.date_visited = dateVisited;
  }
  const { error } = await supabase
    .from("saved_places")
    .update(updateData)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSavedPlace(id: string): Promise<void> {
  const { error } = await supabase.from("saved_places").delete().eq("id", id);
  if (error) throw error;
}

// ── Place Cache ──

export async function upsertPlaceCache(place: PlaceCacheDTO): Promise<void> {
  const { error } = await supabase.from("place_cache").upsert(place);
  if (error) throw error;
}
