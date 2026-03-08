import React, { createContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../config/supabase';
import * as FriendsService from '../services/friendsService';
import type { UserProfilePublic, FollowStatus } from '../types/social';

export interface FriendsContextValue {
  pendingRequestCount: number;
  optimisticFollowState: Record<string, FollowStatus>;
  following: UserProfilePublic[];
  follow: (user: UserProfilePublic) => Promise<void>;
  unfollow: (userId: string) => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  refreshFollowing: () => Promise<void>;
  syncFollowStates: (serverStates: Record<string, FollowStatus>) => void;
}

export const FriendsContext = createContext<FriendsContextValue>({
  pendingRequestCount: 0,
  optimisticFollowState: {},
  following: [],
  follow: async () => {},
  unfollow: async () => {},
  refreshPendingCount: async () => {},
  refreshFollowing: async () => {},
  syncFollowStates: () => {},
});

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [optimisticFollowState, setOptimisticFollowState] = useState<Record<string, FollowStatus>>({});
  const [following, setFollowing] = useState<UserProfilePublic[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Mirror auth state without depending on AuthContext to keep providers decoupled
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
      setCurrentUserId(data.session?.user.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
      setCurrentUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshPendingCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data, error } = await supabase.rpc('get_pending_request_count');
      if (!error && data !== null) setPendingRequestCount(Number(data));
    } catch {
      // silent
    }
  }, [isAuthenticated]);

  const refreshFollowing = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const result = await FriendsService.getFollowing();
      setFollowing(result);
    } catch {
      // silent
    }
  }, [isAuthenticated]);

  const follow = useCallback(async (user: UserProfilePublic) => {
    setOptimisticFollowState(prev => ({ ...prev, [user.id]: 'pending' }));
    try {
      const status = await FriendsService.followUser(user.id);
      setOptimisticFollowState(prev => ({ ...prev, [user.id]: status }));
      if (status === 'accepted') {
        setFollowing(prev => [...prev, user]);
      }
    } catch {
      setOptimisticFollowState(prev => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
      throw new Error('Failed to follow user');
    }
  }, []);

  const syncFollowStates = useCallback((serverStates: Record<string, FollowStatus>) => {
    setOptimisticFollowState(prev => {
      const next = { ...prev };
      for (const [id, serverStatus] of Object.entries(serverStates)) {
        if (serverStatus === 'none' && next[id]) {
          // Request was rejected/cancelled — clear stale optimistic state
          delete next[id];
        } else if (serverStatus === 'accepted' && next[id] === 'pending') {
          // Request was accepted — promote from pending to accepted
          next[id] = 'accepted';
        }
      }
      return next;
    });
  }, []);

  const unfollow = useCallback(async (userId: string) => {
    setOptimisticFollowState(prev => ({ ...prev, [userId]: 'none' }));
    try {
      await FriendsService.unfollowUser(userId);
      setFollowing(prev => prev.filter(u => u.id !== userId));
    } catch {
      setOptimisticFollowState(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      throw new Error('Failed to unfollow user');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentUserId) {
      refreshPendingCount();
      refreshFollowing();
    } else {
      setPendingRequestCount(0);
      setFollowing([]);
      setOptimisticFollowState({});
    }
  }, [isAuthenticated, currentUserId, refreshPendingCount, refreshFollowing]);

  return (
    <FriendsContext.Provider value={{
      pendingRequestCount,
      optimisticFollowState,
      following,
      follow,
      unfollow,
      refreshPendingCount,
      refreshFollowing,
      syncFollowStates,
    }}>
      {children}
    </FriendsContext.Provider>
  );
}
