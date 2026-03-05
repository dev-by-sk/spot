import { supabase } from '../config/supabase';
import type {
  UserProfilePublic,
  UserWithFollowState,
  FollowRequest,
  FollowStatus,
  SocialIndicatorUser,
} from '../types/social';

// ── Username ──

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_username_available', {
    desired_username: username,
  });

  if (error) {
    // Fallback: if RPC doesn't exist, check directly
    if (error.message?.includes('function') || error.code === '42883') {
      const { data: users, error: queryError } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .limit(1);
      if (queryError) throw queryError;
      return (users ?? []).length === 0;
    }
    throw error;
  }
  return data as boolean;
}

export async function setUsername(
  newUsername: string,
  firstName?: string,
  lastName?: string,
): Promise<void> {
  // Try RPC first (validates format + uniqueness server-side)
  const { error } = await supabase.rpc('set_username', {
    new_username: newUsername,
    p_first_name: firstName || null,
    p_last_name: lastName || null,
  });

  if (error) {
    // Fallback: if RPC doesn't exist yet, update the row directly
    if (error.message?.includes('function') || error.code === '42883') {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Not authenticated');

      const displayName = [firstName, lastName].filter(Boolean).join(' ') || null;
      const { error: updateError } = await supabase
        .from('users')
        .update({
          username: newUsername,
          first_name: firstName || null,
          last_name: lastName || null,
          display_name: displayName,
        })
        .eq('id', sessionData.session.user.id);
      if (updateError) throw updateError;
      return;
    }
    throw error;
  }
}

// ── Search ──

export async function searchUsers(query: string): Promise<UserWithFollowState[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke('friends-search', {
    body: { query },
  });
  if (error) throw error;
  return (data ?? []) as UserWithFollowState[];
}

// ── Follow ──

export async function followUser(userId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('Not authenticated');

  // Determine status based on target user's privacy setting
  const { data: targetUser } = await supabase
    .from('users')
    .select('profile_private')
    .eq('id', userId)
    .single();

  const status = targetUser?.profile_private ? 'pending' : 'accepted';

  const { error } = await supabase
    .from('follows')
    .insert({
      follower_id: sessionData.session.user.id,
      following_id: userId,
      status,
    });
  if (error) throw error;
}

export async function unfollowUser(userId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', sessionData.session.user.id)
    .eq('following_id', userId);
  if (error) throw error;
}

export async function getFollowStatus(userId: string): Promise<FollowStatus> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return 'none';

  const { data, error } = await supabase
    .from('follows')
    .select('status')
    .eq('follower_id', sessionData.session.user.id)
    .eq('following_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return 'none';
  return data.status as FollowStatus;
}

// ── Requests ──

export async function getFollowRequests(): Promise<FollowRequest[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];

  const { data, error } = await supabase
    .from('follows')
    .select('id, created_at, follower:follower_id(id, username, display_name, profile_private)')
    .eq('following_id', sessionData.session.user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    follower: row.follower as UserProfilePublic,
    created_at: row.created_at,
  }));
}

export async function acceptFollowRequest(followId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('id', followId);
  if (error) throw error;
}

export async function rejectFollowRequest(followId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('id', followId);
  if (error) throw error;
}

// ── Lists ──

export async function getFollowing(): Promise<UserProfilePublic[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];

  const { data, error } = await supabase
    .from('follows')
    .select('following:following_id(id, username, display_name, profile_private)')
    .eq('follower_id', sessionData.session.user.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => row.following as UserProfilePublic);
}

export async function getFollowers(): Promise<UserProfilePublic[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return [];

  const { data, error } = await supabase
    .from('follows')
    .select('follower:follower_id(id, username, display_name, profile_private)')
    .eq('following_id', sessionData.session.user.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => row.follower as UserProfilePublic);
}

// ── Friend Places ──

export async function getFriendPlaces(userId: string): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke('friend-places', {
    body: { user_id: userId },
  });
  if (error) throw error;
  return (data ?? []) as any[];
}

// ── Social Indicators ──

export async function getSocialIndicators(
  googlePlaceIds: string[],
): Promise<Record<string, SocialIndicatorUser[]>> {
  if (googlePlaceIds.length === 0) return {};

  const { data, error } = await supabase.functions.invoke('social-indicators', {
    body: { google_place_ids: googlePlaceIds },
  });
  if (error) throw error;
  return (data ?? {}) as Record<string, SocialIndicatorUser[]>;
}

// ── Counts ──

export async function getSocialCounts(
  userId: string,
): Promise<{ followers_count: number; following_count: number }> {
  const { data, error } = await supabase.rpc('get_social_counts', {
    target_user_id: userId,
  });
  if (error) throw error;
  return data as { followers_count: number; following_count: number };
}

// ── Privacy ──

export async function setProfilePrivacy(isPrivate: boolean): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('users')
    .update({ profile_private: isPrivate })
    .eq('id', sessionData.session.user.id);
  if (error) throw error;
}
