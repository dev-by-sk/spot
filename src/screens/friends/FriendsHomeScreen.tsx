import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import { useFriends } from '../../context/FriendsContext';
import { useDebounce } from '../../hooks/useDebounce';
import * as FriendsService from '../../services/friendsService';
import type { FriendsStackParamList } from '../../navigation/types';
import type { UserWithFollowState, UserProfilePublic, FollowStatus } from '../../types/social';

export function FriendsHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FriendsStackParamList>>();
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const {
    following,
    pendingRequestCount,
    optimisticFollowState,
    isLoadingFollowing,
    mutualCount,
    follow,
    unfollow,
    refreshFollowing,
    refreshPendingCount,
  } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithFollowState[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(searchQuery.trim(), 350);

  useEffect(() => {
    if (isFocused) {
      refreshFollowing();
      refreshPendingCount();
    }
  }, [isFocused, refreshFollowing, refreshPendingCount]);

  useEffect(() => {
    if (debouncedQuery.length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    FriendsService.searchUsers(debouncedQuery)
      .then((results) => {
        if (!controller.signal.aborted) {
          setSearchResults(results);
          setIsSearching(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshFollowing(), refreshPendingCount()]);
    setIsRefreshing(false);
  }, [refreshFollowing, refreshPendingCount]);

  const handleFollow = useCallback(async (user: UserWithFollowState | UserProfilePublic) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await follow(user as UserProfilePublic);
    } catch {
      // error handled in context
    }
  }, [follow]);

  const handleUnfollow = useCallback(async (userId: string) => {
    try {
      await unfollow(userId);
    } catch {
      // error handled in context
    }
  }, [unfollow]);

  const getFollowStatus = useCallback((userId: string, originalStatus?: FollowStatus): FollowStatus => {
    return optimisticFollowState[userId] ?? originalStatus ?? 'none';
  }, [optimisticFollowState]);

  const isSearchActive = searchQuery.trim().length > 0;

  const renderFollowButton = useCallback((user: UserWithFollowState | (UserProfilePublic & { follow_status?: FollowStatus })) => {
    const status = getFollowStatus(user.id, (user as any).follow_status);

    if (status === 'accepted') {
      return (
        <TouchableOpacity
          style={[styles.followPill, { backgroundColor: colors.spotDivider }]}
          onPress={() => handleUnfollow(user.id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.followPillText, { color: colors.spotTextPrimary }]}>Following</Text>
        </TouchableOpacity>
      );
    }
    if (status === 'pending') {
      return (
        <TouchableOpacity
          style={[styles.followPill, { backgroundColor: colors.spotDivider }]}
          onPress={() => handleUnfollow(user.id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.followPillText, { color: colors.spotTextSecondary }]}>Requested</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={[styles.followPill, { backgroundColor: colors.spotEmerald }]}
        onPress={() => handleFollow(user)}
        activeOpacity={0.7}
      >
        <Text style={[styles.followPillText, { color: '#FFFFFF' }]}>Follow</Text>
      </TouchableOpacity>
    );
  }, [getFollowStatus, colors, handleFollow, handleUnfollow]);

  const renderSearchItem = useCallback(({ item }: { item: UserWithFollowState }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => navigation.navigate('FriendProfile', { user: item })}
      activeOpacity={0.7}
    >
      <Avatar username={item.username} displayName={item.display_name} size={40} />
      <View style={styles.userInfo}>
        {item.display_name ? (
          <Text style={[styles.displayName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
            {item.display_name}
          </Text>
        ) : null}
        <Text style={[styles.username, { color: item.display_name ? colors.spotTextSecondary : colors.spotTextPrimary }]} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
      {renderFollowButton(item)}
    </TouchableOpacity>
  ), [navigation, colors, renderFollowButton]);

  const renderFollowingItem = useCallback(({ item }: { item: UserProfilePublic }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => navigation.navigate('FriendProfile', { user: item })}
      activeOpacity={0.7}
    >
      <Avatar username={item.username} displayName={item.display_name} size={40} />
      <View style={styles.userInfo}>
        {item.display_name ? (
          <Text style={[styles.displayName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
            {item.display_name}
          </Text>
        ) : null}
        <Text style={[styles.username, { color: item.display_name ? colors.spotTextSecondary : colors.spotTextPrimary }]} numberOfLines={1}>
          @{item.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.spotTextSecondary} />
    </TouchableOpacity>
  ), [navigation, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.screenTitle, { color: colors.spotTextPrimary }]}>Friends</Text>
        <Text style={[styles.screenTitleCount, { color: colors.spotTextSecondary }]}>
          {mutualCount}
        </Text>
      </View>

      {/* Search bar */}
      <Pressable
        style={[styles.searchBar, { backgroundColor: colors.spotSearchBar }]}
        onPress={() => { if (!searchInputRef.current?.isFocused()) searchInputRef.current?.focus(); }}
      >
        <Ionicons name="search" size={16} color={colors.spotTextSecondary} />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: colors.spotTextPrimary }]}
          placeholder="Search by username..."
          placeholderTextColor={colors.spotTextSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => { setSearchQuery(''); Keyboard.dismiss(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={colors.spotTextSecondary} />
          </TouchableOpacity>
        )}
      </Pressable>

      {isSearchActive ? (
        /* Search results */
        isSearching ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.spotEmerald} />
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={renderSearchItem}
            contentContainerStyle={[styles.listContent, searchResults.length === 0 && { flex: 1 }]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptySearch}>
                <Ionicons name="search-outline" size={36} color={colors.spotTextSecondary} style={{ opacity: 0.4 }} />
                <Text style={[styles.emptyTitle, { color: colors.spotTextPrimary }]}>No users found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}>
                  Try a different username
                </Text>
              </View>
            }
          />
        )
      ) : (
        /* Following list */
        <FlatList
          data={following}
          keyExtractor={(item) => item.id}
          renderItem={renderFollowingItem}
          contentContainerStyle={[styles.listContent, following.length === 0 && { flex: 1 }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.spotEmerald}
            />
          }
          ListHeaderComponent={
            pendingRequestCount > 0 ? (
              <TouchableOpacity
                style={[styles.requestsBanner, { backgroundColor: `${colors.spotEmerald}15` }]}
                onPress={() => navigation.navigate('FollowRequests')}
                activeOpacity={0.7}
              >
                <View style={[styles.requestsBadge, { backgroundColor: colors.spotEmerald }]}>
                  <Text style={styles.requestsBadgeText}>{pendingRequestCount}</Text>
                </View>
                <Text style={[styles.requestsText, { color: colors.spotEmerald }]}>
                  Follow request{pendingRequestCount > 1 ? 's' : ''}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.spotEmerald} />
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            isLoadingFollowing ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.spotEmerald} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.spotEmerald}18` }]}>
                  <Ionicons name="people-outline" size={44} color={colors.spotEmerald} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.spotTextPrimary }]}>No friends yet</Text>
                <Text style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}>
                  Search for friends by username to{'\n'}see their saved spots
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  screenTitle: {
    ...SpotTypography.largeTitle,
  },
  screenTitleCount: {
    ...SpotTypography.title2,
    color: '#6B7280',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    ...SpotTypography.body,
    padding: 0,
  },
  listContent: { paddingVertical: 4 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  userInfo: { flex: 1, gap: 1 },
  displayName: { ...SpotTypography.headline },
  username: { ...SpotTypography.footnote },
  followPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
  followPillText: {
    ...SpotTypography.footnote,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
  },
  requestsBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  requestsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  requestsText: {
    ...SpotTypography.headline,
    flex: 1,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: { ...SpotTypography.title2, textAlign: 'center' },
  emptySubtitle: { ...SpotTypography.body, textAlign: 'center', lineHeight: 24 },
  emptySearch: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
});
