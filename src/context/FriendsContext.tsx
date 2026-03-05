import React, { createContext, useState, useCallback, useContext, useRef } from 'react';
import type { UserProfilePublic, FollowStatus, SocialIndicatorUser } from '../types/social';
import * as FriendsService from '../services/friendsService';

export interface FriendsContextValue {
  following: UserProfilePublic[];
  pendingRequestCount: number;
  socialIndicators: Record<string, SocialIndicatorUser[]>;
  optimisticFollowState: Record<string, FollowStatus>;
  isLoadingFollowing: boolean;
  mutualCount: number;
  follow: (user: UserProfilePublic) => Promise<void>;
  unfollow: (userId: string) => Promise<void>;
  refreshFollowing: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  fetchSocialIndicators: (googlePlaceIds: string[]) => Promise<void>;
}

export const FriendsContext = createContext<FriendsContextValue>({
  following: [],
  pendingRequestCount: 0,
  socialIndicators: {},
  optimisticFollowState: {},
  isLoadingFollowing: false,
  mutualCount: 0,
  follow: async () => {},
  unfollow: async () => {},
  refreshFollowing: async () => {},
  refreshPendingCount: async () => {},
  fetchSocialIndicators: async () => {},
});

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const [following, setFollowing] = useState<UserProfilePublic[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [socialIndicators, setSocialIndicators] = useState<Record<string, SocialIndicatorUser[]>>({});
  const [optimisticFollowState, setOptimisticFollowState] = useState<Record<string, FollowStatus>>({});
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true);
  const [mutualCount, setMutualCount] = useState(0);
  const hasLoadedFollowing = useRef(false);

  const refreshFollowing = useCallback(async () => {
    if (!hasLoadedFollowing.current) {
      setIsLoadingFollowing(true);
    }
    try {
      const list = await FriendsService.getFollowing();
      setFollowing(list);
      hasLoadedFollowing.current = true;
      refreshMutualCount();
    } catch (error) {
      console.warn('[Friends] refreshFollowing failed:', error);
    } finally {
      setIsLoadingFollowing(false);
    }
  }, [refreshMutualCount]);

  const refreshMutualCount = useCallback(async () => {
    try {
      const { data, error } = await (await import('../config/supabase')).supabase
        .rpc('get_mutual_count');
      if (!error && data !== null) {
        setMutualCount(Number(data));
      }
    } catch {
      // silently fail
    }
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const { data, error } = await (await import('../config/supabase')).supabase
        .rpc('get_pending_request_count');
      if (!error && data !== null) {
        setPendingRequestCount(Number(data));
      }
    } catch (error) {
      console.warn('[Friends] refreshPendingCount failed:', error);
    }
  }, []);

  const follow = useCallback(async (user: UserProfilePublic) => {
    const expectedStatus: FollowStatus = user.profile_private ? 'pending' : 'accepted';
    // Optimistic update
    setOptimisticFollowState((prev) => ({ ...prev, [user.id]: expectedStatus }));
    if (!user.profile_private) {
      setFollowing((prev) => [user, ...prev]);
    }

    try {
      await FriendsService.followUser(user.id);
    } catch (error) {
      // Revert on failure
      setOptimisticFollowState((prev) => ({ ...prev, [user.id]: 'none' }));
      if (!user.profile_private) {
        setFollowing((prev) => prev.filter((u) => u.id !== user.id));
      }
      throw error;
    }
  }, []);

  const unfollow = useCallback(async (userId: string) => {
    const prevState = optimisticFollowState[userId];
    // Optimistic update
    setOptimisticFollowState((prev) => ({ ...prev, [userId]: 'none' }));
    setFollowing((prev) => prev.filter((u) => u.id !== userId));

    try {
      await FriendsService.unfollowUser(userId);
    } catch (error) {
      // Revert on failure
      setOptimisticFollowState((prev) => ({ ...prev, [userId]: prevState ?? 'accepted' }));
      await refreshFollowing();
      throw error;
    }
  }, [optimisticFollowState, refreshFollowing]);

  const fetchSocialIndicators = useCallback(async (googlePlaceIds: string[]) => {
    if (googlePlaceIds.length === 0) return;
    try {
      const indicators = await FriendsService.getSocialIndicators(googlePlaceIds);
      setSocialIndicators(indicators);
    } catch (error) {
      console.warn('[Friends] fetchSocialIndicators failed:', error);
    }
  }, []);

  return (
    <FriendsContext.Provider
      value={{
        following,
        pendingRequestCount,
        socialIndicators,
        optimisticFollowState,
        isLoadingFollowing,
        mutualCount,
        follow,
        unfollow,
        refreshFollowing,
        refreshPendingCount,
        fetchSocialIndicators,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends(): FriendsContextValue {
  return useContext(FriendsContext);
}
