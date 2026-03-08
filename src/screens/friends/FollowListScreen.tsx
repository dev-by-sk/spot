import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FriendsService from '../../services/friendsService';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../hooks/useAuth';
import { useFriends } from '../../hooks/useFriends';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import type { UserProfilePublic } from '../../types/social';
import type { ProfileStackParamList } from '../../navigation/types';

type Tab = 'followers' | 'following';

export function FollowListScreen() {
  const route = useRoute<RouteProp<ProfileStackParamList, 'FollowList'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { userId, initialTab = 'followers' } = route.params;
  const { currentUserId } = useAuth();
  const { optimisticFollowState, follow, syncFollowStates } = useFriends();
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();
  const isSelf = userId === currentUserId;
  const [followingBackId, setFollowingBackId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [followers, setFollowers] = useState<UserProfilePublic[]>([]);
  const [following, setFollowing] = useState<UserProfilePublic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isSelf) {
        const [f, fg] = await Promise.all([
          FriendsService.getFollowers(),
          FriendsService.getFollowing(),
        ]);
        setFollowers(f);
        setFollowing(fg);
        // Sync optimistic state against fresh server data
        const serverStates: Record<string, import('../../types/social').FollowStatus> = {};
        for (const u of fg) serverStates[u.id] = 'accepted';
        for (const u of f) if (!serverStates[u.id]) serverStates[u.id] = 'none';
        syncFollowStates(serverStates);
      } else {
        const [f, fg] = await Promise.all([
          FriendsService.getUserFollowers(userId),
          FriendsService.getUserFollowing(userId),
        ]);
        setFollowers(f);
        setFollowing(fg);
      }
    } catch (e) {
      console.warn('[FollowList] load failed:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId, isSelf, syncFollowStates]);

  useEffect(() => { load(); }, [load]);


  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    load();
  }, [load]);

  const handleFollowBack = useCallback(async (user: UserProfilePublic, isPending: boolean) => {
    setFollowingBackId(user.id);
    try {
      if (isPending) {
        await FriendsService.unfollowUser(user.id);
        // Clear the optimistic state manually since we're not using context unfollow
        syncFollowStates({ [user.id]: 'none' });
      } else {
        await follow(user);
      }
    } catch {
      // silent
    } finally {
      setFollowingBackId(null);
    }
  }, [follow, syncFollowStates]);

  const data = activeTab === 'followers' ? followers : following;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={28} color={colors.spotTextPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.spotEmerald} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={28} color={colors.spotTextPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.spotTextPrimary }]}>
          {activeTab === 'followers' ? 'Followers' : 'Following'}
        </Text>
        <View style={styles.backButton} />
      </View>
      <View style={[styles.segmentedRow, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}>
        {(['followers', 'following'] as Tab[]).map(tab => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.segment, active && { backgroundColor: colors.spotEmerald }]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentLabel, { color: active ? '#fff' : colors.spotTextSecondary }]}>
                {tab === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <Text style={[styles.segmentCount, { color: active ? '#ffffffaa' : colors.spotTextSecondary + '88' }]}>
                {tab === 'followers' ? followers.length : following.length}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={data}
        keyExtractor={u => u.id}
        onRefresh={handleRefresh}
        refreshing={isRefreshing}
        contentContainerStyle={[
          { flexGrow: 1, paddingBottom: insets.bottom + 16 },
          data.length === 0 && styles.listEmpty,
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>
              {activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.spotDivider }]}>
            <Avatar username={item.username} displayName={item.display_name} size={44} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.spotTextPrimary }]} numberOfLines={1}>
                {item.display_name ?? item.username}
              </Text>
              <Text style={[styles.username, { color: colors.spotTextSecondary }]} numberOfLines={1}>
                @{item.username}
              </Text>
            </View>
            {isSelf && activeTab === 'followers' && (() => {
              const optimistic = optimisticFollowState[item.id];
              const isFollowingBack = optimistic === 'accepted' || (!optimistic && following.some(f => f.id === item.id));
              const isPending = optimistic === 'pending';
              if (isFollowingBack) return null;
              if (followingBackId === item.id) return <ActivityIndicator size="small" color={colors.spotEmerald} />;
              return (
                <TouchableOpacity
                  onPress={() => handleFollowBack(item, isPending)}
                  activeOpacity={0.7}
                  style={[styles.pill, isPending
                    ? { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider, borderWidth: StyleSheet.hairlineWidth }
                    : { backgroundColor: colors.spotEmerald }
                  ]}
                >
                  <Text style={[styles.pillText, { color: isPending ? colors.spotTextSecondary : '#fff' }]}>
                    {isPending ? 'Requested' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backButton: {
    padding: 4,
    width: 36,
  },
  headerTitle: {
    ...SpotTypography.headline,
    flex: 1,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  segmentedRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segmentLabel: {
    ...SpotTypography.footnote,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  segmentCount: {
    ...SpotTypography.caption,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1 },
  name: { ...SpotTypography.headline },
  username: { ...SpotTypography.footnote },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pillText: {
    ...SpotTypography.footnote,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  listEmpty: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 48 },
  emptyText: { ...SpotTypography.body },
});
