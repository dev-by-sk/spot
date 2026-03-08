import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import type { UserProfilePublic, UserWithFollowState, FollowRequest, FollowStatus } from '../types/social';

export async function followUser(userId: string): Promise<'accepted' | 'pending'> {
  const { data, error } = await supabase.rpc('follow_user', { target_user_id: userId });
  if (error) throw error;
  return data as 'accepted' | 'pending';
}

export async function unfollowUser(userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', userId);
  if (error) throw error;
}

export async function getFollowStatus(userId: string): Promise<FollowStatus> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'none';
  const { data, error } = await supabase
    .from('follows')
    .select('status')
    .eq('follower_id', user.id)
    .eq('following_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return 'none';
  return data.status as FollowStatus;
}

export async function getFollowRequests(): Promise<FollowRequest[]> {
  const { data, error } = await supabase.rpc('get_pending_follow_requests');
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    follower: {
      id: row.follower_id,
      username: row.username,
      display_name: row.display_name,
      profile_private: row.profile_private,
    } as UserProfilePublic,
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

export async function getFollowers(): Promise<UserProfilePublic[]> {
  const { data, error } = await supabase.rpc('get_followers');
  if (error) throw error;
  return (data ?? []) as UserProfilePublic[];
}

export async function getFollowing(): Promise<UserProfilePublic[]> {
  const { data, error } = await supabase.rpc('get_following');
  if (error) throw error;
  return (data ?? []) as UserProfilePublic[];
}

export async function getUserFollowers(userId: string): Promise<UserProfilePublic[]> {
  const { data, error } = await supabase.rpc('get_user_followers', { target_user_id: userId });
  if (error) throw error;
  return (data ?? []) as UserProfilePublic[];
}

export async function getUserFollowing(userId: string): Promise<UserProfilePublic[]> {
  const { data, error } = await supabase.rpc('get_user_following', { target_user_id: userId });
  if (error) throw error;
  return (data ?? []) as UserProfilePublic[];
}

export async function getSocialCounts(userId: string): Promise<{ followers_count: number; following_count: number }> {
  const { data, error } = await supabase.rpc('get_social_counts', { target_user_id: userId });
  if (error) throw error;
  return data as { followers_count: number; following_count: number };
}

export async function searchUsers(query: string, signal?: AbortSignal): Promise<UserWithFollowState[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const response = await fetch(`${SUPABASE_URL}/functions/v1/friends-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!response.ok) throw new Error('Search failed');
  return response.json() as Promise<UserWithFollowState[]>;
}

export async function setProfilePrivacy(isPrivate: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase
    .from('users')
    .update({ profile_private: isPrivate })
    .eq('id', user.id);
  if (error) throw error;
}
