import React, { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFriends } from '../../hooks/useFriends';
import { useSpotColors } from '../../theme/colors';
import { SpotTypography } from '../../theme/typography';
import { Avatar } from '../../components/Avatar';
import * as FriendsService from '../../services/friendsService';
import type { UserWithFollowState } from '../../types/social';
import type { FriendsStackParamList } from '../../navigation/types';

export function FriendsHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FriendsStackParamList>>();
  const { pendingRequestCount, optimisticFollowState, following, follow, unfollow, refreshPendingCount, syncFollowStates } = useFriends();
  const colors = useSpotColors();
  const insets = useSafeAreaInsets();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithFollowState[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => {
    refreshPendingCount();
  }, [refreshPendingCount]));

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      abortRef.current?.abort();
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      try {
        const results = await FriendsService.searchUsers(text.trim(), abortRef.current.signal);
        setSearchResults(results);
        const serverStates: Record<string, import('../../types/social').FollowStatus> = {};
        for (const u of results) serverStates[u.id] = u.follow_status;
        syncFollowStates(serverStates);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, []);

  const handleCloseSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  const handleFollowToggle = useCallback(async (item: UserWithFollowState) => {
    const status = optimisticFollowState[item.id] ?? item.follow_status;
    if (status === 'none') {
      await follow(item).catch(() => {});
    } else {
      await unfollow(item.id).catch(() => {});
    }
  }, [optimisticFollowState, follow, unfollow]);

  return (
    <View style={[styles.container, { backgroundColor: colors.spotBackground, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {showSearch ? (
          <>
            <TextInput
              style={[styles.searchInput, {
                backgroundColor: colors.spotCardBackground,
                color: colors.spotTextPrimary,
                borderColor: colors.spotDivider,
              }]}
              placeholder="Search by username or name..."
              placeholderTextColor={colors.spotTextSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <TouchableOpacity onPress={handleCloseSearch} style={styles.doneButton} activeOpacity={0.7}>
              <Text style={[styles.doneText, { color: colors.spotEmerald }]}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.spotTextPrimary }]}>Friends</Text>
            <TouchableOpacity onPress={() => setShowSearch(true)} activeOpacity={0.7} style={styles.headerIcon}>
              <Ionicons name="person-add-outline" size={22} color={colors.spotTextPrimary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {showSearch ? (
        isSearching && searchResults.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.spotEmerald} />
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={u => u.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              { paddingBottom: insets.bottom + 16 },
              searchResults.length === 0 && styles.listEmpty,
            ]}
            ListEmptyComponent={
              searchQuery.trim() && !isSearching ? (
                <View style={styles.centered}>
                  <Text style={[styles.emptyText, { color: colors.spotTextSecondary }]}>No users found</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const isFollowingUser = following.some(f => f.id === item.id);
              const effectiveStatus = optimisticFollowState[item.id] ?? (isFollowingUser ? 'accepted' : item.follow_status);
              const isFollowing = effectiveStatus !== 'none';
              return (
                <View style={[styles.resultRow, { borderBottomColor: colors.spotDivider }]}>
                  <Avatar username={item.username} displayName={item.display_name} size={44} />
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultName, { color: colors.spotTextPrimary }]} numberOfLines={1}>
                      {item.display_name ?? item.username}
                    </Text>
                    <Text style={[styles.resultUsername, { color: colors.spotTextSecondary }]} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleFollowToggle(item)}
                    activeOpacity={0.7}
                    style={[
                      styles.followPill,
                      isFollowing
                        ? { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider, borderWidth: StyleSheet.hairlineWidth }
                        : { backgroundColor: colors.spotEmerald },
                    ]}
                  >
                    <Text style={[styles.followPillText, { color: isFollowing ? colors.spotTextSecondary : '#fff' }]}>
                      {effectiveStatus === 'accepted' ? 'Following' : effectiveStatus === 'pending' ? 'Requested' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : (
        <>
          {pendingRequestCount > 0 && (
            <TouchableOpacity
              style={[styles.requestsBanner, { backgroundColor: colors.spotCardBackground, borderColor: colors.spotDivider }]}
              onPress={() => navigation.navigate('FollowRequests')}
              activeOpacity={0.7}
            >
              <View style={[styles.badge, { backgroundColor: colors.spotEmerald }]}>
                <Text style={styles.badgeText}>{pendingRequestCount}</Text>
              </View>
              <Text style={[styles.requestsLabel, { color: colors.spotTextPrimary }]}>Follow Requests</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.spotTextSecondary} />
            </TouchableOpacity>
          )}

          <View style={[styles.emptyState, { paddingBottom: 60 }]}>
            <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.spotEmerald}18` }]}>
              <Ionicons name="people-outline" size={44} color={colors.spotEmerald} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.spotTextPrimary }]}>Find people to follow</Text>
            <Text style={[styles.emptySubtitle, { color: colors.spotTextSecondary }]}>
              Search for friends to see what spots they're saving
            </Text>
            <TouchableOpacity
              onPress={() => setShowSearch(true)}
              activeOpacity={0.7}
              style={[styles.findFriendsButton, { backgroundColor: colors.spotEmerald }]}
            >
              <Text style={styles.findFriendsText}>Find friends</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  title: {
    ...SpotTypography.largeTitle,
    flex: 1,
  },
  headerIcon: {
    padding: 4,
  },
  searchInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    ...SpotTypography.body,
  },
  doneButton: {
    paddingVertical: 8,
    paddingLeft: 4,
  },
  doneText: {
    ...SpotTypography.body,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  requestsLabel: {
    ...SpotTypography.body,
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    ...SpotTypography.title2,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...SpotTypography.body,
    textAlign: 'center',
    lineHeight: 24,
  },
  findFriendsButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  findFriendsText: {
    ...SpotTypography.headline,
    color: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
  },
  emptyText: {
    ...SpotTypography.body,
  },
  listEmpty: { flex: 1 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultInfo: { flex: 1 },
  resultName: { ...SpotTypography.headline },
  resultUsername: { ...SpotTypography.footnote },
  followPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  followPillText: {
    ...SpotTypography.footnote,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
